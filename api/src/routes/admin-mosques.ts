import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { devices, memberships, mosqueSettings, mosques } from "../db/schema.js";
import { requireMosqueRole } from "../auth/access.js";
import { HttpError, forbidden, parse } from "../http.js";
import { audit } from "../services/audit.js";
import { SETTINGS_SCHEMA_VERSION, defaultSettings } from "../settings/schema.js";

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("id", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "zona waktu tidak dikenal");

const mosqueFields = {
  name: z.string().trim().min(3, "minimal 3 karakter").max(120, "maksimal 120 karakter"),
  regionLabel: z.string().trim().max(120, "maksimal 120 karakter").nullable().optional(),
  latitude: z.number().min(-90, "lintang −90 sampai 90").max(90, "lintang −90 sampai 90"),
  longitude: z.number().min(-180, "bujur −180 sampai 180").max(180, "bujur −180 sampai 180"),
  timezone,
};
const createSchema = z.object({ ...mosqueFields, timezone: timezone.default("Asia/Jakarta") }).strict();
const updateSchema = z.object(mosqueFields).partial().extend({ archived: z.boolean().optional() }).strict();
const listQuery = z.object({ archived: z.enum(["0", "1"]).default("0") });
const idParam = z.object({ id: z.string().uuid("id masjid tidak sah") });

/** "Masjid Al-Hidayah" → "masjid-al-hidayah", dijamin unik dengan akhiran angka bila perlu. */
async function uniqueSlug(db: Db, name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "masjid";
  for (let i = 1; i < 1000; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [taken] = await db.select({ id: mosques.id }).from(mosques).where(eq(mosques.slug, slug)).limit(1);
    if (!taken) return slug;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function toDto(m: typeof mosques.$inferSelect, extra: { deviceCount: number; memberCount: number }) {
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    regionLabel: m.regionLabel,
    latitude: Number(m.latitude),
    longitude: Number(m.longitude),
    timezone: m.timezone,
    archivedAt: m.archivedAt,
    ...extra,
  };
}

export async function adminMosqueRoutes(app: FastifyInstance, { db }: { db: Db }): Promise<void> {
  /** Super admin melihat semua masjid; pengurus lain hanya masjid yang menjadi haknya. */
  app.get("/api/admin/mosques", { preHandler: app.requireApiAuth }, async (req) => {
    const { archived } = parse(listQuery, req.query);
    const user = req.auth!.user;
    const archivedFilter = archived === "1" ? isNotNull(mosques.archivedAt) : isNull(mosques.archivedAt);

    let rows: (typeof mosques.$inferSelect)[];
    if (user.isSuperAdmin) {
      rows = await db.select().from(mosques).where(archivedFilter).orderBy(mosques.name);
    } else {
      const mine = await db.select({ id: memberships.mosqueId }).from(memberships).where(eq(memberships.userId, user.id));
      rows = mine.length
        ? await db
            .select()
            .from(mosques)
            .where(and(archivedFilter, inArray(mosques.id, mine.map((m) => m.id))))
            .orderBy(mosques.name)
        : [];
    }

    const ids = rows.map((r) => r.id);
    const deviceCounts = ids.length
      ? await db
          .select({ id: devices.mosqueId, n: count() })
          .from(devices)
          .where(and(inArray(devices.mosqueId, ids), isNull(devices.revokedAt)))
          .groupBy(devices.mosqueId)
      : [];
    const memberCounts = ids.length
      ? await db
          .select({ id: memberships.mosqueId, n: count() })
          .from(memberships)
          .where(inArray(memberships.mosqueId, ids))
          .groupBy(memberships.mosqueId)
      : [];
    const dc = new Map(deviceCounts.map((d) => [d.id, d.n]));
    const mc = new Map(memberCounts.map((m) => [m.id, m.n]));
    return { mosques: rows.map((m) => toDto(m, { deviceCount: dc.get(m.id) ?? 0, memberCount: mc.get(m.id) ?? 0 })) };
  });

  app.post("/api/admin/mosques", { preHandler: app.requireSuperAdmin }, async (req, reply) => {
    const input = parse(createSchema, req.body);
    const id = randomUUID();
    const slug = await uniqueSlug(db, input.name);
    await db.transaction(async (tx) => {
      await tx.insert(mosques).values({
        id,
        name: input.name,
        slug,
        regionLabel: input.regionLabel ?? null,
        latitude: input.latitude.toFixed(6),
        longitude: input.longitude.toFixed(6),
        timezone: input.timezone,
      });
      await tx.insert(mosqueSettings).values({
        mosqueId: id,
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        data: defaultSettings(),
        updatedBy: req.auth!.user.id,
      });
    });
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: "mosque.create", entity: "mosque", entityId: id, diff: { new: input }, ip: req.ip });
    const [created] = await db.select().from(mosques).where(eq(mosques.id, id));
    return reply.code(201).send({ mosque: toDto(created!, { deviceCount: 0, memberCount: 0 }) });
  });

  /** Satu masjid beserta peran pengguna di sana (untuk halaman per masjid). */
  app.get("/api/admin/mosques/:id", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { mosque, role } = await requireMosqueRole(db, req, id, "operator");
    return { mosque: { ...toDto(mosque, { deviceCount: 0, memberCount: 0 }), configVersion: mosque.configVersion }, role };
  });

  // Admin masjid boleh mengubah nama, lokasi, dan zona waktu masjidnya; arsip hanya super admin.
  app.patch("/api/admin/mosques/:id", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateSchema, req.body);
    const { mosque: before, role } = await requireMosqueRole(db, req, id, "admin");
    if (input.archived !== undefined && role !== "super") throw forbidden("Hanya super admin yang bisa mengarsipkan masjid.");
    if (Object.keys(input).length === 0) throw new HttpError(400, "validation", "Tidak ada yang diubah.");

    // Nama, lokasi, dan zona waktu ikut dikirim ke TV, jadi versi data dinaikkan agar TV menyinkron.
    const affectsTv = input.name !== undefined || input.latitude !== undefined || input.longitude !== undefined || input.timezone !== undefined;
    await db
      .update(mosques)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.regionLabel !== undefined && { regionLabel: input.regionLabel }),
        ...(input.latitude !== undefined && { latitude: input.latitude.toFixed(6) }),
        ...(input.longitude !== undefined && { longitude: input.longitude.toFixed(6) }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.archived !== undefined && { archivedAt: input.archived ? new Date() : null }),
        ...(affectsTv && { configVersion: sql`${mosques.configVersion} + 1` }),
      })
      .where(eq(mosques.id, id));

    const action = input.archived === true ? "mosque.archive" : input.archived === false ? "mosque.restore" : "mosque.update";
    await audit(db, {
      userId: req.auth!.user.id,
      mosqueId: id,
      action,
      entity: "mosque",
      entityId: id,
      diff: { old: toDto(before, { deviceCount: 0, memberCount: 0 }), new: input },
      ip: req.ip,
    });
    const [after] = await db.select().from(mosques).where(eq(mosques.id, id));
    return { mosque: toDto(after!, { deviceCount: 0, memberCount: 0 }) };
  });
}
