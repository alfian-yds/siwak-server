import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { testConfig, testEnv } from "./helpers.js";

describe("konfigurasi", () => {
  it("menerima .env yang lengkap dan memberi nilai bawaan", () => {
    const config = testConfig();
    expect(config.PORT).toBe(8080);
    expect(config.HOST).toBe("127.0.0.1");
  });

  it("menolak .env yang tidak lengkap dan menyebut nama variabelnya", () => {
    const { GOOGLE_CLIENT_SECRET: _omit, ...partial } = testEnv;
    expect(() => loadConfig(partial)).toThrow(/GOOGLE_CLIENT_SECRET/);
  });

  it("menolak rahasia yang terlalu pendek", () => {
    expect(() => loadConfig({ ...testEnv, SESSION_SECRET: "pendek" })).toThrow(/SESSION_SECRET/);
  });
});

describe("GET /healthz tanpa basis data", () => {
  it("menjawab ok", async () => {
    const app = await buildApp({ config: testConfig() });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "skipped" });
    await app.close();
  });
});

describe("situs publik", () => {
  it("halaman depan, panduan, privasi, dan syarat tampil; tautan APK mengarah ke rilis terbaru", async () => {
    const app = await buildApp({ config: testConfig() });
    const home = await app.inject({ method: "GET", url: "/" });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain("Unduh aplikasi TV");
    const privasi = await app.inject({ method: "GET", url: "/privasi" });
    expect(privasi.statusCode).toBe(200);
    expect(privasi.body).toContain("Kebijakan Privasi SIWAK");
    expect(privasi.body).not.toContain("<!--");
    const panduan = await app.inject({ method: "GET", url: "/panduan" });
    expect(panduan.statusCode).toBe(200);
    expect(panduan.body).toContain("Buku Panduan SIWAK");
    expect(panduan.body).toContain('src="/panduan/tv-galeri.jpg"');
    const img = await app.inject({ method: "GET", url: "/panduan/tv-galeri.jpg" });
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect((await app.inject({ method: "GET", url: "/panduan/..%2F..%2F.env" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/panduan/tidak-ada.jpg" })).statusCode).toBe(404);
    const pdf = await app.inject({ method: "GET", url: "/panduan.pdf" });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(home.body).toContain('href="/panduan"');
    const syarat = await app.inject({ method: "GET", url: "/syarat" });
    expect(syarat.body).toContain('href="https://github.com/alfian-yds/siwak/blob/master/LICENSE"');
    const apk = await app.inject({ method: "GET", url: "/api/public/latest-apk" });
    expect(apk.statusCode).toBe(302);
    expect(apk.headers.location).toBe("https://github.com/alfian-yds/siwak/releases/latest");
    expect(home.headers["content-security-policy"]).toContain("default-src 'self'");
    await app.close();
  });
});
