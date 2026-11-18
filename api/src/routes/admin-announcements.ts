/** Pengumuman segera (F-ADM-10, App Flow §4.7). Tampil sebagai banner di TV (F-TV-11). */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMosqueRole } from "../auth/access.js";
import type { Db } from "../db/client.js";
import { ANNOUNCEMENT_MAX_CHARS, announcements, devices, users } from "../db/schema.js";
import { HttpError, notFound, parse } from "../http.js";
import { audit } from "../services/audit.js";
import { bumpConfigVersion } from "./admin-settings.js";

/** Masa tayang paling lama untuk satu pengumuman. */
export const ANNOUNCEMENT_MAX_DAYS = 30;
const DAY = 24 * 3600_000;

const presets = { "30m": 30, "1h": 60, "2h": 120 } as const;
const mosqueParam = z.object({ id: z.string().uuid("id masjid tidak sah") });
const annParam = z.object({ id: z.string().uuid("id pengumuman tidak sah") });
const createBody = z
  .object({
    text: z
      .string()
      .transform((s) => s.replace(/\s+/g, " ").trim())
      .pipe(z.string().min(1, "isi pengumuman wajib diisi").max(ANNOUNCEMENT_MAX_CHARS, `maksimal ${ANNOUNCEMENT_MAX_CHARS} karakter`)),
    deviceId: z.string().uuid("pilih TV").nullable(),
    /** Pilihan cepat; "today" = sampai pukul 24.00 waktu masjid. */
    duration: z.enum(["30m", "1h", "2h", "today"]).optional(),
    /** Pilih sendiri (bila `duration` kosong). */
    expiresAt: z.string().datetime({ offset: true, message: "waktu selesai tidak sah" }).optional(),
  })
  .strict()
  .refine((b) => (b.duration ? !b.expiresAt : Boolean(b.expiresAt)), { message: "pilih masa tayang", path: ["duration"] });

/** Saat pukul 00.00 berikutnya di zona waktu `tz`, sebagai waktu UTC. */
export function nextMidnight(now: Date, tz: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  // Selisih zona = waktu dinding sebagai UTC dikurangi waktu sebenarnya (tanpa milidetik).
  const wallAsUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  const offset = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year!, parts.month! - 1, parts.day! + 1) - offset);
}

type AnnRow = typeof announcements.$inferSelect;

