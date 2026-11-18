import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMosqueRole } from "../auth/access.js";
import type { Db } from "../db/client.js";
import { media, mosqueSettings, mosques, weatherCache } from "../db/schema.js";
import { HttpError, parse } from "../http.js";
import { audit } from "../services/audit.js";
import { type MosqueSettings, SETTINGS_SCHEMA_VERSION, changedPaths, mosqueSettingsSchema, readSettings, valueAt } from "../settings/schema.js";

const idParam = z.object({ id: z.string().uuid("id masjid tidak sah") });
const putBody = z.object({ settings: z.unknown() }).strict();

/** Menaikkan versi data masjid agar semua TV-nya mengambil bundle baru pada heartbeat berikutnya. */
export async function bumpConfigVersion(db: Pick<Db, "update">, mosqueId: string): Promise<void> {
  await db
    .update(mosques)
    .set({ configVersion: sql`${mosques.configVersion} + 1` })
    .where(eq(mosques.id, mosqueId));
}

/** Media di pengaturan harus ada, milik masjid ini atau pustaka pusat, dan berjenis tepat. */
async function assertMediaRefs(db: Db, mosqueId: string, s: MosqueSettings) {
  const wanted: [string, string | null, "image" | "audio"][] = [
    ["display.media.logoId", s.display.media.logoId, "image"],
    ["display.media.backgroundMainId", s.display.media.backgroundMainId, "image"],
    ["display.media.backgroundPrayerId", s.display.media.backgroundPrayerId, "image"],
    ["display.media.backgroundIqamahId", s.display.media.backgroundIqamahId, "image"],
    ["sound.adzan.mediaId", s.sound.adzan.mediaId, "audio"],
    ["sound.iqamah.mediaId", s.sound.iqamah.mediaId, "audio"],
  ];
  const ids = wanted.map((w) => w[1]).filter((x): x is string => Boolean(x));
  if (!ids.length) return;
  const rows = await db.select().from(media).where(inArray(media.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const fields: Record<string, string> = {};
  for (const [path, mid, kind] of wanted) {
    if (!mid) continue;
    const m = byId.get(mid);
    if (!m || m.kind !== kind || (m.mosqueId !== null && m.mosqueId !== mosqueId)) fields[path] = kind === "image" ? "gambar tidak ditemukan" : "audio tidak ditemukan";
  }
  if (Object.keys(fields).length) throw new HttpError(400, "validation", "Ada isian yang belum benar.", fields);
}

export async function loadSettings(db: Db, mosqueId: string) {
  const [row] = await db.select().from(mosqueSettings).where(eq(mosqueSettings.mosqueId, mosqueId)).limit(1);
  return { settings: readSettings(row?.data), updatedAt: row?.updatedAt ?? null };
}

export async function adminSettingsRoutes(app: FastifyInstance, { db }: { db: Db }): Promise<void> {
  // Halaman Jadwal, Suara, dan Tampilan hanya untuk admin (tugas 3.1). Operator memakai pratinjau.
  app.get("/api/admin/mosques/:id/settings", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(idParam, req.params);
    await requireMosqueRole(db, req, id, "admin");
    return loadSettings(db, id);
  });

  /** Pratinjau (tugas 2.6): data yang persis sama dengan bundle TV masjid ini. */
  app.get("/api/admin/mosques/:id/preview", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(idParam, req.params);
    await requireMosqueRole(db, req, id, "operator");
    const { buildBundle } = await import("../services/bundle.js");
    const bundle = await buildBundle(db, id, null);
    // Cuaca terakhir untuk sel lokasi masjid (sama dengan yang diterima TV), bila sudah ada.
    const { cellKeyOf } = await import("../services/weather.js");
    const [w] = await db.select({ payload: weatherCache.payload }).from(weatherCache).where(eq(weatherCache.cellKey, cellKeyOf(bundle.mosque.latitude, bundle.mosque.longitude))).limit(1);
    return { ...bundle, weather: w?.payload ?? null };
  });

  /** Mengganti seluruh dokumen pengaturan (admin web selalu mengirim dokumen lengkap). */
  app.put("/api/admin/mosques/:id/settings", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(idParam, req.params);
    const { mosque } = await requireMosqueRole(db, req, id, "admin");
    const { settings: raw } = parse(putBody, req.body);
    const settings = parse(mosqueSettingsSchema, raw);

    await assertMediaRefs(db, id, settings);

    const { settings: before } = await loadSettings(db, id);
    const changed = changedPaths(before, settings);
    if (changed.length === 0) throw new HttpError(400, "validation", "Tidak ada yang diubah.");

    await db.transaction(async (tx) => {
      await tx
        .insert(mosqueSettings)
        .values({ mosqueId: id, schemaVersion: SETTINGS_SCHEMA_VERSION, data: settings, updatedBy: req.auth!.user.id })
        .onDuplicateKeyUpdate({
          set: { schemaVersion: SETTINGS_SCHEMA_VERSION, data: settings, updatedBy: req.auth!.user.id, updatedAt: new Date() },
        });
      await bumpConfigVersion(tx, id);
    });

    await audit(db, {
      userId: req.auth!.user.id,
      mosqueId: id,
      action: "settings.update",
      entity: "mosque_settings",
      entityId: id,
      diff: Object.fromEntries(changed.map((p) => [p, { old: valueAt(before, p), new: valueAt(settings, p) }])),
      ip: req.ip,
    });
    req.log.info({ mosqueId: id, mosque: mosque.name, changed }, "pengaturan masjid diubah");
    return loadSettings(db, id);
  });
}
