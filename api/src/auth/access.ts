import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Db } from "../db/client.js";
import { devices, memberships, mosques } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../http.js";

/** Urutan hak: operator < admin < super admin (TRD §5.1). */
export type MosqueRole = "operator" | "admin" | "super";
const rank: Record<MosqueRole, number> = { operator: 1, admin: 2, super: 3 };

/**
 * Memastikan pengguna yang masuk punya hak minimal `min` di masjid itu. Super admin selalu boleh.
 * Mengembalikan baris masjid dan peran efektif. Masjid yang diarsipkan hanya bisa dibuka super admin.
 */
export async function requireMosqueRole(db: Db, req: FastifyRequest, mosqueId: string, min: MosqueRole) {
  const user = req.auth?.user;
  if (!user) throw new HttpError(401, "unauthenticated", "Silakan masuk terlebih dahulu.");
  const [mosque] = await db.select().from(mosques).where(eq(mosques.id, mosqueId)).limit(1);
  if (!mosque) throw notFound("Masjid");

  let role: MosqueRole | null = null;
  if (user.isSuperAdmin) role = "super";
  else {
    const [m] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.mosqueId, mosqueId)))
      .limit(1);
    if (m) role = m.role;
  }
  // Tidak membedakan "tidak ada" dan "bukan hak Anda" bagi orang luar.
  if (!role) throw notFound("Masjid");
  if (mosque.archivedAt && role !== "super") throw notFound("Masjid");
  if (rank[role] < rank[min]) {
    throw forbidden(min === "admin" ? "Hanya admin masjid yang bisa mengubah ini." : "Anda tidak punya akses untuk tindakan ini.");
  }
  return { mosque, role };
}

/** Sama seperti requireMosqueRole, berdasarkan TV (perangkat yang belum dicabut). */
export async function requireDeviceRole(db: Db, req: FastifyRequest, deviceId: string, min: MosqueRole) {
  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (!device || device.revokedAt) throw notFound("TV");
  const access = await requireMosqueRole(db, req, device.mosqueId, min);
  return { device, ...access };
}
