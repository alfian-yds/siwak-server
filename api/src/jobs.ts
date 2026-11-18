/** Pekerjaan latar di dalam proses server (TRD §13). */
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "./db/client.js";
import { activityLogs, announcements, deviceCommands, deviceEvents, devices, media, pairingCodes, sessions } from "./db/schema.js";
import { COMMAND_TTL_MS, ONLINE_WINDOW_MS } from "./routes/admin-devices.js";
import { deleteMedia, isMediaReferenced } from "./services/media.js";
import type { WeatherService } from "./services/weather.js";

const DAY = 24 * 3600_000;

/** Tiap menit: kode pairing kedaluwarsa, perintah kedaluwarsa, TV yang menjadi offline. */
export async function runMaintenance(db: Db, now = new Date()): Promise<{ offline: number; expiredCommands: number }> {
  await db
    .update(pairingCodes)
    .set({ activeCode: null })
    .where(and(isNotNull(pairingCodes.activeCode), lt(pairingCodes.expiresAt, now)));

  const [cmd] = await db
    .update(deviceCommands)
    .set({ status: "expired", finishedAt: now })
    .where(and(inArray(deviceCommands.status, ["pending", "delivered"]), lt(deviceCommands.createdAt, new Date(now.getTime() - COMMAND_TTL_MS))));

  const goneOffline = await db
    .select({ id: devices.id, lastSeenAt: devices.lastSeenAt })
    .from(devices)
    .where(and(eq(devices.isOnline, true), lt(devices.lastSeenAt, new Date(now.getTime() - ONLINE_WINDOW_MS))));
  if (goneOffline.length) {
    await db.update(devices).set({ isOnline: false }).where(inArray(devices.id, goneOffline.map((d) => d.id)));
    await db.insert(deviceEvents).values(goneOffline.map((d) => ({ deviceId: d.id, type: "offline" as const, detail: { lastSeenAt: d.lastSeenAt } })));
  }
  return { offline: goneOffline.length, expiredCommands: cmd.affectedRows };
}

export interface RetentionResult {
  activityLogs: number;
  deviceEvents: number;
  deviceCommands: number;
  sessions: number;
  pairingCodes: number;
  announcements: number;
  media: number;
}

/**
 * Harian: buang data lama sesuai Backend Schema §3.6. Media dihapus bila diunggah lebih dari 30 hari
 * lalu dan saat ini tidak dirujuk konten atau pengaturan mana pun; berkasnya ikut dihapus.
 */
export async function runRetention(db: Db, mediaDir: string, now = new Date()): Promise<RetentionResult> {
  const before = (days: number) => new Date(now.getTime() - days * DAY);
  const n = (r: [{ affectedRows: number }, unknown]) => r[0].affectedRows;
  const result: RetentionResult = {
    activityLogs: n(await db.delete(activityLogs).where(lt(activityLogs.at, before(365)))),
    deviceEvents: n(await db.delete(deviceEvents).where(lt(deviceEvents.at, before(90)))),
    deviceCommands: n(await db.delete(deviceCommands).where(lt(deviceCommands.createdAt, before(30)))),
    sessions: n(await db.delete(sessions).where(lt(sessions.expiresAt, now))),
    pairingCodes: n(await db.delete(pairingCodes).where(lt(pairingCodes.expiresAt, before(1)))),
    announcements: n(await db.delete(announcements).where(lt(announcements.expiresAt, before(90)))),
    media: 0,
  };
  const oldMedia = await db.select({ id: media.id, sha256: media.sha256 }).from(media).where(lt(media.createdAt, before(30)));
  for (const m of oldMedia) {
    if (await isMediaReferenced(db, m.id)) continue;
    await deleteMedia(db, mediaDir, m);
    result.media++;
  }
  return result;
}

/** Menjalankan semua pekerjaan; mengembalikan fungsi untuk menghentikannya. */
export function startJobs(db: Db, weather: WeatherService, log: FastifyBaseLogger, mediaDir: string): () => void {
  const safe = (name: string, fn: () => Promise<unknown>) => () => {
    fn().catch((err) => log.error({ err }, `pekerjaan ${name} gagal`));
  };
  const maintenance = safe("pemeliharaan", () => runMaintenance(db));
  const weatherJob = safe("cuaca", async () => {
    const n = await weather.refreshActive();
    log.info({ cells: n }, "cuaca diperbarui");
  });
  let lastRetentionDay = "";
  const retention = safe("retensi", async () => {
    // Sekali sehari sekitar pukul 02.00 WIB.
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const day = `${get("year")}-${get("month")}-${get("day")}`;
    if (get("hour") !== "02" || day === lastRetentionDay) return;
    lastRetentionDay = day;
    const removed = await runRetention(db, mediaDir);
    log.info({ removed }, "retensi data selesai");
  });

  const timers = [
    setInterval(maintenance, 60_000),
    setInterval(weatherJob, 30 * 60_000),
    setInterval(retention, 10 * 60_000),
    setTimeout(weatherJob, 15_000),
  ];
  return () => timers.forEach((t) => clearTimeout(t));
}
