/**
 * Konten masjid dan pustaka pusat (App Flow §4.6, §4.8; TRD §12.2).
 * - Hadits masjid: admin masjid; status draf/tayang; bisa diajukan ke pustaka pusat.
 * - Panel informasi & gambar: operator boleh.
 * - Pustaka pusat: super admin menulis dan memverifikasi; pengurus lain hanya melihat yang terverifikasi.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireMosqueRole } from "../auth/access.js";
import type { Db } from "../db/client.js";
import { appState, contentItems, media, slides } from "../db/schema.js";
import { HttpError, forbidden, notFound, parse } from "../http.js";
import { audit } from "../services/audit.js";
import { contentDto, hadithFields, infoBodies, infoTypes } from "../services/content.js";
import { bumpConfigVersion } from "./admin-settings.js";

const mosqueParam = z.object({ id: z.string().uuid("id masjid tidak sah") });
const itemParam = z.object({ id: z.string().uuid(), cid: z.string().uuid("id konten tidak sah") });
const libParam = z.object({ cid: z.string().uuid("id konten tidak sah") });
const listQuery = z.object({ type: z.enum(["hadith", "info", "image", "all"]).default("all") });

const hadithBody = hadithFields.extend({ status: z.enum(["draft", "published"]).default("published") }).strict();
const imageBody = z
  .object({ mediaId: z.string().uuid("pilih gambar"), caption: z.string().trim().max(120, "maksimal 120 karakter").default("") })
  .strict();

type Row = typeof contentItems.$inferSelect;

/** Menaikkan versi pustaka pusat agar semua TV mengambil bundle baru (TRD §7.1). */
export async function bumpContentVersion(db: Pick<Db, "update">): Promise<void> {
  await db
    .update(appState)
    .set({ contentVersion: sql`${appState.contentVersion} + 1` })
    .where(eq(appState.id, 1));
}

/** Mengubah masukan formulir menjadi kolom content_items sesuai jenisnya. */
async function fieldsFor(db: Db, type: string, input: unknown, mosqueId: string | null) {
  if (type === "hadith") {
    const h = parse(hadithBody, input);
    return {
      columns: { category: h.category, arabicText: h.arabicText || null, translation: h.translation, sourceRef: h.sourceRef, gradeNote: h.gradeNote || null, body: null, mediaId: null },
      status: h.status,
    };
  }
  if (type === "image") {
    const b = parse(imageBody, input);
    const [m] = await db.select().from(media).where(eq(media.id, b.mediaId)).limit(1);
    if (!m || m.kind !== "image" || (m.mosqueId !== null && m.mosqueId !== mosqueId)) {
      throw new HttpError(400, "validation", "Ada isian yang belum benar.", { mediaId: "gambar tidak ditemukan" });
    }
    return { columns: { category: null, arabicText: null, translation: null, sourceRef: null, gradeNote: null, body: { caption: b.caption }, mediaId: b.mediaId }, status: "published" as const };
  }
  if ((infoTypes as string[]).includes(type)) {
    const body = parse(z.object({ body: infoBodies[type as keyof typeof infoBodies] }).strict(), input).body;
    return {
      columns: { category: null, arabicText: null, translation: null, sourceRef: null, gradeNote: null, body: { type, ...body }, mediaId: null },
      status: "published" as const,
    };
  }
  throw new HttpError(400, "validation", "Jenis konten tidak dikenal.");
}

const minRoleFor = (type: string) => (type === "hadith" ? ("admin" as const) : ("operator" as const));

async function assertNotInSlides(db: Db, ids: string[]) {
  const [used] = await db.select({ id: slides.id }).from(slides).where(inArray(slides.contentItemId, ids)).limit(1);
  if (used) throw new HttpError(409, "in_use", "Konten ini masih dipakai di slide. Hapus slidenya terlebih dahulu.");
}

