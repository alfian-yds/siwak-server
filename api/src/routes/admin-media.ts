/** Unggah dan kelola media (TRD §9). TV mengunduh lewat /api/v1/device/media/:id. */
import { createReadStream, existsSync } from "node:fs";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireMosqueRole } from "../auth/access.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { media } from "../db/schema.js";
import { HttpError, forbidden, notFound, parse } from "../http.js";
import { audit } from "../services/audit.js";
import { type MediaKind, deleteMedia, isMediaReferenced, mediaDto, mediaPath, storeUpload } from "../services/media.js";

const mosqueParam = z.object({ id: z.string().uuid("id masjid tidak sah") });
const mediaParam = z.object({ mid: z.string().uuid("id media tidak sah") });
const kindQuery = z.object({ kind: z.enum(["image", "audio"]) });

async function readUpload(req: FastifyRequest): Promise<{ data: Buffer; filename: string }> {
  const file = await req.file();
  if (!file) throw new HttpError(400, "validation", "Pilih berkas yang akan diunggah.");
  try {
    const data = await file.toBuffer();
    return { data, filename: file.filename };
  } catch (err) {
    if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
      throw new HttpError(413, "too_large", "Berkas terlalu besar. Gambar maks. 5 MB, audio maks. 10 MB.");
    }
    throw err;
  }
}

export async function adminMediaRoutes(app: FastifyInstance, { db, config }: { db: Db; config: Config }): Promise<void> {
  const upload = async (req: FastifyRequest, kind: MediaKind, mosqueId: string | null) => {
    const { data, filename } = await readUpload(req);
    const row = await storeUpload(db, { dir: config.MEDIA_DIR, kind, data, originalName: filename, mosqueId, userId: req.auth!.user.id });
    await audit(db, { userId: req.auth!.user.id, mosqueId, action: "media.upload", entity: kind, entityId: row.id, diff: { name: filename, bytes: row.bytes }, ip: req.ip });
    return mediaDto(row);
  };

  // Gambar boleh diunggah operator (untuk slide); audio hanya admin (pengaturan suara).
  app.post("/api/admin/mosques/:id/media", { preHandler: app.requireApiAuth }, async (req, reply) => {
    const { id } = parse(mosqueParam, req.params);
    const { kind } = parse(kindQuery, req.query);
    await requireMosqueRole(db, req, id, kind === "audio" ? "admin" : "operator");
    return reply.code(201).send({ media: await upload(req, kind, id) });
  });

  app.post("/api/admin/library/media", { preHandler: app.requireApiAuth }, async (req, reply) => {
    if (!req.auth?.user.isSuperAdmin) throw forbidden("Hanya super admin yang bisa mengunggah ke pustaka pusat.");
    const { kind } = parse(kindQuery, req.query);
    return reply.code(201).send({ media: await upload(req, kind, null) });
  });

  app.get("/api/admin/mosques/:id/media", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    const { kind } = parse(kindQuery, req.query);
    await requireMosqueRole(db, req, id, "operator");
    const rows = await db.select().from(media).where(and(eq(media.mosqueId, id), eq(media.kind, kind))).orderBy(desc(media.createdAt));
    return { media: rows.map(mediaDto) };
  });

  app.get("/api/admin/library/media", { preHandler: app.requireApiAuth }, async (req) => {
    const { kind } = parse(kindQuery, req.query);
    const rows = await db.select().from(media).where(and(isNull(media.mosqueId), eq(media.kind, kind))).orderBy(desc(media.createdAt));
    return { media: rows.map(mediaDto) };
  });

  /** Berkas untuk pratinjau di admin web. */
  app.get("/api/admin/media/:mid/file", { preHandler: app.requireApiAuth }, async (req, reply) => {
    const { mid } = parse(mediaParam, req.params);
    const [m] = await db.select().from(media).where(eq(media.id, mid)).limit(1);
    if (!m) throw notFound("Media");
    if (m.mosqueId) await requireMosqueRole(db, req, m.mosqueId, "operator");
    const path = mediaPath(config.MEDIA_DIR, m.sha256);
    if (!existsSync(path)) throw notFound("Berkas media");
    return reply.type(m.mime).header("Cache-Control", "private, max-age=86400").send(createReadStream(path));
  });

  app.delete("/api/admin/media/:mid", { preHandler: app.requireApiAuth }, async (req) => {
    const { mid } = parse(mediaParam, req.params);
    const [m] = await db.select().from(media).where(eq(media.id, mid)).limit(1);
    if (!m) throw notFound("Media");
    if (m.mosqueId) await requireMosqueRole(db, req, m.mosqueId, "admin");
    else if (!req.auth?.user.isSuperAdmin) throw forbidden();
    if (await isMediaReferenced(db, mid)) throw new HttpError(409, "in_use", "Media ini masih dipakai di slide atau pengaturan. Lepaskan dulu sebelum menghapus.");
    await deleteMedia(db, config.MEDIA_DIR, m);
    await audit(db, { userId: req.auth!.user.id, mosqueId: m.mosqueId, action: "media.delete", entity: m.kind, entityId: mid, ip: req.ip });
    return { ok: true };
  });
}
