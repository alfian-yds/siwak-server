import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type MosqueRole, requireDeviceRole, requireMosqueRole } from "../auth/access.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { type CommandType, commandTypes, deviceCommands, deviceEvents, devices, pairingCodes } from "../db/schema.js";
import { HttpError, forbidden, parse } from "../http.js";
import { audit } from "../services/audit.js";
import { makePin, readPin } from "../services/device-secrets.js";
import { bumpConfigVersion } from "./admin-settings.js";

/** TV dianggap online bila heartbeat terakhir ≤ 5 menit (TRD §13). */
export const ONLINE_WINDOW_MS = 5 * 60_000;
/** Perintah yang belum selesai dalam 10 menit menjadi kedaluwarsa (TRD §7.4). */
export const COMMAND_TTL_MS = 10 * 60_000;

const commandMinRole: Record<CommandType, MosqueRole> = { open_app: "operator", sync_now: "admin", restart_app: "admin", show_mutiara: "operator" };

const mosqueParam = z.object({ id: z.string().uuid("id masjid tidak sah") });
const deviceParam = z.object({ id: z.string().uuid("id TV tidak sah") });
const deviceName = z.string().trim().min(1, "nama TV wajib diisi").max(60, "maksimal 60 karakter");
const claimBody = z
  .object({
    code: z
      .string()
      .transform((s) => s.replace(/\D/g, ""))
      .pipe(z.string().length(8, "kode terdiri dari 8 angka")),
    mosqueId: z.string().uuid("pilih masjid"),
    name: deviceName,
  })
  .strict();
const commandBody = z.object({ type: z.enum(commandTypes, { message: "jenis perintah tidak dikenal" }) }).strict();

type DeviceRow = typeof devices.$inferSelect;
type CommandRow = typeof deviceCommands.$inferSelect;

export function deviceStatus(d: DeviceRow, now = Date.now()) {
  return {
    online: d.lastSeenAt !== null && now - d.lastSeenAt.getTime() <= ONLINE_WINDOW_MS,
    lastSeenAt: d.lastSeenAt,
    app: { foreground: d.appForeground, since: d.appStateSince, canOpenApp: d.canOpenApp },
    clockDriftSec: d.clockDriftSec,
    /** Status penerapan pengaturan di TV (agar pengurus tahu perubahan sudah berjalan). */
    lastConfigVersion: d.lastConfigVersion,
    configAppliedAt: d.configAppliedAt,
    lastError: d.lastError,
    lastErrorAt: d.lastErrorAt,
  };
}

const commandDto = (c: CommandRow) => ({
  id: c.id,
  type: c.type,
  status: c.status,
  createdAt: c.createdAt,
  deliveredAt: c.deliveredAt,
  finishedAt: c.finishedAt,
  result: c.result,
});

