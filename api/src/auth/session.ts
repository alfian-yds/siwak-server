import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

export const SESSION_COOKIE = "siwak_sid";
export const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Masa berlaku diperpanjang paling sering sekali per jam, agar tidak menulis DB di setiap permintaan. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** 32 byte acak dalam base64url = 43 karakter. */
export const newToken = () => randomBytes(32).toString("base64url");

export type SessionUser = typeof users.$inferSelect;

export interface ActiveSession {
  id: string;
  csrfToken: string;
  expiresAt: Date;
  user: SessionUser;
}

export async function createSession(
  db: Db,
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<{ id: string; csrfToken: string; expiresAt: Date }> {
  const id = newToken();
  const csrfToken = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
  await db.insert(sessions).values({
    id,
    userId,
    csrfToken,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 300),
    ip: meta.ip?.slice(0, 45),
  });
  return { id, csrfToken, expiresAt };
}

/** Mengembalikan sesi yang masih berlaku milik pengguna aktif, atau null. */
export async function findSession(db: Db, id: string): Promise<ActiveSession | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return null;
  const now = new Date();
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row || row.user.status !== "active") return null;

  let expiresAt = row.session.expiresAt;
  if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
    await db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id));
  }
  return { id, csrfToken: row.session.csrfToken, expiresAt, user: row.user };
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}