export async function adminContentRoutes(app: FastifyInstance, { db }: { db: Db }): Promise<void> {
  // ---- Konten masjid ----------------------------------------------------------------

  app.get("/api/admin/mosques/:id/content", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    const { type } = parse(listQuery, req.query);
    await requireMosqueRole(db, req, id, "operator");
    const types = type === "all" ? undefined : type === "info" ? infoTypes : [type];
    const rows = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.mosqueId, id), types ? inArray(contentItems.type, types as Row["type"][]) : undefined))
      .orderBy(desc(contentItems.updatedAt));
    // Status pengajuan ke pustaka pusat untuk hadits masjid.
    const origins = rows.filter((r) => r.type === "hadith").map((r) => r.id);
    const copies = origins.length
      ? await db.select().from(contentItems).where(and(eq(contentItems.scope, "global"), inArray(contentItems.originItemId, origins)))
      : [];
    const byOrigin = new Map(copies.map((c) => [c.originItemId, c]));
    return {
      content: rows.map((r) => {
        const copy = byOrigin.get(r.id);
        return { ...contentDto(r), submission: copy ? { id: copy.id, status: copy.status, reviewNote: copy.reviewNote, reviewedAt: copy.reviewedAt } : null };
      }),
    };
  });

  app.post("/api/admin/mosques/:id/content", { preHandler: app.requireApiAuth }, async (req, reply) => {
    const { id } = parse(mosqueParam, req.params);
    const { type, ...rest } = parse(z.object({ type: z.string() }).passthrough(), req.body);
    await requireMosqueRole(db, req, id, minRoleFor(type));
    const { columns, status } = await fieldsFor(db, type, rest, id);
    const cid = randomUUID();
    await db.insert(contentItems).values({ id: cid, scope: "mosque", mosqueId: id, type: type as Row["type"], status, createdBy: req.auth!.user.id, ...columns });
    await bumpConfigVersion(db, id);
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: `content.create`, entity: type, entityId: cid, diff: { new: rest }, ip: req.ip });
    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, cid));
    return reply.code(201).send({ content: contentDto(row!) });
  });

  app.put("/api/admin/mosques/:id/content/:cid", { preHandler: app.requireApiAuth }, async (req) => {
    const { id, cid } = parse(itemParam, req.params);
    const [before] = await db.select().from(contentItems).where(and(eq(contentItems.id, cid), eq(contentItems.mosqueId, id))).limit(1);
    if (!before) throw notFound("Konten");
    await requireMosqueRole(db, req, id, minRoleFor(before.type));
    const { columns, status } = await fieldsFor(db, before.type, req.body, id);
    await db.update(contentItems).set({ ...columns, status }).where(eq(contentItems.id, cid));
    await bumpConfigVersion(db, id);
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: "content.update", entity: before.type, entityId: cid, diff: { old: contentDto(before), new: req.body }, ip: req.ip });
    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, cid));
    return { content: contentDto(row!) };
  });

  app.delete("/api/admin/mosques/:id/content/:cid", { preHandler: app.requireApiAuth }, async (req) => {
    const { id, cid } = parse(itemParam, req.params);
    const [before] = await db.select().from(contentItems).where(and(eq(contentItems.id, cid), eq(contentItems.mosqueId, id))).limit(1);
    if (!before) throw notFound("Konten");
    await requireMosqueRole(db, req, id, minRoleFor(before.type));
    await assertNotInSlides(db, [cid]);
    await db.delete(contentItems).where(eq(contentItems.id, cid));
    await bumpConfigVersion(db, id);
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: "content.delete", entity: before.type, entityId: cid, diff: { old: contentDto(before) }, ip: req.ip });
    return { ok: true };
  });

  /** "Ajukan ke pustaka pusat": salinan global berstatus submitted (App Flow §4.8). */
  app.post("/api/admin/mosques/:id/content/:cid/submit", { preHandler: app.requireApiAuth }, async (req) => {
    const { id, cid } = parse(itemParam, req.params);
    await requireMosqueRole(db, req, id, "admin");
    const [item] = await db.select().from(contentItems).where(and(eq(contentItems.id, cid), eq(contentItems.mosqueId, id))).limit(1);
    if (!item || item.type !== "hadith") throw notFound("Hadits");
    const [copy] = await db.select().from(contentItems).where(and(eq(contentItems.scope, "global"), eq(contentItems.originItemId, cid))).limit(1);
    const fields = { category: item.category, arabicText: item.arabicText, translation: item.translation, sourceRef: item.sourceRef, gradeNote: item.gradeNote };
    if (copy?.status === "verified") throw new HttpError(409, "conflict", "Hadits ini sudah ada di kumpulan hadits SIWAK.");
    if (copy) {
      await db.update(contentItems).set({ ...fields, status: "submitted", reviewNote: null, reviewedAt: null, reviewedBy: null }).where(eq(contentItems.id, copy.id));
    } else {
      await db.insert(contentItems).values({ id: randomUUID(), scope: "global", mosqueId: null, type: "hadith", status: "submitted", originItemId: cid, createdBy: req.auth!.user.id, ...fields });
    }
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: "content.submit", entity: "hadith", entityId: cid, ip: req.ip });
    return { ok: true };
  });

  // ---- Pustaka pusat ----------------------------------------------------------------

  const libQuery = z.object({ status: z.enum(["verified", "submitted", "draft", "rejected", "all"]).default("verified") });

  app.get("/api/admin/library", { preHandler: app.requireApiAuth }, async (req) => {
    const { status } = parse(libQuery, req.query);
    const isSuper = req.auth!.user.isSuperAdmin;
    if (!isSuper && status !== "verified") throw forbidden("Hanya super admin yang bisa melihat antrean verifikasi.");
    const rows = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.scope, "global"), status === "all" ? undefined : eq(contentItems.status, status)))
      .orderBy(contentItems.category, desc(contentItems.updatedAt));
    return { content: rows.map(contentDto) };
  });

  const requireSuper = (req: FastifyRequest) => {
    if (!req.auth?.user.isSuperAdmin) throw forbidden("Hanya super admin yang bisa mengubah kumpulan hadits SIWAK.");
  };

  app.post("/api/admin/library", { preHandler: app.requireApiAuth }, async (req, reply) => {
    requireSuper(req);
    const h = parse(hadithFields.strict(), req.body);
    const cid = randomUUID();
    await db.insert(contentItems).values({ id: cid, scope: "global", mosqueId: null, type: "hadith", status: "draft", createdBy: req.auth!.user.id, ...h });
    await audit(db, { userId: req.auth!.user.id, action: "library.create", entity: "hadith", entityId: cid, diff: { new: h }, ip: req.ip });
    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, cid));
    return reply.code(201).send({ content: contentDto(row!) });
  });

  app.put("/api/admin/library/:cid", { preHandler: app.requireApiAuth }, async (req) => {
    requireSuper(req);
    const { cid } = parse(libParam, req.params);
    const h = parse(hadithFields.strict(), req.body);
    const [before] = await db.select().from(contentItems).where(and(eq(contentItems.id, cid), eq(contentItems.scope, "global"))).limit(1);
    if (!before) throw notFound("Hadits");
    await db.update(contentItems).set(h).where(eq(contentItems.id, cid));
    if (before.status === "verified") await bumpContentVersion(db);
    await audit(db, { userId: req.auth!.user.id, action: "library.update", entity: "hadith", entityId: cid, diff: { old: contentDto(before), new: h }, ip: req.ip });
    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, cid));
    return { content: contentDto(row!) };
  });

  /** Verifikasi oleh super admin: setujui, kembalikan dengan catatan, atau tarik kembali menjadi draf. */
  app.post("/api/admin/library/:cid/review", { preHandler: app.requireApiAuth }, async (req) => {
    requireSuper(req);
    const { cid } = parse(libParam, req.params);
    const { decision, note } = parse(
      z
        .object({ decision: z.enum(["verify", "reject", "unverify"]), note: z.string().trim().max(500).default("") })
        .strict()
        .refine((v) => v.decision !== "reject" || v.note.length > 0, { message: "tulis alasan agar pengirim bisa memperbaiki", path: ["note"] }),
      req.body,
    );
    const [before] = await db.select().from(contentItems).where(and(eq(contentItems.id, cid), eq(contentItems.scope, "global"))).limit(1);
    if (!before) throw notFound("Hadits");
    const status = decision === "verify" ? "verified" : decision === "reject" ? "rejected" : "draft";
    await db
      .update(contentItems)
      .set({ status, reviewNote: note || null, reviewedBy: req.auth!.user.id, reviewedAt: new Date() })
      .where(eq(contentItems.id, cid));
    if (before.status === "verified" || status === "verified") await bumpContentVersion(db);
    await audit(db, { userId: req.auth!.user.id, action: `library.${decision}`, entity: "hadith", entityId: cid, diff: { old: before.status, new: status, note }, ip: req.ip });
    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, cid));
    return { content: contentDto(row!) };
  });

  app.delete("/api/admin/library/:cid", { preHandler: app.requireApiAuth }, async (req) => {
    requireSuper(req);
    const { cid } = parse(libParam, req.params);
    const [before] = await db.select().from(contentItems).where(and(eq(contentItems.id, cid), eq(contentItems.scope, "global"))).limit(1);
    if (!before) throw notFound("Hadits");
    await assertNotInSlides(db, [cid]);
    await db.delete(contentItems).where(eq(contentItems.id, cid));
    if (before.status === "verified") await bumpContentVersion(db);
    await audit(db, { userId: req.auth!.user.id, action: "library.delete", entity: "hadith", entityId: cid, diff: { old: contentDto(before) }, ip: req.ip });
    return { ok: true };
  });
}
