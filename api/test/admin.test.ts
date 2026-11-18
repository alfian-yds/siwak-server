import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { IdentityProvider } from "../src/auth/identity.js";
import { createSession } from "../src/auth/session.js";
import { type Db, createDb } from "../src/db/client.js";
import { activityLogs, memberships, mosqueSettings, mosques, sessions, users } from "../src/db/schema.js";
import { SETTINGS_SCHEMA_VERSION, mosqueSettingsSchema } from "../src/settings/schema.js";
import { testConfig } from "./helpers.js";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

const noIdentity: IdentityProvider = {
  start: () => Promise.reject(new Error("tidak dipakai")),
  finish: () => Promise.reject(new Error("tidak dipakai")),
};

describe.skipIf(!hasDb)("API super admin: pengguna & masjid (basis data uji)", () => {
  let app: FastifyInstance;
  let db: Db;
  let pool: { end: () => Promise<void> };

  beforeAll(async () => {
    const created = createDb(process.env.TEST_DATABASE_URL!);
    db = created.db;
    pool = created.pool;
    app = await buildApp({ config: testConfig(), db, identity: noIdentity });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await db.delete(sessions);
    await db.delete(activityLogs);
    await db.delete(memberships);
    await db.delete(mosqueSettings);
    await db.delete(mosques);
    await db.delete(users);
  });

  /** Membuat pengguna + sesi, lalu mengembalikan fungsi pemanggil API atas namanya. */
  async function actor(email: string, isSuperAdmin: boolean) {
    const id = randomUUID();
    await db.insert(users).values({ id, email, isSuperAdmin });
    const s = await createSession(db, id, {});
    const call = (method: "GET" | "POST" | "PATCH", url: string, payload?: unknown, csrf = true) =>
      app.inject({
        method,
        url,
        cookies: { siwak_sid: s.id },
        headers: csrf ? { "x-csrf-token": s.csrfToken } : {},
        ...(payload !== undefined && { payload: payload as object }),
      });
    return { id, call };
  }

  const masjidBaru = { name: "Masjid Al-Hidayah", regionLabel: "Kota Bandung", latitude: -6.914744, longitude: 107.60981 };

  it("pengurus biasa ditolak 403 di rute super admin, tamu ditolak 401", async () => {
    const op = await actor("op@example.com", false);
    expect((await op.call("GET", "/api/admin/users")).statusCode).toBe(403);
    expect((await op.call("POST", "/api/admin/mosques", masjidBaru)).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/admin/users" })).statusCode).toBe(401);
  });

  it("permintaan tanpa token CSRF ditolak", async () => {
    const sa = await actor("sa@example.com", true);
    const res = await sa.call("POST", "/api/admin/mosques", masjidBaru, false);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("csrf");
  });

  it("membuat masjid sekaligus pengaturan bawaan yang sah, slug unik", async () => {
    const sa = await actor("sa@example.com", true);
    const a = await sa.call("POST", "/api/admin/mosques", masjidBaru);
    expect(a.statusCode).toBe(201);
    const m = a.json().mosque;
    expect(m).toMatchObject({ name: "Masjid Al-Hidayah", slug: "masjid-al-hidayah", timezone: "Asia/Jakarta", latitude: -6.914744 });

    const [st] = await db.select().from(mosqueSettings).where(eq(mosqueSettings.mosqueId, m.id));
    expect(st?.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(mosqueSettingsSchema.safeParse(st?.data).success).toBe(true);

    const b = await sa.call("POST", "/api/admin/mosques", masjidBaru);
    expect(b.json().mosque.slug).toBe("masjid-al-hidayah-2");

    const logs = await db.select().from(activityLogs).where(eq(activityLogs.action, "mosque.create"));
    expect(logs).toHaveLength(2);
  });

  it("validasi masjid mengembalikan pesan per isian", async () => {
    const sa = await actor("sa@example.com", true);
    const res = await sa.call("POST", "/api/admin/mosques", { name: "X", latitude: 120, longitude: 0, timezone: "Mars/Olympus" });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().error.fields).sort()).toEqual(["latitude", "name", "timezone"]);
  });

  it("mengubah lokasi menaikkan config_version; mengubah label wilayah tidak", async () => {
    const sa = await actor("sa@example.com", true);
    const { id } = (await sa.call("POST", "/api/admin/mosques", masjidBaru)).json().mosque;
    const version = async () => (await db.select().from(mosques).where(eq(mosques.id, id)))[0]!.configVersion;
    const v0 = await version();

    expect((await sa.call("PATCH", `/api/admin/mosques/${id}`, { regionLabel: "Kab. Bandung" })).statusCode).toBe(200);
    expect(await version()).toBe(v0);

    expect((await sa.call("PATCH", `/api/admin/mosques/${id}`, { latitude: -6.9 })).statusCode).toBe(200);
    expect(await version()).toBe(v0 + 1);
  });

  it("arsip masjid menyembunyikannya dari daftar utama", async () => {
    const sa = await actor("sa@example.com", true);
    const { id } = (await sa.call("POST", "/api/admin/mosques", masjidBaru)).json().mosque;
    await sa.call("PATCH", `/api/admin/mosques/${id}`, { archived: true });
    expect((await sa.call("GET", "/api/admin/mosques")).json().mosques).toHaveLength(0);
    expect((await sa.call("GET", "/api/admin/mosques?archived=1")).json().mosques).toHaveLength(1);
  });

  it("pengurus hanya melihat masjid yang menjadi haknya", async () => {
    const sa = await actor("sa@example.com", true);
    const m1 = (await sa.call("POST", "/api/admin/mosques", masjidBaru)).json().mosque;
    await sa.call("POST", "/api/admin/mosques", { ...masjidBaru, name: "Musholla An-Nur" });
    const op = await actor("op@example.com", false);
    await db.insert(memberships).values({ userId: op.id, mosqueId: m1.id, role: "operator" });

    const list = (await op.call("GET", "/api/admin/mosques")).json().mosques;
    expect(list.map((m: { id: string }) => m.id)).toEqual([m1.id]);
    expect((await sa.call("GET", "/api/admin/mosques")).json().mosques).toHaveLength(2);
  });

  it("membuat pengguna dengan peran masjid; email ganda ditolak 409 tanpa peka huruf besar", async () => {
    const sa = await actor("sa@example.com", true);
    const m = (await sa.call("POST", "/api/admin/mosques", masjidBaru)).json().mosque;

    const res = await sa.call("POST", "/api/admin/users", {
      email: "  Takmir@Example.com ",
      memberships: [{ mosqueId: m.id, role: "admin" }],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({
      email: "takmir@example.com",
      isSuperAdmin: false,
      status: "active",
      memberships: [{ mosqueId: m.id, mosqueName: "Masjid Al-Hidayah", role: "admin" }],
    });

    const dup = await sa.call("POST", "/api/admin/users", { email: "TAKMIR@example.com" });
    expect(dup.statusCode).toBe(409);
  });

  it("menolak peran ke masjid yang tidak ada", async () => {
    const sa = await actor("sa@example.com", true);
    const res = await sa.call("POST", "/api/admin/users", {
      email: "x@example.com",
      memberships: [{ mosqueId: randomUUID(), role: "admin" }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toHaveProperty("memberships.0.mosqueId");
  });

  it("mengganti daftar peran pengguna sebagai satu set", async () => {
    const sa = await actor("sa@example.com", true);
    const m1 = (await sa.call("POST", "/api/admin/mosques", masjidBaru)).json().mosque;
    const m2 = (await sa.call("POST", "/api/admin/mosques", { ...masjidBaru, name: "Musholla An-Nur" })).json().mosque;
    const u = (await sa.call("POST", "/api/admin/users", { email: "u@example.com", memberships: [{ mosqueId: m1.id, role: "admin" }] })).json().user;

    const res = await sa.call("PATCH", `/api/admin/users/${u.id}`, { memberships: [{ mosqueId: m2.id, role: "operator" }] });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.memberships).toEqual([{ mosqueId: m2.id, mosqueName: "Musholla An-Nur", role: "operator" }]);
  });

  it("tidak bisa menonaktifkan atau mencabut super admin diri sendiri", async () => {
    const sa = await actor("sa@example.com", true);
    expect((await sa.call("PATCH", `/api/admin/users/${sa.id}`, { status: "disabled" })).statusCode).toBe(409);
    expect((await sa.call("PATCH", `/api/admin/users/${sa.id}`, { isSuperAdmin: false })).statusCode).toBe(409);
  });

  it("menonaktifkan pengguna langsung mengeluarkannya; mengaktifkan lagi memulihkan akses login", async () => {
    const sa = await actor("sa@example.com", true);
    const other = await actor("sa2@example.com", true);

    expect((await sa.call("PATCH", `/api/admin/users/${other.id}`, { status: "disabled" })).statusCode).toBe(200);
    expect(await db.select().from(sessions).where(eq(sessions.userId, other.id))).toHaveLength(0);
    expect((await other.call("GET", "/api/admin/me")).statusCode).toBe(401);

    const back = await sa.call("PATCH", `/api/admin/users/${other.id}`, { status: "active" });
    expect(back.json().user.status).toBe("active");
    const actions = (await db.select().from(activityLogs)).map((l) => l.action).sort();
    expect(actions).toEqual(["user.disable", "user.enable"]);
  });
});
