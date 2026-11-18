import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { memberships, mosques, sessions, users } from "../db/schema.js";
import { HttpError, notFound, parse } from "../http.js";
import { audit } from "../services/audit.js";

const membershipInput = z.object({
  mosqueId: z.string().uuid("masjid tidak sah"),
  role: z.enum(["admin", "operator"], { message: "peran harus admin atau operator" }),
});
const membershipList = z
  .array(membershipInput)
  .max(50, "maksimal 50 masjid")
  .refine((list) => new Set(list.map((m) => m.mosqueId)).size === list.length, "masjid tidak boleh ganda");

const createSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("email tidak sah").max(254),
    isSuperAdmin: z.boolean().default(false),
    memberships: membershipList.default([]),
  })
  .strict();
const updateSchema = z
  .object({
    isSuperAdmin: z.boolean().optional(),
    status: z.enum(["active", "disabled"]).optional(),
    memberships: membershipList.optional(),
  })
  .strict();
const idParam = z.object({ id: z.string().uuid("id pengguna tidak sah") });

type UserRow = typeof users.$inferSelect;
type MembershipDto = { mosqueId: string; mosqueName: string; role: "admin" | "operator" };

function toDto(u: UserRow, ms: MembershipDto[]) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    isSuperAdmin: u.isSuperAdmin,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    memberships: ms,
  };
}

async function membershipsOf(db: Db, userIds: string[]): Promise<Map<string, MembershipDto[]>> {
  const map = new Map<string, MembershipDto[]>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({ userId: memberships.userId, mosqueId: memberships.mosqueId, mosqueName: mosques.name, role: memberships.role })
    .from(memberships)
    .innerJoin(mosques, eq(mosques.id, memberships.mosqueId))
    .where(inArray(memberships.userId, userIds))
    .orderBy(mosques.name);
  for (const { userId, ...m } of rows) {
    const list = map.get(userId) ?? [];
    list.push(m);
    map.set(userId, list);
  }
  return map;
}

/** Memastikan semua masjid yang dirujuk ada dan belum diarsipkan. */
async function assertMosquesExist(db: Db, list: { mosqueId: string }[]): Promise<void> {
  if (list.length === 0) return;
  const ids = list.map((m) => m.mosqueId);
  const found = await db.select({ id: mosques.id, archivedAt: mosques.archivedAt }).from(mosques).where(inArray(mosques.id, ids));
  const ok = new Set(found.filter((f) => !f.archivedAt).map((f) => f.id));
  const missing = ids.findIndex((id) => !ok.has(id));
  if (missing >= 0) {
    throw new HttpError(400, "validation", "Ada isian yang belum benar.", {
      [`memberships.${missing}.mosqueId`]: "masjid tidak ditemukan atau sudah diarsipkan",
    });
  }
}

export async function adminUserRoutes(app: FastifyInstance, { db }: { db: Db }): Promise<void> {
  app.get("/api/admin/users", { preHandler: app.requireSuperAdmin }, async () => {
    const rows = await db.select().from(users).orderBy(users.email);
    const ms = await membershipsOf(db, rows.map((r) => r.id));
    return { users: rows.map((u) => toDto(u, ms.get(u.id) ?? [])) };
  });

  app.post("/api/admin/users", { preHandler: app.requireSuperAdmin }, async (req, reply) => {
    const input = parse(createSchema, req.body);
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (exists) throw new HttpError(409, "conflict", "Email ini sudah terdaftar.", { email: "sudah terdaftar" });
    await assertMosquesExist(db, input.memberships);

    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ id, email: input.email, isSuperAdmin: input.isSuperAdmin, createdBy: req.auth!.user.id });
      if (input.memberships.length) {
        await tx.insert(memberships).values(input.memberships.map((m) => ({ userId: id, mosqueId: m.mosqueId, role: m.role })));
      }
    });
    await audit(db, { userId: req.auth!.user.id, action: "user.create", entity: "user", entityId: id, diff: { new: input }, ip: req.ip });

    const [created] = await db.select().from(users).where(eq(users.id, id));
    const ms = await membershipsOf(db, [id]);
    return reply.code(201).send({ user: toDto(created!, ms.get(id) ?? []) });
  });

  app.patch("/api/admin/users/:id", { preHandler: app.requireSuperAdmin }, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateSchema, req.body);
    if (Object.keys(input).length === 0) throw new HttpError(400, "validation", "Tidak ada yang diubah.");

    const [before] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!before) throw notFound("Pengguna");
    const self = id === req.auth!.user.id;

    if (self && input.status === "disabled") {
      throw new HttpError(409, "conflict", "Anda tidak bisa menonaktifkan akun sendiri.");
    }
    if (self && input.isSuperAdmin === false) {
      throw new HttpError(409, "conflict", "Anda tidak bisa mencabut status super admin akun sendiri.");
    }
    // Harus selalu ada minimal satu super admin aktif.
    const losesSuper =
      before.isSuperAdmin && before.status === "active" && (input.isSuperAdmin === false || input.status === "disabled");
    if (losesSuper) {
      const others = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.isSuperAdmin, true), eq(users.status, "active"), ne(users.id, id)))
        .limit(1);
      if (others.length === 0) throw new HttpError(409, "conflict", "Harus ada minimal satu super admin aktif.");
    }
    if (input.memberships) await assertMosquesExist(db, input.memberships);

    const oldMs = (await membershipsOf(db, [id])).get(id) ?? [];
    await db.transaction(async (tx) => {
      if (input.isSuperAdmin !== undefined || input.status !== undefined) {
        await tx
          .update(users)
          .set({
            ...(input.isSuperAdmin !== undefined && { isSuperAdmin: input.isSuperAdmin }),
            ...(input.status !== undefined && { status: input.status }),
          })
          .where(eq(users.id, id));
      }
      if (input.memberships) {
        await tx.delete(memberships).where(eq(memberships.userId, id));
        if (input.memberships.length) {
          await tx.insert(memberships).values(input.memberships.map((m) => ({ userId: id, mosqueId: m.mosqueId, role: m.role })));
        }
      }
      // Akun yang dinonaktifkan langsung keluar dari semua perangkat.
      if (input.status === "disabled") await tx.delete(sessions).where(eq(sessions.userId, id));
    });

    await audit(db, {
      userId: req.auth!.user.id,
      action: input.status === "disabled" ? "user.disable" : input.status === "active" && before.status === "disabled" ? "user.enable" : "user.update",
      entity: "user",
      entityId: id,
      diff: {
        old: { isSuperAdmin: before.isSuperAdmin, status: before.status, memberships: oldMs.map(({ mosqueId, role }) => ({ mosqueId, role })) },
        new: input,
      },
      ip: req.ip,
    });

    const [after] = await db.select().from(users).where(eq(users.id, id));
    const ms = await membershipsOf(db, [id]);
    return { user: toDto(after!, ms.get(id) ?? []) };
  });
}
