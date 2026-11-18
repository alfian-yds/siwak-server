/**
 * Rute untuk aplikasi TV (`/api/v1`, TRD §6–§8, §12.1).
 * Selain pairing, semua rute memakai header `Authorization: Device <kunci>`.
 */
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { appState, deviceCommands, deviceEvents, devices, media, mosques, pairingCodes, weatherCache } from "../db/schema.js";
import { HttpError, parse } from "../http.js";
import { buildBundle } from "../services/bundle.js";
import { buildBundleContent } from "../services/bundle-content.js";
import { newDeviceToken, randomDigits, sha256Hex } from "../services/device-secrets.js";
import { mediaPath } from "../services/media.js";
import { type WeatherService, cellKeyOf } from "../services/weather.js";
import { loadSettings } from "./admin-settings.js";
import { COMMAND_TTL_MS } from "./admin-devices.js";

/** Versi aplikasi TV terendah yang masih didukung rute ini (TRD §7.3). */
export const MIN_APP_VERSION = "2.0.0-alpha";
export const PAIRING_TTL_MS = 10 * 60_000;
/** Selisih jam TV yang dianggap bermasalah (F-TV-16). */
export const CLOCK_DRIFT_WARN_SEC = 60;

type DeviceRow = typeof devices.$inferSelect;
declare module "fastify" {
  interface FastifyRequest {
    device: DeviceRow | null;
  }
}

const isoDate = z.string().datetime({ offset: true });

const pairingStart = z.object({
  nonce: z.string().min(16, "nonce terlalu pendek").max(128),
  appVersion: z.string().max(20).optional(),
  model: z.string().max(80).optional(),
});
const pairingParams = z.object({ id: z.string().uuid() });
const pairingQuery = z.object({ nonce: z.string().min(16).max(128) });

const heartbeatBody = z.object({
  appVersion: z.string().max(20),
  configVersion: z.number().int().nonnegative().nullable().optional(),
  contentVersion: z.number().int().nonnegative().nullable().optional(),
  weatherStamp: z.string().max(40).nullable().optional(),
  deviceTime: isoDate,
  health: z.object({ lastError: z.string().max(300).nullable().optional(), freeStorageMb: z.number().nonnegative().optional() }).optional(),
  app: z
    .object({ foreground: z.boolean(), since: isoDate.nullable().optional(), canOpenApp: z.boolean().optional() })
    .optional(),
  commandResults: z
    .array(z.object({ id: z.string().uuid(), ok: z.boolean(), message: z.string().max(200).nullable().optional() }))
    .max(20)
    .optional(),
});


