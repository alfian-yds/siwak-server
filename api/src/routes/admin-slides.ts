/** Slide di tata letak Galeri (App Flow §4.6): urutan, durasi, hari, dan jam tayang. */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMosqueRole } from "../auth/access.js";
import type { Db } from "../db/client.js";
import { contentItems, slides } from "../db/schema.js";
import { HttpError, notFound, parse } from "../http.js";
import { audit } from "../services/audit.js";
import { contentDto } from "../services/content.js";
import { bumpConfigVersion } from "./admin-settings.js";

const mosqueParam = z.object({ id: z.string().uuid("id masjid tidak sah") });
const itemParam = z.object({ id: z.string().uuid(), sid: z.string().uuid("id slide tidak sah") });
const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "format jam HH:MM")
  .nullable();

const fields = {
  contentItemId: z.string().uuid("pilih konten"),
  durationSec: z.number().int().min(10, "minimal 10 detik").max(60, "maksimal 60 detik"),
  enabled: z.boolean(),
  daysMask: z.number().int().min(1, "pilih minimal satu hari").max(127),
  timeFrom: hhmm,
  timeTo: hhmm,
};
const timesOk = (v: { timeFrom?: string | null; timeTo?: string | null }) => (v.timeFrom == null) === (v.timeTo == null);
const timesMsg = { message: "isi jam mulai dan jam selesai, atau kosongkan keduanya", path: ["timeTo"] };
const createBody = z
  .object({ ...fields, durationSec: fields.durationSec.default(20), enabled: fields.enabled.default(true), daysMask: fields.daysMask.default(127), timeFrom: hhmm.default(null), timeTo: hhmm.default(null) })
  .strict()
  .refine(timesOk, timesMsg);
const updateBody = z.object(fields).partial().strict();
const orderBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).strict();

type SlideRow = typeof slides.$inferSelect;
const slideDto = (s: SlideRow) => ({
  id: s.id,
  contentItemId: s.contentItemId,
  durationSec: s.durationSec,
  sortOrder: s.sortOrder,
  enabled: s.enabled,
  daysMask: s.daysMask,
  timeFrom: s.timeFrom?.slice(0, 5) ?? null,
  timeTo: s.timeTo?.slice(0, 5) ?? null,
});

/** Konten yang boleh dijadikan slide: milik masjid ini (tayang) atau pustaka pusat terverifikasi. */
async function assertUsable(db: Db, mosqueId: string, contentId: string) {
  const [c] = await db.select().from(contentItems).where(eq(contentItems.id, contentId)).limit(1);
  const ok = c && ((c.scope === "mosque" && c.mosqueId === mosqueId && c.status === "published") || (c.scope === "global" && c.status === "verified"));
  if (!ok) throw new HttpError(400, "validation", "Ada isian yang belum benar.", { contentItemId: "konten tidak ditemukan atau belum tayang" });
}

export async function adminSlideRoutes(app: FastifyInstance, { db }: { db: Db }): Promise<void> {
  const list = async (mosqueId: string) => {
    const rows = await db.select().from(slides).where(eq(slides.mosqueId, mosqueId)).orderBy(asc(slides.sortOrder), asc(slides.createdAt));
    const ids = [...new Set(rows.map((r) => r.contentItemId))];
    const content = ids.length ? await db.select().from(contentItems).where(inArray(contentItems.id, ids)) : [];
    const byId = new Map(content.map((c) => [c.id, contentDto(c)]));
    return rows.map((r) => ({ ...slideDto(r), content: byId.get(r.contentItemId) ?? null }));
  };

  app.get("/api/admin/mosques/:id/slides", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    await requireMosqueRole(db, req, id, "operator");
    return { slides: await list(id) };
  });

  app.post("/api/admin/mosques/:id/slides", { preHandler: app.requireApiAuth }, async (req, reply) => {
    const { id } = parse(mosqueParam, req.params);
    const input = parse(createBody, req.body);
    await requireMosqueRole(db, req, id, "operator");
    await assertUsable(db, id, input.contentItemId);
    // Satu konten cukup satu slide; slide ganda membuat TV menayangkan isi yang sama berulang.
    const [dup] = await db
      .select({ id: slides.id })
      .from(slides)
      .where(and(eq(slides.mosqueId, id), eq(slides.contentItemId, input.contentItemId)))
      .limit(1);
    if (dup) throw new HttpError(409, "conflict", "Konten ini sudah menjadi slide.");
    const [{ top } = { top: null }] = await db.select({ top: max(slides.sortOrder) }).from(slides).where(eq(slides.mosqueId, id));
    const sid = randomUUID();
    await db.insert(slides).values({ id: sid, mosqueId: id, ...input, sortOrder: (top ?? -1) + 1 });
    await bumpConfigVersion(db, id);
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: "slide.create", entity: "slide", entityId: sid, diff: { new: input }, ip: req.ip });
    return reply.code(201).send({ slides: await list(id) });
  });

  app.patch("/api/admin/mosques/:id/slides/:sid", { preHandler: app.requireApiAuth }, async (req) => {
    const { id, sid } = parse(itemParam, req.params);
    const input = parse(updateBody, req.body);
    await requireMosqueRole(db, req, id, "operator");
    const [before] = await db.select().from(slides).where(and(eq(slides.id, sid), eq(slides.mosqueId, id))).limit(1);
    if (!before) throw notFound("Slide");
    if (!timesOk({ timeFrom: input.timeFrom !== undefined ? input.timeFrom : before.timeFrom, timeTo: input.timeTo !== undefined ? input.timeTo : before.timeTo })) {
      throw new HttpError(400, "validation", "Ada isian yang belum benar.", { timeTo: timesMsg.message });
    }
    if (input.contentItemId) await assertUsable(db, id, input.contentItemId);
    await db.update(slides).set(input).where(eq(slides.id, sid));
    await bumpConfigVersion(db, id);
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: "slide.update", entity: "slide", entityId: sid, diff: { old: slideDto(before), new: input }, ip: req.ip });
    return { slides: await list(id) };
  });

  app.delete("/api/admin/mosques/:id/slides/:sid", { preHandler: app.requireApiAuth }, async (req) => {
    const { id, sid } = parse(itemParam, req.params);
    await requireMosqueRole(db, req, id, "operator");
    const [before] = await db.select().from(slides).where(and(eq(slides.id, sid), eq(slides.mosqueId, id))).limit(1);
    if (!before) throw notFound("Slide");
    await db.delete(slides).where(eq(slides.id, sid));
    await bumpConfigVersion(db, id);
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: "slide.delete", entity: "slide", entityId: sid, diff: { old: slideDto(before) }, ip: req.ip });
    return { slides: await list(id) };
  });

  app.put("/api/admin/mosques/:id/slides/order", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    const { ids } = parse(orderBody, req.body);
    await requireMosqueRole(db, req, id, "operator");
    const all = await db.select({ id: slides.id }).from(slides).where(eq(slides.mosqueId, id));
    const known = new Set(all.map((s) => s.id));
    if (ids.length !== all.length || new Set(ids).size !== ids.length || ids.some((x) => !known.has(x))) {
      throw new HttpError(409, "conflict", "Daftar slide sudah berubah. Muat ulang halaman lalu coba lagi.");
    }
    await db.transaction(async (tx) => {
      for (const [i, sid] of ids.entries()) await tx.update(slides).set({ sortOrder: i }).where(eq(slides.id, sid));
      await bumpConfigVersion(tx, id);
    });
    return { slides: await list(id) };
  });
}
