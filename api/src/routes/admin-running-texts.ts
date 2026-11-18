import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMosqueRole } from "../auth/access.js";
import type { Db } from "../db/client.js";
import { runningTexts } from "../db/schema.js";
import { HttpError, notFound, parse } from "../http.js";
import { audit } from "../services/audit.js";
import { bumpConfigVersion } from "./admin-settings.js";

const mosqueParam = z.object({ id: z.string().uuid("id masjid tidak sah") });
const itemParam = z.object({ id: z.string().uuid(), textId: z.string().uuid("id teks tidak sah") });
const dateOrNull = z.string().date("format tanggal YYYY-MM-DD").nullable();

const fields = {
  // Teks yang tampil di TV dibatasi panjangnya (TRD §14).
  text: z.string().trim().min(1, "teks wajib diisi").max(300, "maksimal 300 karakter"),
  enabled: z.boolean(),
  startsOn: dateOrNull,
  endsOn: dateOrNull,
};
const datesOk = (v: { startsOn?: string | null; endsOn?: string | null }) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn;
const dateMsg = { message: "tanggal selesai tidak boleh sebelum tanggal mulai", path: ["endsOn"] };

const createBody = z
  .object({ ...fields, enabled: fields.enabled.default(true), startsOn: dateOrNull.default(null), endsOn: dateOrNull.default(null) })
  .strict()
  .refine(datesOk, dateMsg);
const updateBody = z.object(fields).partial().strict();
const orderBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).strict();

type Row = typeof runningTexts.$inferSelect;
const dto = (r: Row) => ({
  id: r.id,
  text: r.text,
  enabled: r.enabled,
  startsOn: r.startsOn,
  endsOn: r.endsOn,
  sortOrder: r.sortOrder,
  updatedAt: r.updatedAt,
});

export async function adminRunningTextRoutes(app: FastifyInstance, { db }: { db: Db }): Promise<void> {
  const list = (mosqueId: string) =>
    db.select().from(runningTexts).where(eq(runningTexts.mosqueId, mosqueId)).orderBy(asc(runningTexts.sortOrder), asc(runningTexts.updatedAt));

  app.get("/api/admin/mosques/:id/running-texts", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    await requireMosqueRole(db, req, id, "operator");
    return { runningTexts: (await list(id)).map(dto) };
  });

  app.post("/api/admin/mosques/:id/running-texts", { preHandler: app.requireApiAuth }, async (req, reply) => {
    const { id } = parse(mosqueParam, req.params);
    const input = parse(createBody, req.body);
    await requireMosqueRole(db, req, id, "operator");
    const [{ top } = { top: null }] = await db.select({ top: max(runningTexts.sortOrder) }).from(runningTexts).where(eq(runningTexts.mosqueId, id));
    const textId = randomUUID();
    await db.insert(runningTexts).values({ id: textId, mosqueId: id, ...input, sortOrder: (top ?? -1) + 1, updatedBy: req.auth!.user.id });
    await bumpConfigVersion(db, id);
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: "running_text.create", entity: "running_text", entityId: textId, diff: { new: input }, ip: req.ip });
    const [row] = await db.select().from(runningTexts).where(eq(runningTexts.id, textId));
    return reply.code(201).send({ runningText: dto(row!) });
  });

  app.patch("/api/admin/mosques/:id/running-texts/:textId", { preHandler: app.requireApiAuth }, async (req) => {
    const { id, textId } = parse(itemParam, req.params);
    const input = parse(updateBody, req.body);
    await requireMosqueRole(db, req, id, "operator");
    const [before] = await db.select().from(runningTexts).where(and(eq(runningTexts.id, textId), eq(runningTexts.mosqueId, id))).limit(1);
    if (!before) throw notFound("Teks berjalan");
    if (Object.keys(input).length === 0) throw new HttpError(400, "validation", "Tidak ada yang diubah.");
    const merged = { startsOn: before.startsOn, endsOn: before.endsOn, ...input };
    if (!datesOk(merged)) throw new HttpError(400, "validation", "Ada isian yang belum benar.", { endsOn: dateMsg.message });

    await db.update(runningTexts).set({ ...input, updatedBy: req.auth!.user.id }).where(eq(runningTexts.id, textId));
    await bumpConfigVersion(db, id);
    await audit(db, {
      userId: req.auth!.user.id,
      mosqueId: id,
      action: "running_text.update",
      entity: "running_text",
      entityId: textId,
      diff: { old: dto(before), new: input },
      ip: req.ip,
    });
    const [row] = await db.select().from(runningTexts).where(eq(runningTexts.id, textId));
    return { runningText: dto(row!) };
  });

  app.delete("/api/admin/mosques/:id/running-texts/:textId", { preHandler: app.requireApiAuth }, async (req) => {
    const { id, textId } = parse(itemParam, req.params);
    await requireMosqueRole(db, req, id, "operator");
    const [before] = await db.select().from(runningTexts).where(and(eq(runningTexts.id, textId), eq(runningTexts.mosqueId, id))).limit(1);
    if (!before) throw notFound("Teks berjalan");
    await db.delete(runningTexts).where(eq(runningTexts.id, textId));
    await bumpConfigVersion(db, id);
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: "running_text.delete", entity: "running_text", entityId: textId, diff: { old: dto(before) }, ip: req.ip });
    return { ok: true };
  });

  /** Mengurutkan ulang: `ids` berisi semua teks masjid dalam urutan baru. */
  app.put("/api/admin/mosques/:id/running-texts/order", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    const { ids } = parse(orderBody, req.body);
    await requireMosqueRole(db, req, id, "operator");
    const existing = await db
      .select({ id: runningTexts.id })
      .from(runningTexts)
      .where(and(eq(runningTexts.mosqueId, id), inArray(runningTexts.id, ids)));
    const all = await list(id);
    if (existing.length !== ids.length || all.length !== ids.length || new Set(ids).size !== ids.length) {
      throw new HttpError(409, "conflict", "Daftar teks sudah berubah. Muat ulang halaman lalu coba lagi.");
    }
    await db.transaction(async (tx) => {
      for (const [i, textId] of ids.entries()) await tx.update(runningTexts).set({ sortOrder: i }).where(eq(runningTexts.id, textId));
      await bumpConfigVersion(tx, id);
    });
    await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: "running_text.reorder", entity: "mosque", entityId: id, ip: req.ip });
    return { runningTexts: (await list(id)).map(dto) };
  });
}