export async function deviceApiRoutes(
  app: FastifyInstance,
  { db, weather, config }: { db: Db; weather: WeatherService; config: Config },
): Promise<void> {
  app.decorateRequest("device", null);

  const requireDevice = async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization ?? "";
    const m = /^Device ([A-Za-z0-9_-]{43})$/.exec(header);
    const [device] = m
      ? await db
          .select()
          .from(devices)
          .where(and(eq(devices.tokenHash, sha256Hex(m[1]!)), isNull(devices.revokedAt)))
          .limit(1)
      : [];
    if (!device) {
      return reply.code(401).send({ error: { code: "device_unknown", message: "TV tidak terdaftar atau sudah dilepas dari server." } });
    }
    req.device = device;
  };
  // Batas laju per TV; heartbeat normal hanya 1/menit.
  const deviceLimit = { rateLimit: { max: 30, timeWindow: "1 minute", keyGenerator: (req: FastifyRequest) => req.headers.authorization ?? req.ip } };

  // ---- Pairing (tanpa kunci perangkat) ---------------------------------------------

  app.post("/api/v1/pairing", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const input = parse(pairingStart, req.body);
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    // Kode harus unik di antara kode yang masih aktif; ulangi bila bentrok (sangat jarang).
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomDigits(8);
      try {
        await db.insert(pairingCodes).values({
          id,
          code,
          activeCode: code,
          nonceHash: sha256Hex(input.nonce),
          appVersion: input.appVersion ?? null,
          model: input.model ?? null,
          expiresAt,
          createdIp: req.ip.slice(0, 45),
        });
        return reply.code(201).send({ pairingId: id, code, expiresAt: expiresAt.toISOString() });
      } catch (err) {
        if ((err as { cause?: { code?: string } }).cause?.code !== "ER_DUP_ENTRY" && (err as { code?: string }).code !== "ER_DUP_ENTRY") throw err;
      }
    }
    throw new HttpError(503, "busy", "Server sibuk. Coba lagi sebentar.");
  });

  app.get("/api/v1/pairing/:id", { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } }, async (req) => {
    const { id } = parse(pairingParams, req.params);
    const { nonce } = parse(pairingQuery, req.query);
    const [p] = await db.select().from(pairingCodes).where(eq(pairingCodes.id, id)).limit(1);
    // nonce salah diperlakukan sama dengan tidak ada, agar tidak membocorkan apa pun.
    if (!p || p.nonceHash !== sha256Hex(nonce)) throw new HttpError(404, "pairing_not_found", "Kode tidak ditemukan.");

    if (!p.claimedAt) {
      if (p.expiresAt.getTime() <= Date.now()) return { status: "expired" };
      return { status: "pending", code: p.code, expiresAt: p.expiresAt.toISOString() };
    }
    if (!p.deviceId || p.tokenDeliveredAt) return { status: "expired" };

    // Kunci perangkat dibuat dan dikirim tepat sekali, hanya ke pemegang nonce.
    const token = newDeviceToken();
    const delivered = await db.transaction(async (tx) => {
      const [res] = await tx
        .update(pairingCodes)
        .set({ tokenDeliveredAt: new Date() })
        .where(and(eq(pairingCodes.id, p.id), isNull(pairingCodes.tokenDeliveredAt)));
      if (res.affectedRows !== 1) return false;
      const [upd] = await tx
        .update(devices)
        .set({ tokenHash: sha256Hex(token) })
        .where(and(eq(devices.id, p.deviceId!), isNull(devices.revokedAt)));
      return upd.affectedRows === 1;
    });
    if (!delivered) return { status: "expired" };
    return { status: "claimed", deviceId: p.deviceId, deviceToken: token };
  });

  // ---- Rute TV terhubung -------------------------------------------------------------

  app.post("/api/v1/device/heartbeat", { preHandler: requireDevice, config: deviceLimit }, async (req) => {
    const hb = parse(heartbeatBody, req.body);
    const device = req.device!;
    const now = new Date();
    // Kueri yang tidak saling bergantung dijalankan bersamaan (uji beban 200 TV, tugas 3.6).
    const [[mosque], [state], pending] = await Promise.all([
      db.select().from(mosques).where(eq(mosques.id, device.mosqueId)),
      db.select().from(appState).limit(1),
      db
        .select({ id: deviceCommands.id, type: deviceCommands.type })
        .from(deviceCommands)
        .where(
          and(
            eq(deviceCommands.deviceId, device.id),
            eq(deviceCommands.status, "pending"),
            gt(deviceCommands.createdAt, new Date(now.getTime() - COMMAND_TTL_MS)),
          ),
        )
        .orderBy(asc(deviceCommands.createdAt)),
    ]);

    const driftSec = Math.round((new Date(hb.deviceTime).getTime() - now.getTime()) / 1000);
    const events: { type: (typeof deviceEvents.$inferInsert)["type"]; detail?: unknown }[] = [];
    if (!device.isOnline) events.push({ type: "online" });
    if (Math.abs(driftSec) > CLOCK_DRIFT_WARN_SEC && Math.abs(device.clockDriftSec ?? 0) <= CLOCK_DRIFT_WARN_SEC) {
      events.push({ type: "clock_drift", detail: { driftSec } });
    }
    if (device.appVersion && device.appVersion !== hb.appVersion) {
      events.push({ type: "updated", detail: { from: device.appVersion, to: hb.appVersion } });
    }
    // Galat dari TV: dicatat di riwayat hanya saat pesannya berubah, agar tidak berulang tiap menit.
    const reportedError = hb.health?.lastError?.slice(0, 300) || null;
    if (reportedError && reportedError !== device.lastError) events.push({ type: "error", detail: { message: reportedError } });
    // Versi pengaturan yang dilaporkan = versi yang sudah diterapkan TV (TV melapor segera setelah menerapkan).
    const reportedConfig = hb.configVersion ?? null;
    const configApplied = reportedConfig !== null && reportedConfig !== device.lastConfigVersion;

    // Status tampil/latar belakang (F-TV-18).
    let appState_: Partial<typeof devices.$inferInsert> = {};
    if (hb.app) {
      const changed = device.appForeground !== hb.app.foreground;
      if (changed && device.appForeground !== null) events.push({ type: hb.app.foreground ? "app_foreground" : "app_background" });
      const since = hb.app.since ? new Date(hb.app.since) : changed ? now : (device.appStateSince ?? now);
      appState_ = {
        appForeground: hb.app.foreground,
        appStateSince: since.getTime() > now.getTime() + 5 * 60_000 ? now : since, // abaikan jam TV yang jauh di depan
        canOpenApp: hb.app.canOpenApp ?? device.canOpenApp,
      };
    }

    // Hasil perintah sebelumnya.
    for (const r of hb.commandResults ?? []) {
      const [res] = await db
        .update(deviceCommands)
        .set({ status: r.ok ? "done" : "failed", finishedAt: now, result: r.message?.slice(0, 200) ?? null })
        .where(
          and(eq(deviceCommands.id, r.id), eq(deviceCommands.deviceId, device.id), inArray(deviceCommands.status, ["pending", "delivered"])),
        );
      if (res.affectedRows === 1) events.push({ type: "command", detail: { id: r.id, ok: r.ok, message: r.message ?? null } });
    }

    const cellKey = cellKeyOf(mosque!.latitude, mosque!.longitude);
    const [, , , weatherRows] = await Promise.all([
      db
        .update(devices)
        .set({
          lastSeenAt: now,
          isOnline: true,
          appVersion: hb.appVersion,
          lastConfigVersion: hb.configVersion ?? null,
          lastContentVersion: hb.contentVersion ?? null,
          clockDriftSec: driftSec,
          ...(configApplied && { configAppliedAt: now }),
          lastError: reportedError,
          lastErrorAt: reportedError ? (reportedError === device.lastError ? device.lastErrorAt : now) : null,
          ...appState_,
        })
        .where(eq(devices.id, device.id)),
      // Perintah baru untuk TV ini ditandai terkirim.
      pending.length
        ? db
            .update(deviceCommands)
            .set({ status: "delivered", deliveredAt: now })
            .where(inArray(deviceCommands.id, pending.map((p) => p.id)))
        : null,
      events.length ? db.insert(deviceEvents).values(events.map((e) => ({ deviceId: device.id, type: e.type, detail: e.detail ?? null }))) : null,
      db.select({ fetchedAt: weatherCache.fetchedAt }).from(weatherCache).where(eq(weatherCache.cellKey, cellKey)).limit(1),
    ]);
    const w = weatherRows[0];
    if (!w) weather.ensure(cellKey);

    return {
      configVersion: mosque!.configVersion,
      contentVersion: state?.contentVersion ?? 1,
      weatherStamp: w?.fetchedAt.toISOString() ?? null,
      serverTime: now.toISOString(),
      minAppVersion: MIN_APP_VERSION,
      commands: pending,
    };
  });

  app.get("/api/v1/device/bundle", { preHandler: requireDevice, config: deviceLimit }, async (req) => {
    const d = req.device!;
    const bundle = await buildBundle(db, d.mosqueId, { id: d.id, name: d.name, pinSalt: d.pinSalt, pinHash: d.pinHash });
    // Konten "Informasi" (rc.5) belum dikenali TV versi lama dan akan tampil sebagai panel kosong: jangan dikirim.
    if (!supportsInfoTeks(d.appVersion)) {
      const drop = new Set(bundle.content.filter((c) => c.type === "info_teks").map((c) => c.id));
      if (drop.size) return { ...bundle, content: bundle.content.filter((c) => !drop.has(c.id)), slides: bundle.slides.filter((sl) => !drop.has(sl.contentId)) };
    }
    return bundle;
  });

  app.get("/api/v1/device/weather", { preHandler: requireDevice, config: deviceLimit }, async (req) => {
    const [mosque] = await db.select().from(mosques).where(eq(mosques.id, req.device!.mosqueId));
    const cellKey = cellKeyOf(mosque!.latitude, mosque!.longitude);
    const [w] = await db.select().from(weatherCache).where(eq(weatherCache.cellKey, cellKey)).limit(1);
    if (!w) {
      weather.ensure(cellKey);
      throw new HttpError(404, "weather_unavailable", "Data cuaca belum tersedia.");
    }
    await db.update(weatherCache).set({ lastRequestedAt: new Date() }).where(eq(weatherCache.cellKey, cellKey));
    return w.payload;
  });

  /** Unduh media (TRD §7.2). Hanya media yang dirujuk bundle TV ini yang boleh diambil. */
  app.get("/api/v1/device/media/:id", { preHandler: requireDevice, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const device = req.device!;
    const { settings } = await loadSettings(db, device.mosqueId);
    const allowed = new Set((await buildBundleContent(db, device.mosqueId, settings)).media.map((m) => m.id));
    if (!allowed.has(id)) throw new HttpError(404, "not_found", "Media tidak ditemukan.");
    const [m] = await db.select().from(media).where(eq(media.id, id)).limit(1);
    const path = m ? mediaPath(config.MEDIA_DIR, m.sha256) : "";
    if (!m || !existsSync(path)) throw new HttpError(404, "not_found", "Berkas media tidak ditemukan.");
    return reply
      .type(m.mime)
      .header("Content-Length", m.bytes)
      .header("X-Content-SHA256", m.sha256)
      .header("Cache-Control", "private, max-age=31536000, immutable")
      .send(createReadStream(path));
  });

  /** TV melepaskan dirinya sendiri (menu "Lepas dari server" di TV). */
  app.post("/api/v1/device/unpair", { preHandler: requireDevice, config: deviceLimit }, async (req) => {
    const device = req.device!;
    await db.update(devices).set({ tokenHash: null, revokedAt: new Date(), isOnline: false }).where(eq(devices.id, device.id));
    await db.insert(deviceEvents).values({ deviceId: device.id, type: "unpaired", detail: { by: "tv" } });
    return { ok: true };
  });
}

/** TV versi 2.0.0-rc.5 ke atas mengenali konten "Informasi" (info_teks). Versi tidak diketahui dianggap lama. */
export function supportsInfoTeks(version: string | null | undefined): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?/.exec(version ?? "");
  if (!m) return false;
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (maj !== 2 || min !== 0 || pat !== 0) return maj > 2 || (maj === 2 && (min > 0 || pat > 0));
  return m[4] === undefined || Number(m[4]) >= 5;
}