export async function adminDeviceRoutes(app: FastifyInstance, { db, config }: { db: Db; config: Config }): Promise<void> {
  /** Daftar TV masjid beserta status dan perintah terakhir per jenis (30 menit terakhir). */
  app.get("/api/admin/mosques/:id/devices", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    const { mosque, role } = await requireMosqueRole(db, req, id, "operator");
    const rows = await db
      .select()
      .from(devices)
      .where(and(eq(devices.mosqueId, id), isNull(devices.revokedAt)))
      .orderBy(devices.name);

    const ids = rows.map((r) => r.id);
    const recent = ids.length
      ? await db
          .select()
          .from(deviceCommands)
          .where(and(inArray(deviceCommands.deviceId, ids), gt(deviceCommands.createdAt, new Date(Date.now() - 30 * 60_000))))
          .orderBy(desc(deviceCommands.createdAt))
      : [];
    const latest = new Map<string, CommandRow>();
    for (const c of recent) if (!latest.has(`${c.deviceId}:${c.type}`)) latest.set(`${c.deviceId}:${c.type}`, c);

    const now = Date.now();
    return {
      role,
      configVersion: mosque.configVersion,
      devices: rows.map((d) => ({
        id: d.id,
        name: d.name,
        model: d.model,
        appVersion: d.appVersion,
        pairedAt: d.pairedAt,
        synced: d.lastConfigVersion === mosque.configVersion,
        tokenDelivered: d.tokenHash !== null,
        ...deviceStatus(d, now),
        commands: commandTypes.flatMap((t) => {
          const c = latest.get(`${d.id}:${t}`);
          return c ? [commandDto(c)] : [];
        }),
      })),
    };
  });

  /** Hubungkan TV: pengurus memasukkan 8 digit yang tampil di TV (TRD §6). */
  app.post(
    "/api/admin/pairing/claim",
    {
      preHandler: app.requireApiAuth,
      config: { rateLimit: { max: 10, timeWindow: "10 minutes", keyGenerator: (req) => req.auth?.user.id ?? req.ip } },
    },
    async (req, reply) => {
      const input = parse(claimBody, req.body);
      await requireMosqueRole(db, req, input.mosqueId, "admin");
      const notFoundCode = new HttpError(404, "pairing_not_found", "Kode tidak ditemukan atau sudah kedaluwarsa. Periksa angka di layar TV.");

      const [pairing] = await db
        .select()
        .from(pairingCodes)
        .where(and(eq(pairingCodes.activeCode, input.code), isNull(pairingCodes.claimedAt), gt(pairingCodes.expiresAt, new Date())))
        .limit(1);
      if (!pairing) throw notFoundCode;

      const deviceId = randomUUID();
      const pin = makePin(config.PIN_ENCRYPTION_KEY);
      const claimed = await db.transaction(async (tx) => {
        // Klaim bersyarat: bila dua orang menekan Hubungkan bersamaan, hanya satu yang menang.
        const [res] = await tx
          .update(pairingCodes)
          .set({ claimedAt: new Date(), claimedBy: req.auth!.user.id, activeCode: null, deviceId: null })
          .where(and(eq(pairingCodes.id, pairing.id), isNull(pairingCodes.claimedAt)));
        if (res.affectedRows !== 1) return false;
        await tx.insert(devices).values({
          id: deviceId,
          mosqueId: input.mosqueId,
          name: input.name,
          tokenHash: null, // kunci dibuat saat TV mengambilnya (sekali saja)
          pinCiphertext: pin.pinCiphertext,
          pinSalt: pin.pinSalt,
          pinHash: pin.pinHash,
          appVersion: pairing.appVersion,
          model: pairing.model,
          pairedBy: req.auth!.user.id,
        });
        await tx.update(pairingCodes).set({ deviceId }).where(eq(pairingCodes.id, pairing.id));
        await tx.insert(deviceEvents).values({ deviceId, type: "paired", detail: { by: req.auth!.user.email } });
        return true;
      });
      if (!claimed) throw notFoundCode;

      await audit(db, {
        userId: req.auth!.user.id,
        mosqueId: input.mosqueId,
        action: "device.pair",
        entity: "device",
        entityId: deviceId,
        diff: { new: { name: input.name, model: pairing.model } },
        ip: req.ip,
      });
      return reply.code(201).send({ device: { id: deviceId, name: input.name }, pin: pin.pin });
    },
  );

  app.patch("/api/admin/devices/:id", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(deviceParam, req.params);
    const { name } = parse(z.object({ name: deviceName }).strict(), req.body);
    const { device } = await requireDeviceRole(db, req, id, "admin");
    await db.update(devices).set({ name }).where(eq(devices.id, id));
    await bumpConfigVersion(db, device.mosqueId); // nama TV ikut di bundle
    await audit(db, { userId: req.auth!.user.id, mosqueId: device.mosqueId, action: "device.rename", entity: "device", entityId: id, diff: { old: device.name, new: name }, ip: req.ip });
    return { device: { id, name } };
  });

  /** Lepas TV: kunci perangkat dicabut; TV kembali ke mode mandiri pada kontak berikutnya. */
  app.post("/api/admin/devices/:id/unpair", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(deviceParam, req.params);
    const { device } = await requireDeviceRole(db, req, id, "admin");
    await db.update(devices).set({ tokenHash: null, revokedAt: new Date(), isOnline: false }).where(eq(devices.id, id));
    await db.insert(deviceEvents).values({ deviceId: id, type: "unpaired", detail: { by: req.auth!.user.email } });
    await audit(db, { userId: req.auth!.user.id, mosqueId: device.mosqueId, action: "device.unpair", entity: "device", entityId: id, diff: { old: { name: device.name } }, ip: req.ip });
    return { ok: true };
  });

  /** Melihat PIN (TRD §10). Setiap kali dilihat tercatat di log. */
  app.get("/api/admin/devices/:id/pin", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(deviceParam, req.params);
    const { device } = await requireDeviceRole(db, req, id, "admin");
    const pin = readPin(config.PIN_ENCRYPTION_KEY, device.pinCiphertext);
    await audit(db, { userId: req.auth!.user.id, mosqueId: device.mosqueId, action: "device.pin.view", entity: "device", entityId: id, ip: req.ip });
    return { pin, updatedAt: device.pinUpdatedAt };
  });

  app.post("/api/admin/devices/:id/pin", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(deviceParam, req.params);
    const { device } = await requireDeviceRole(db, req, id, "admin");
    const pin = makePin(config.PIN_ENCRYPTION_KEY);
    const updatedAt = new Date();
    await db
      .update(devices)
      .set({ pinCiphertext: pin.pinCiphertext, pinSalt: pin.pinSalt, pinHash: pin.pinHash, pinUpdatedAt: updatedAt })
      .where(eq(devices.id, id));
    await bumpConfigVersion(db, device.mosqueId); // PIN baru sampai ke TV lewat bundle
    await audit(db, { userId: req.auth!.user.id, mosqueId: device.mosqueId, action: "device.pin.reset", entity: "device", entityId: id, ip: req.ip });
    return { pin: pin.pin, updatedAt };
  });

  /** Membuat perintah untuk satu TV; bila perintah sejenis masih berjalan, kembalikan yang itu. */
  async function queueCommand(deviceId: string, type: CommandType, userId: string) {
    const [active] = await db
      .select()
      .from(deviceCommands)
      .where(
        and(
          eq(deviceCommands.deviceId, deviceId),
          eq(deviceCommands.type, type),
          inArray(deviceCommands.status, ["pending", "delivered"]),
          gt(deviceCommands.createdAt, new Date(Date.now() - COMMAND_TTL_MS)),
        ),
      )
      .limit(1);
    if (active) return { command: commandDto(active), reused: true };
    const commandId = randomUUID();
    await db.insert(deviceCommands).values({ id: commandId, deviceId, type, createdBy: userId });
    const [created] = await db.select().from(deviceCommands).where(eq(deviceCommands.id, commandId));
    return { command: commandDto(created!), reused: false };
  }

  const assertCommandRole = (role: MosqueRole, type: CommandType) => {
    const rank = { operator: 1, admin: 2, super: 3 } as const;
    if (rank[role] < rank[commandMinRole[type]]) throw forbidden("Hanya admin masjid yang bisa mengirim perintah ini.");
  };

  /** Perintah jarak jauh ke satu TV (TRD §7.4). */
  app.post("/api/admin/devices/:id/commands", { preHandler: app.requireApiAuth }, async (req, reply) => {
    const { id } = parse(deviceParam, req.params);
    const { type } = parse(commandBody, req.body);
    const { device, role } = await requireDeviceRole(db, req, id, "operator");
    assertCommandRole(role, type);
    const result = await queueCommand(id, type, req.auth!.user.id);
    if (!result.reused) {
      await audit(db, { userId: req.auth!.user.id, mosqueId: device.mosqueId, action: `device.command.${type}`, entity: "device", entityId: id, ip: req.ip });
    }
    return reply.code(result.reused ? 200 : 201).send(result);
  });

  /** Perintah yang sama ke semua TV masjid (mis. "Tampilkan Mutiara Hadits sekarang"). */
  app.post("/api/admin/mosques/:id/commands", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    const { type } = parse(commandBody, req.body);
    const { role } = await requireMosqueRole(db, req, id, "operator");
    assertCommandRole(role, type);
    const rows = await db
      .select({ id: devices.id, name: devices.name })
      .from(devices)
      .where(and(eq(devices.mosqueId, id), isNull(devices.revokedAt), isNotNull(devices.tokenHash)));
    const results = [];
    for (const d of rows) results.push({ deviceId: d.id, name: d.name, ...(await queueCommand(d.id, type, req.auth!.user.id)) });
    if (rows.length) await audit(db, { userId: req.auth!.user.id, mosqueId: id, action: `device.command.${type}`, entity: "mosque", entityId: id, diff: { tvs: rows.length }, ip: req.ip });
    return { results };
  });
}