export async function adminAnnouncementRoutes(app: FastifyInstance, { db }: { db: Db }): Promise<void> {
  const dto = (a: AnnRow, extra: { deviceName: string | null; createdBy: string | null }, now: number) => ({
    id: a.id,
    text: a.text,
    deviceId: a.deviceId,
    deviceName: extra.deviceName,
    startsAt: a.startsAt,
    expiresAt: a.expiresAt,
    revokedAt: a.revokedAt,
    createdAt: a.createdAt,
    createdBy: extra.createdBy,
    active: !a.revokedAt && a.expiresAt.getTime() > now,
  });

  /** Pengumuman aktif, ditambah yang selesai dalam 7 hari terakhir (maks. 20). */
  app.get("/api/admin/mosques/:id/announcements", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    await requireMosqueRole(db, req, id, "operator");
    const now = new Date();
    const select = () =>
      db
        .select({ a: announcements, deviceName: devices.name, createdBy: users.name, createdByEmail: users.email })
        .from(announcements)
        .leftJoin(devices, eq(devices.id, announcements.deviceId))
        .leftJoin(users, eq(users.id, announcements.createdBy));
    const active = await select()
      .where(and(eq(announcements.mosqueId, id), isNull(announcements.revokedAt), gt(announcements.expiresAt, now)))
      .orderBy(announcements.startsAt);
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const recent = await select()
      .where(
        and(
          eq(announcements.mosqueId, id),
          or(
            and(isNotNull(announcements.revokedAt), gt(announcements.revokedAt, weekAgo)),
            and(lte(announcements.expiresAt, now), gt(announcements.expiresAt, weekAgo)),
          ),
        ),
      )
      .orderBy(desc(announcements.createdAt))
      .limit(20);
    const map = (r: { a: AnnRow; deviceName: string | null; createdBy: string | null; createdByEmail: string | null }) =>
      dto(r.a, { deviceName: r.deviceName, createdBy: r.createdBy ?? r.createdByEmail }, now.getTime());
    return { active: active.map(map), recent: recent.map(map) };
  });

  app.post("/api/admin/mosques/:id/announcements", { preHandler: app.requireApiAuth }, async (req, reply) => {
    const { id } = parse(mosqueParam, req.params);
    const { mosque } = await requireMosqueRole(db, req, id, "operator");
    const input = parse(createBody, req.body);
    const now = new Date();

    let deviceName: string | null = null;
    if (input.deviceId) {
      const [d] = await db
        .select({ name: devices.name })
        .from(devices)
        .where(and(eq(devices.id, input.deviceId), eq(devices.mosqueId, id), isNull(devices.revokedAt)))
        .limit(1);
      if (!d) throw new HttpError(400, "validation", "Ada isian yang belum benar.", { deviceId: "TV tidak ditemukan di masjid ini" });
      deviceName = d.name;
    }

    let expiresAt: Date;
    if (input.duration === "today") expiresAt = nextMidnight(now, mosque.timezone);
    else if (input.duration) expiresAt = new Date(now.getTime() + presets[input.duration] * 60_000);
    else expiresAt = new Date(input.expiresAt!);
    if (expiresAt.getTime() < now.getTime() + 60_000) {
      throw new HttpError(400, "validation", "Ada isian yang belum benar.", { expiresAt: "waktu selesai harus setelah sekarang" });
    }
    if (expiresAt.getTime() > now.getTime() + ANNOUNCEMENT_MAX_DAYS * DAY) {
      throw new HttpError(400, "validation", "Ada isian yang belum benar.", { expiresAt: `masa tayang maksimal ${ANNOUNCEMENT_MAX_DAYS} hari` });
    }

    const annId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(announcements).values({
        id: annId,
        mosqueId: id,
        deviceId: input.deviceId,
        text: input.text,
        startsAt: now,
        expiresAt,
        createdBy: req.auth!.user.id,
      });
      await bumpConfigVersion(tx, id);
    });
    await audit(db, {
      userId: req.auth!.user.id,
      mosqueId: id,
      action: "announcement.create",
      entity: "announcement",
      entityId: annId,
      diff: { new: { text: input.text, target: deviceName ?? "Semua TV", expiresAt: expiresAt.toISOString() } },
      ip: req.ip,
    });
    const [row] = await db.select().from(announcements).where(eq(announcements.id, annId));
    return reply.code(201).send({ announcement: dto(row!, { deviceName, createdBy: req.auth!.user.name ?? req.auth!.user.email }, now.getTime()) });
  });

  /** Cabut sebelum waktunya. Pengumuman yang sudah selesai dibiarkan apa adanya. */
  app.post("/api/admin/announcements/:id/revoke", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(annParam, req.params);
    const [a] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    if (!a) throw notFound("Pengumuman");
    await requireMosqueRole(db, req, a.mosqueId, "operator");
    const now = new Date();
    if (a.revokedAt || a.expiresAt.getTime() <= now.getTime()) return { ok: true, changed: false };
    await db.transaction(async (tx) => {
      await tx.update(announcements).set({ revokedAt: now }).where(eq(announcements.id, id));
      await bumpConfigVersion(tx, a.mosqueId);
    });
    await audit(db, { userId: req.auth!.user.id, mosqueId: a.mosqueId, action: "announcement.revoke", entity: "announcement", entityId: id, diff: { old: { text: a.text } }, ip: req.ip });
    return { ok: true, changed: true };
  });
}

/** Pengumuman untuk bundle: belum kedaluwarsa dan belum dicabut, untuk TV ini atau semua TV. */
export async function bundleAnnouncements(db: Db, mosqueId: string, deviceId: string | null) {
  const rows = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.mosqueId, mosqueId),
        isNull(announcements.revokedAt),
        gt(announcements.expiresAt, new Date()),
        // Pratinjau admin (tanpa TV) menampilkan semua pengumuman masjid.
        deviceId ? or(isNull(announcements.deviceId), eq(announcements.deviceId, deviceId)) : undefined,
      ),
    )
    .orderBy(announcements.startsAt, announcements.createdAt);
  return rows.map((a) => ({ id: a.id, text: a.text, startsAt: a.startsAt.toISOString(), expiresAt: a.expiresAt.toISOString() }));
}
