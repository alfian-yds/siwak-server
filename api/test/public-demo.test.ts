import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { IdentityProvider } from "../src/auth/identity.js";
import { type Db, createDb } from "../src/db/client.js";
import { contentItems } from "../src/db/schema.js";
import { demoBundleBase } from "../src/routes/public-demo.js";
import { testConfig } from "./helpers.js";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const noIdentity: IdentityProvider = {
  start: () => Promise.reject(new Error("tidak dipakai")),
  finish: () => Promise.reject(new Error("tidak dipakai")),
};

describe("data contoh demo layar TV", () => {
  it("memakai tata letak slide di samping jam dan Jumat terdekat", () => {
    const b = demoBundleBase(new Date("2026-11-18T03:00:00Z")); // Rabu WIB
    expect(b.mosque.name).toBe("Masjid Al-Ikhlas");
    expect(b.settings.display.layout).toBe("GALERI");
    expect(b.settings.display.content.enabled).toBe(true);
    expect(b.slides.length).toBe(b.content.length);
    expect(b.content.find((c) => c.type === "info_jumat")?.body).toMatchObject({ date: "2026-11-20" });
  });
});

describe.skipIf(!hasDb)("GET /api/public/demo", () => {
  let app: FastifyInstance;
  let db: Db;
  let pool: { end: () => Promise<void> };
  const ids = { verified: randomUUID(), draft: randomUUID() };

  beforeAll(async () => {
    const created = createDb(process.env.TEST_DATABASE_URL!);
    db = created.db;
    pool = created.pool;
    app = await buildApp({ config: testConfig(), db, identity: noIdentity });
    const base = { scope: "global" as const, type: "hadith" as const, category: "adab_masjid", sourceRef: "HR. Contoh" };
    await db.insert(contentItems).values([
      { ...base, id: ids.verified, status: "verified", translation: "Hadits terverifikasi untuk uji demo." },
      { ...base, id: ids.draft, status: "draft", translation: "Draf hadits yang belum diperiksa." },
    ]);
  });

  afterAll(async () => {
    await db.delete(contentItems).where(inArray(contentItems.id, [ids.verified, ids.draft]));
    await app.close();
    await pool.end();
  });

  it("terbuka tanpa login, berisi slide contoh, dan hanya hadits terverifikasi", async () => {
    const res = await app.inject({ method: "GET", url: "/api/public/demo" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mosque.name).toBe("Masjid Al-Ikhlas");
    const contentIds = body.content.map((c: { id: string }) => c.id);
    expect(contentIds).toContain(ids.verified);
    expect(contentIds).not.toContain(ids.draft);
    expect(body.content.map((c: { type: string }) => c.type)).toEqual(expect.arrayContaining(["info_teks", "info_jumat", "info_kas", "info_agenda"]));
  });
});
