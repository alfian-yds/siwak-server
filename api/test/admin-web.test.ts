import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { IdentityProvider } from "../src/auth/identity.js";
import { createSession } from "../src/auth/session.js";
import { type Db, createDb } from "../src/db/client.js";
import { users } from "../src/db/schema.js";
import { testConfig } from "./helpers.js";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const noIdentity: IdentityProvider = {
  start: () => Promise.reject(new Error("tidak dipakai")),
  finish: () => Promise.reject(new Error("tidak dipakai")),
};

describe.skipIf(!hasDb)("penyajian admin web (SPA)", () => {
  let app: FastifyInstance;
  let db: Db;
  let pool: { end: () => Promise<void> };
  let dir: string;
  let sid: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "siwak-admin-web-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>SIWAK Admin</title><div id=root></div>");
    writeFileSync(join(dir, "assets", "index-abc123.js"), "console.log(1)");
    writeFileSync(join(dir, "favicon.svg"), "<svg/>");
    writeFileSync(join(dir, "demo.html"), "<!doctype html><title>Demo layar TV</title><div id=root></div>");

    const created = createDb(process.env.TEST_DATABASE_URL!);
    db = created.db;
    pool = created.pool;
    app = await buildApp({ config: testConfig(), db, identity: noIdentity, adminWebDir: dir });

    const id = randomUUID();
    await db.insert(users).values({ id, email: `web-${id}@example.com` });
    sid = (await createSession(db, id, {})).id;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    rmSync(dir, { recursive: true, force: true });
  });

  it("halaman admin tanpa sesi dialihkan ke halaman masuk", async () => {
    for (const url of ["/admin", "/admin/", "/admin/masjid/baru"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    }
  });

  it("dengan sesi, semua rute admin mengembalikan index.html tanpa cache", async () => {
    for (const url of ["/admin", "/admin/pengguna", "/admin/masjid/123"]) {
      const res = await app.inject({ method: "GET", url, cookies: { siwak_sid: sid } });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body).toContain("SIWAK Admin");
    }
  });

  it("aset ber-hash terbuka tanpa login dan disimpan lama di cache", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/assets/index-abc123.js" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toContain("immutable");
    expect((await app.inject({ method: "GET", url: "/admin/favicon.svg" })).statusCode).toBe(200);
  });

  it("aset yang tidak ada menjawab 404, bukan HTML", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/assets/hilang.js", cookies: { siwak_sid: sid } });
    expect(res.statusCode).toBe(404);
  });

  it("demo layar TV terbuka tanpa login dan hanya boleh disematkan oleh situs sendiri", async () => {
    const res = await app.inject({ method: "GET", url: "/demo" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Demo layar TV");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    // Halaman admin tetap tidak boleh disematkan.
    const admin = await app.inject({ method: "GET", url: "/admin", cookies: { siwak_sid: sid } });
    expect(admin.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    // demo.html tidak disajikan ganda di /admin/.
    expect((await app.inject({ method: "GET", url: "/admin/demo.html" })).body).not.toContain("Demo layar TV");
  });

  it("aset build baru (belum terdaftar saat server mulai) tetap terbuka tanpa login", async () => {
    writeFileSync(join(dir, "assets", "demo-late123.js"), "console.log(2)");
    const res = await app.inject({ method: "GET", url: "/admin/assets/demo-late123.js" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("halaman masuk tetap halaman server", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/login" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Masuk dengan Google");
  });
});
