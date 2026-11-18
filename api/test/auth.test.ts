import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { IdentityClaims, IdentityProvider } from "../src/auth/identity.js";
import { bootstrap } from "../src/bootstrap.js";
import { type Db, createDb } from "../src/db/client.js";
import { activityLogs, appState, sessions, users } from "../src/db/schema.js";
import { cookieFrom, testConfig } from "./helpers.js";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

/** Penyedia login tiruan: menggantikan Google, klaim yang dikembalikan bisa diatur per uji. */
function fakeIdentity() {
  let claims: IdentityClaims = { sub: "g-1", email: "admin@example.com", emailVerified: true, name: "Admin" };
  const provider: IdentityProvider = {
    async start() {
      return { url: "https://idp.test/authorize?state=STATE123", state: "STATE123", nonce: "N", codeVerifier: "V" };
    },
    async finish() {
      return claims;
    },
  };
  return { provider, setClaims: (c: Partial<IdentityClaims>) => (claims = { ...claims, ...c }) };
}

describe.skipIf(!hasDb)("login Google & sesi (basis data uji)", () => {
  let app: FastifyInstance;
  let db: Db;
  let pool: { end: () => Promise<void> };
  const idp = fakeIdentity();

  beforeAll(async () => {
    const created = createDb(process.env.TEST_DATABASE_URL!);
    db = created.db;
    pool = created.pool;
    app = await buildApp({ config: testConfig(), db, identity: idp.provider });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await db.delete(sessions);
    await db.delete(activityLogs);
    await db.delete(users);
    await bootstrap(db, { SUPERADMIN_EMAIL: "Admin@Example.com" });
    idp.setClaims({ sub: "g-1", email: "admin@example.com", emailVerified: true, name: "Admin" });
  });

  /** Menjalankan alur masuk lengkap dan mengembalikan respons callback. */
  async function login(state = "STATE123") {
    const start = await app.inject({ method: "GET", url: "/auth/google" });
    const oauth = cookieFrom(start.headers["set-cookie"], "siwak_oauth");
    return app.inject({
      method: "GET",
      url: `/auth/google/callback?code=abc&state=${state}`,
      cookies: oauth ? { siwak_oauth: decodeURIComponent(oauth) } : {},
    });
  }

  it("bootstrap membuat super admin dan baris app_state, dan aman dijalankan ulang", async () => {
    await bootstrap(db, { SUPERADMIN_EMAIL: "admin@example.com" });
    const admins = await db.select().from(users);
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({ email: "admin@example.com", isSuperAdmin: true, status: "active" });
    expect(await db.select().from(appState)).toHaveLength(1);
  });

  it("/auth/google mengalihkan ke penyedia login dan menyimpan cookie state", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/google" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://idp.test/authorize?state=STATE123");
    expect(cookieFrom(res.headers["set-cookie"], "siwak_oauth")).toBeTruthy();
  });

  it("super admin terdaftar bisa masuk, mendapat sesi, dan /api/admin/me berisi datanya", async () => {
    const res = await login();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/admin");
    const sid = cookieFrom(res.headers["set-cookie"], "siwak_sid");
    expect(sid).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const me = await app.inject({ method: "GET", url: "/api/admin/me", cookies: { siwak_sid: sid! } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { email: "admin@example.com", isSuperAdmin: true, name: "Admin" } });

    const [u] = await db.select().from(users).where(eq(users.email, "admin@example.com"));
    expect(u?.googleSub).toBe("g-1");
    const logs = await db.select().from(activityLogs);
    expect(logs.map((l) => l.action)).toContain("auth.login");
  });

  it("email yang tidak terdaftar ditolak dengan pesan jelas dan tanpa sesi", async () => {
    idp.setClaims({ email: "orang.lain@example.com", sub: "g-2" });
    const res = await login();
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain("belum terdaftar");
    expect(cookieFrom(res.headers["set-cookie"], "siwak_sid")).toBeUndefined();
  });

  it("pengguna yang dinonaktifkan ditolak", async () => {
    await db.update(users).set({ status: "disabled" }).where(eq(users.email, "admin@example.com"));
    const res = await login();
    expect(res.statusCode).toBe(403);
  });

  it("email yang belum diverifikasi Google ditolak", async () => {
    idp.setClaims({ emailVerified: false });
    const res = await login();
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain("belum terverifikasi");
  });

  it("akun Google berbeda untuk email yang sudah tertaut ditolak", async () => {
    await login(); // menautkan g-1
    idp.setClaims({ sub: "g-penyusup" });
    const res = await login();
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain("akun Google lain");
  });

  it("state yang tidak cocok ditolak (cegah CSRF login)", async () => {
    const res = await login("STATE-PALSU");
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/admin/login?pesan=gagal");
  });

  it("tanpa sesi: API menjawab 401 dan halaman admin mengalihkan ke halaman masuk", async () => {
    expect((await app.inject({ method: "GET", url: "/api/admin/me" })).statusCode).toBe(401);
    const page = await app.inject({ method: "GET", url: "/admin" });
    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe("/admin/login");
    const bogus = await app.inject({ method: "GET", url: "/api/admin/me", cookies: { siwak_sid: "x".repeat(43) } });
    expect(bogus.statusCode).toBe(401);
  });

  it("keluar butuh token CSRF; dengan token yang benar sesi dihapus", async () => {
    const sid = cookieFrom((await login()).headers["set-cookie"], "siwak_sid")!;
    const me = await app.inject({ method: "GET", url: "/api/admin/me", cookies: { siwak_sid: sid } });
    const csrf = me.json().csrfToken as string;

    const tanpa = await app.inject({ method: "POST", url: "/auth/logout", cookies: { siwak_sid: sid } });
    expect(tanpa.statusCode).toBe(403);

    const benar = await app.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { siwak_sid: sid },
      payload: `_csrf=${encodeURIComponent(csrf)}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(benar.statusCode).toBe(302);
    expect(benar.headers.location).toBe("/admin/login?pesan=keluar");
    const sesudah = await app.inject({ method: "GET", url: "/api/admin/me", cookies: { siwak_sid: sid } });
    expect(sesudah.statusCode).toBe(401);
  });

  it("sesi yang kedaluwarsa tidak berlaku", async () => {
    const sid = cookieFrom((await login()).headers["set-cookie"], "siwak_sid")!;
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, sid));
    const me = await app.inject({ method: "GET", url: "/api/admin/me", cookies: { siwak_sid: sid } });
    expect(me.statusCode).toBe(401);
  });

  it("GET /healthz memeriksa basis data", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.json()).toEqual({ status: "ok", db: "ok" });
  });
});
