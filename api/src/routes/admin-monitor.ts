/**
 * Pemantauan (Tahap 3): dasbor semua TV yang boleh dilihat pengguna, riwayat kejadian per TV
 * (F-ADM-16), dan log aktivitas (F-ADM-17).
 */
import { type SQL, and, desc, eq, inArray, isNull, like, lt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDeviceRole, requireMosqueRole } from "../auth/access.js";
import type { Db } from "../db/client.js";
import { activityLogs, deviceEvents, devices, memberships, mosques, users } from "../db/schema.js";
import { parse } from "../http.js";
import { CLOCK_DRIFT_WARN_SEC } from "./device-api.js";
import { deviceStatus } from "./admin-devices.js";

const deviceParam = z.object({ id: z.string().uuid("id TV tidak sah") });
const mosqueParam = z.object({ id: z.string().uuid("id masjid tidak sah") });
const pageQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const activityQuery = pageQuery.extend({
  mosqueId: z.string().uuid().optional(),
  /** Awalan aksi, mis. "settings" atau "device". */
  action: z
    .string()
    .regex(/^[a-z_.]{1,40}$/, "aksi tidak dikenal")
    .optional(),
});

export async function adminMonitorRoutes(app: FastifyInstance, { db }: { db: Db }): Promise<void> {
  /** Semua TV di masjid yang boleh dilihat pengguna (super admin: semua masjid aktif). */
  app.get("/api/admin/devices", { preHandler: app.requireApiAuth }, async (req) => {
    const user = req.auth!.user;
    const conds: SQL[] = [isNull(devices.revokedAt), isNull(mosques.archivedAt)];
    if (!user.isSuperAdmin) {
      const mine = await db.select({ id: memberships.mosqueId }).from(memberships).where(eq(memberships.userId, user.id));
      if (mine.length === 0) return { devices: [], summary: summarize([]), driftWarnSec: CLOCK_DRIFT_WARN_SEC };
      conds.push(inArray(devices.mosqueId, mine.map((m) => m.id)));
    }
    const rows = await db
      .select({ d: devices, mosqueName: mosques.name, configVersion: mosques.configVersion })
      .from(devices)
      .innerJoin(mosques, eq(mosques.id, devices.mosqueId))
      .where(and(...conds))
      .orderBy(mosques.name, devices.name);
    const now = Date.now();
    const list = rows.map(({ d, mosqueName, configVersion }) => ({
      id: d.id,
      name: d.name,
      mosque: { id: d.mosqueId, name: mosqueName },
      model: d.model,
      appVersion: d.appVersion,
      pairedAt: d.pairedAt,
      tokenDelivered: d.tokenHash !== null,
      synced: d.lastConfigVersion === configVersion,
      ...deviceStatus(d, now),
    }));
    return { devices: list, summary: summarize(list), driftWarnSec: CLOCK_DRIFT_WARN_SEC };
  });

  /** Riwayat kejadian satu TV, terbaru dulu. */
  app.get("/api/admin/devices/:id/events", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(deviceParam, req.params);
    const { before, limit } = parse(pageQuery, req.query);
    await requireDeviceRole(db, req, id, "operator");
    const rows = await db
      .select()
      .from(deviceEvents)
      .where(and(eq(deviceEvents.deviceId, id), before ? lt(deviceEvents.id, before) : undefined))
      .orderBy(desc(deviceEvents.id))
      .limit(limit + 1);
    return page(rows.map((e) => ({ id: e.id, type: e.type, detail: e.detail, at: e.at })), limit);
  });

  /** Log aktivitas satu masjid (admin masjid ke atas). */
  app.get("/api/admin/mosques/:id/activity", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    const q = parse(activityQuery, req.query);
    const { role } = await requireMosqueRole(db, req, id, "admin");
    return listActivity(db, { ...q, mosqueId: id }, role === "super");
  });

  /** Log aktivitas seluruh server, termasuk masuk/keluar dan pengelolaan pengguna (super admin). */
  app.get("/api/admin/activity", { preHandler: app.requireSuperAdmin }, async (req) => {
    const q = parse(activityQuery, req.query);
    return listActivity(db, q, true);
  });
}

type Listed = { online: boolean; app: { foreground: boolean | null }; clockDriftSec: number | null };
function summarize(list: Listed[]) {
  return {
    total: list.length,
    online: list.filter((d) => d.online).length,
    offline: list.filter((d) => !d.online).length,
    background: list.filter((d) => d.online && d.app.foreground === false).length,
    clockDrift: list.filter((d) => d.online && Math.abs(d.clockDriftSec ?? 0) > CLOCK_DRIFT_WARN_SEC).length,
  };
}

function page<T extends { id: number }>(rows: T[], limit: number) {
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  return { items, nextBefore: more ? items[items.length - 1]!.id : null };
}

async function listActivity(
  db: Db,
  q: { before?: number; limit: number; mosqueId?: string; action?: string },
  showIp: boolean,
) {
  const rows = await db
    .select({ l: activityLogs, userName: users.name, userEmail: users.email, mosqueName: mosques.name })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.userId))
    .leftJoin(mosques, eq(mosques.id, activityLogs.mosqueId))
    .where(
      and(
        q.mosqueId ? eq(activityLogs.mosqueId, q.mosqueId) : undefined,
        q.before ? lt(activityLogs.id, q.before) : undefined,
        q.action ? like(activityLogs.action, `${q.action}%`) : undefined,
      ),
    )
    .orderBy(desc(activityLogs.id))
    .limit(q.limit + 1);
  return page(
    rows.map(({ l, userName, userEmail, mosqueName }) => ({
      id: l.id,
      at: l.at,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      diff: l.diff,
      user: l.userId ? { id: l.userId, name: userName, email: userEmail } : null,
      mosque: l.mosqueId ? { id: l.mosqueId, name: mosqueName } : null,
      ...(showIp && { ip: l.ip }),
    })),
    q.limit,
  );
}
