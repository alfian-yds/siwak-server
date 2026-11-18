import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJimp } from "@jimp/core";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { defaultFormats, defaultPlugins } from "jimp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { IdentityProvider } from "../src/auth/identity.js";
import { createSession } from "../src/auth/session.js";
import { bootstrap, defaultHadithDraftFile } from "../src/bootstrap.js";
import { type Db, createDb } from "../src/db/client.js";
import {
  activityLogs,
  appState,
  contentItems,
  deviceCommands,
  deviceEvents,
  devices,
  media,
  memberships,
  mosqueSettings,
  mosques,
  pairingCodes,
  runningTexts,
  sessions,
  slides,
  users,
  weatherCache,
} from "../src/db/schema.js";
import { sha256Hex } from "../src/services/device-secrets.js";
import { createWeatherService } from "../src/services/weather.js";
import { testConfig } from "./helpers.js";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const noIdentity: IdentityProvider = {
  start: () => Promise.reject(new Error("tidak dipakai")),
  finish: () => Promise.reject(new Error("tidak dipakai")),
};

describe.skipIf(!hasDb)("Tahap 2: hadits, pustaka pusat, panel informasi, slide, media", () => {
  let app: FastifyInstance;
  let db: Db;
  let pool: { end: () => Promise<void> };
  let mediaDir: string;

  beforeAll(async () => {
    const created = createDb(process.env.TEST_DATABASE_URL!);
    db = created.db;
    pool = created.pool;
    mediaDir = mkdtempSync(join(tmpdir(), "siwak-media-"));
    const config = { ...testConfig(), MEDIA_DIR: mediaDir };
    const weather = createWeatherService(db, "x", { warn() {} } as never, async () => ({ ok: false, status: 500, json: async () => ({}) }));
    app = await buildApp({ config, db, identity: noIdentity, weather });
  });

  const reset = async () => {
    for (const t of [slides, contentItems, media, deviceCommands, deviceEvents, pairingCodes, devices, runningTexts, sessions, activityLogs, memberships, mosqueSettings, mosques, users, weatherCache]) {
      await db.delete(t);
    }
    await db.insert(appState).values({ id: 1 }).onDuplicateKeyUpdate({ set: { contentVersion: 1 } });
  };

  afterAll(async () => {
    await reset();
    await app.close();
    await pool.end();
    rmSync(mediaDir, { recursive: true, force: true });
  });

  beforeEach(reset);

  async function actor(email: string, isSuperAdmin: boolean) {
    const id = randomUUID();
    await db.insert(users).values({ id, email, isSuperAdmin });
    const s = await createSession(db, id, {});
    const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
      app.inject({ method, url, cookies: { siwak_sid: s.id }, headers: { "x-csrf-token": s.csrfToken }, ...(payload !== undefined && { payload: payload as object }) });
    const upload = (url: string, data: Buffer, filename: string) => {
      const boundary = "----siwak" + randomBytes(6).toString("hex");
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        data,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      return app.inject({
        method: "POST",
        url,
        cookies: { siwak_sid: s.id },
        headers: { "x-csrf-token": s.csrfToken, "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
    };
    return { id, call, upload };
  }

  async function setup() {
    const sa = await actor("sa@example.com", true);
    const mosque = (await sa.call("POST", "/api/admin/mosques", { name: "Masjid Uji", latitude: -6.9, longitude: 107.6 })).json().mosque;
    const adm = await actor("adm@example.com", false);
    const op = await actor("op@example.com", false);
    await db.insert(memberships).values([
      { userId: adm.id, mosqueId: mosque.id, role: "admin" },
      { userId: op.id, mosqueId: mosque.id, role: "operator" },
    ]);
    return { sa, adm, op, mosque, base: `/api/admin/mosques/${mosque.id}` };
  }

  const hadith = { type: "hadith", category: "shaf_berjamaah", translation: "Luruskanlah shaf kalian.", sourceRef: "HR. Bukhari & Muslim" };
  const contentVersion = async () => (await db.select().from(appState))[0]!.contentVersion;

  it("bootstrap memasukkan 12 draf hadits sekali saja, berstatus draf", async () => {
    await bootstrap(db, { SUPERADMIN_EMAIL: "sa@example.com" }, defaultHadithDraftFile);
    await bootstrap(db, { SUPERADMIN_EMAIL: "sa@example.com" }, defaultHadithDraftFile);
    const rows = await db.select().from(contentItems);
    expect(rows).toHaveLength(12);
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(["draft"]));
    expect(rows.filter((r) => r.arabicText)).toHaveLength(1);
  });

  it("hadits masjid: admin boleh, operator tidak; ajukan → dikembalikan → ajukan ulang → disetujui", async () => {
    const { sa, adm, op, base } = await setup();
    expect((await op.call("POST", `${base}/content`, hadith)).statusCode).toBe(403);
    const created = await adm.call("POST", `${base}/content`, hadith);
    expect(created.statusCode).toBe(201);
    const cid = created.json().content.id;

    expect((await adm.call("POST", `${base}/content/${cid}/submit`)).statusCode).toBe(200);
    const queue = (await sa.call("GET", "/api/admin/library?status=submitted")).json().content;
    expect(queue).toHaveLength(1);
    expect((await adm.call("GET", "/api/admin/library?status=submitted")).statusCode).toBe(403);

    const gid = queue[0].id;
    expect((await sa.call("POST", `/api/admin/library/${gid}/review`, { decision: "reject" })).statusCode).toBe(400);
    await sa.call("POST", `/api/admin/library/${gid}/review`, { decision: "reject", note: "Lengkapi teks Arab." });
    const mine = (await adm.call("GET", `${base}/content?type=hadith`)).json().content[0];
    expect(mine.submission).toMatchObject({ status: "rejected", reviewNote: "Lengkapi teks Arab." });

    await adm.call("PUT", `${base}/content/${cid}`, { ...hadith, type: undefined, arabicText: "سَوُّوا صُفُوفَكُمْ" });
    await adm.call("POST", `${base}/content/${cid}/submit`);
    const v0 = await contentVersion();
    const ok = await sa.call("POST", `/api/admin/library/${gid}/review`, { decision: "verify" });
    expect(ok.json().content).toMatchObject({ status: "verified", arabicText: "سَوُّوا صُفُوفَكُمْ" });
    expect(await contentVersion()).toBe(v0 + 1);
    // Pengurus lain kini bisa memilihnya dari pustaka pusat.
    expect((await op.call("GET", "/api/admin/library")).json().content).toHaveLength(1);
  });

  it("panel informasi divalidasi per jenis; operator boleh menambah", async () => {
    const { op, base } = await setup();
    const kas = await op.call("POST", `${base}/content`, { type: "info_kas", body: { reportDate: "2026-11-14", openingBalance: 12_450_000, income: 2_315_000, expense: 980_000 } });
    expect(kas.statusCode).toBe(201);
    expect(kas.json().content.body).toMatchObject({ type: "info_kas", income: 2_315_000 });
    const bad = await op.call("POST", `${base}/content`, { type: "info_agenda", body: { items: [{ day: "Selasa", time: "25:00", title: "" }] } });
    expect(bad.statusCode).toBe(400);
    expect(Object.keys(bad.json().error.fields)).toEqual(expect.arrayContaining(["body.items.0.time", "body.items.0.title"]));
    const hb = await op.call("POST", `${base}/content`, { type: "info_hari_besar", body: { event: "ISRA_MIRAJ" } });
    expect(hb.statusCode).toBe(201);
  });

  it("rc.5: konten Informasi (judul + isi) divalidasi dan bisa dijadikan slide", async () => {
    const { op, base } = await setup();
    const ok = await op.call("POST", `${base}/content`, { type: "info_teks", body: { title: "Parkir kendaraan", text: "Parkir di halaman belakang." } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().content.body).toMatchObject({ title: "Parkir kendaraan" });
    const empty = await op.call("POST", `${base}/content`, { type: "info_teks", body: { title: "", text: "" } });
    expect(empty.statusCode).toBe(400);
    expect(Object.keys(empty.json().error.fields)).toEqual(expect.arrayContaining(["body.title", "body.text"]));
    const long = await op.call("POST", `${base}/content`, { type: "info_teks", body: { title: "A", text: "x".repeat(401) } });
    expect(long.statusCode).toBe(400);
    const slide = await op.call("POST", `${base}/slides`, { contentItemId: ok.json().content.id });
    expect(slide.statusCode).toBeLessThan(300);
  });

  it("rc.5: hadits otomatis bisa dimatikan; hanya hadits yang dijadikan slide yang masuk bundle", async () => {
    const { sa, adm, op, base } = await setup();
    const a = (await sa.call("POST", "/api/admin/library", { category: "jumat", translation: "Diamlah saat khutbah.", sourceRef: "HR. Bukhari & Muslim" })).json().content;
    const b = (await sa.call("POST", "/api/admin/library", { category: "jumat", translation: "Bersegeralah ke masjid.", sourceRef: "HR. Bukhari" })).json().content;
    for (const c of [a, b]) await sa.call("POST", `/api/admin/library/${c.id}/review`, { decision: "verify" });
    await op.call("POST", `${base}/slides`, { contentItemId: a.id });
    const ids = async () => ((await op.call("GET", `${base}/preview`)).json().content as { id: string }[]).map((c) => c.id).sort();
    expect(await ids()).toEqual([a.id, b.id].sort()); // bawaan: hadits otomatis aktif
    const { settings } = (await adm.call("GET", `${base}/settings`)).json();
    expect(settings.display.content.autoHadith).toBe(true);
    settings.display.content.autoHadith = false;
    expect((await adm.call("PUT", `${base}/settings`, { settings })).statusCode).toBe(200);
    expect(await ids()).toEqual([a.id]); // tinggal hadits yang dijadikan slide
    // Tab admin web lama (sebelum rc.5) mengirim pengaturan tanpa autoHadith: tetap diterima.
    const old = (await adm.call("GET", `${base}/settings`)).json().settings;
    delete old.display.content.autoHadith;
    expect((await adm.call("PUT", `${base}/settings`, { settings: old })).statusCode).toBe(200);
  });

  it("slide hanya dari konten yang tayang/terverifikasi; bundle TV memuat slide, konten, dan hadits sesuai kategori", async () => {
    const { sa, op, mosque, base } = await setup();
    const g = (await sa.call("POST", "/api/admin/library", { category: "jumat", translation: "Diamlah saat khutbah.", sourceRef: "HR. Bukhari & Muslim" })).json().content;
    expect((await op.call("POST", `${base}/slides`, { contentItemId: g.id })).statusCode).toBe(400); // masih draf
    await sa.call("POST", `/api/admin/library/${g.id}/review`, { decision: "verify" });

    const kas = (await op.call("POST", `${base}/content`, { type: "info_kas", body: { reportDate: "2026-11-14", openingBalance: 1, income: 2, expense: 3 } })).json().content;
    expect((await op.call("POST", `${base}/slides`, { contentItemId: g.id, durationSec: 15, timeFrom: "08:00" })).statusCode).toBe(400);
    await op.call("POST", `${base}/slides`, { contentItemId: g.id, durationSec: 15 });
    const list = (await op.call("POST", `${base}/slides`, { contentItemId: kas.id, daysMask: 0b0010000, timeFrom: "12:00", timeTo: "14:00" })).json().slides;
    expect(list.map((s: { content: { type: string } }) => s.content.type)).toEqual(["hadith", "info_kas"]);

    // Hubungkan TV lalu ambil bundle.
    const nonce = randomBytes(24).toString("base64url");
    const start = (await app.inject({ method: "POST", url: "/api/v1/pairing", payload: { nonce } })).json();
    await sa.call("POST", "/api/admin/pairing/claim", { code: start.code, mosqueId: mosque.id, name: "TV" });
    const token = (await app.inject({ method: "GET", url: `/api/v1/pairing/${start.pairingId}?nonce=${nonce}` })).json().deviceToken;
    const bundle = (await app.inject({ method: "GET", url: "/api/v1/device/bundle", headers: { authorization: `Device ${token}` } })).json();

    expect(bundle.slides).toEqual([
      expect.objectContaining({ contentId: g.id, durationSec: 15, daysMask: 127 }),
      expect.objectContaining({ contentId: kas.id, daysMask: 16, timeFrom: "12:00", timeTo: "14:00" }),
    ]);
    // Kategori bawaan masjid memuat "jumat", jadi hadits terverifikasi ikut di kumpulan Mutiara Hadits.
    expect(bundle.content.map((c: { id: string }) => c.id).sort()).toEqual([g.id, kas.id].sort());

    // Hadits yang ditarik kembali menjadi draf hilang dari bundle beserta slidenya.
    await sa.call("POST", `/api/admin/library/${g.id}/review`, { decision: "unverify" });
    const after = (await app.inject({ method: "GET", url: "/api/v1/device/bundle", headers: { authorization: `Device ${token}` } })).json();
    expect(after.slides.map((s: { contentId: string }) => s.contentId)).toEqual([kas.id]);
  });

  it("unggah gambar: diubah ke WebP maks. 1920 px; berkas palsu ditolak; TV mengunduh media yang dirujuk saja", async () => {
    const { sa, adm, mosque, base } = await setup();
    const J = createJimp({ formats: defaultFormats, plugins: defaultPlugins });
    const png = Buffer.from(await new J({ width: 2400, height: 1200, color: 0x0c5138ff }).getBuffer("image/png"));

    const fake = await adm.upload(`${base}/media?kind=image`, Buffer.from("bukan gambar sama sekali"), "foto.jpg");
    expect(fake.statusCode).toBe(415);
    const big = await adm.upload(`${base}/media?kind=image`, Buffer.alloc(6 * 1024 * 1024, 1), "besar.jpg");
    expect(big.statusCode).toBe(413);

    const up = await adm.upload(`${base}/media?kind=image`, png, "logo.png");
    expect(up.statusCode).toBe(201);
    const m = up.json().media;
    expect(m).toMatchObject({ kind: "image", mime: "image/webp", width: 1920, height: 960 });

    // Pengaturan merujuk logo → masuk daftar media bundle.
    const s = (await adm.call("GET", `${base}/settings`)).json().settings;
    s.display.media.logoId = m.id;
    expect((await adm.call("PUT", `${base}/settings`, { settings: s })).statusCode).toBe(200);
    s.sound.adzan = { enabled: true, type: "CUSTOM", mediaId: m.id }; // gambar bukan audio
    expect((await adm.call("PUT", `${base}/settings`, { settings: s })).json().error.fields).toHaveProperty(["sound.adzan.mediaId"]);

    const nonce = randomBytes(24).toString("base64url");
    const start = (await app.inject({ method: "POST", url: "/api/v1/pairing", payload: { nonce } })).json();
    await sa.call("POST", "/api/admin/pairing/claim", { code: start.code, mosqueId: mosque.id, name: "TV" });
    const token = (await app.inject({ method: "GET", url: `/api/v1/pairing/${start.pairingId}?nonce=${nonce}` })).json().deviceToken;
    const auth = { authorization: `Device ${token}` };
    const bundle = (await app.inject({ method: "GET", url: "/api/v1/device/bundle", headers: auth })).json();
    expect(bundle.media).toEqual([{ id: m.id, kind: "image", mime: "image/webp", sha256: m.sha256, bytes: m.bytes }]);

    const file = await app.inject({ method: "GET", url: `/api/v1/device/media/${m.id}`, headers: auth });
    expect(file.statusCode).toBe(200);
    expect(sha256Hex(file.rawPayload)).toBe(m.sha256);
    expect(file.rawPayload.subarray(8, 12).toString()).toBe("WEBP");

    // Media lain (tidak dirujuk) tidak boleh diunduh TV, dan media yang dipakai tidak bisa dihapus.
    const other = (await adm.upload(`${base}/media?kind=image`, png, "lain.png")).json().media;
    expect((await app.inject({ method: "GET", url: `/api/v1/device/media/${other.id}`, headers: auth })).statusCode).toBe(404);
    expect((await adm.call("DELETE", `/api/admin/media/${m.id}`)).statusCode).toBe(409);
    expect((await adm.call("DELETE", `/api/admin/media/${other.id}`)).statusCode).toBe(200);
    expect(await db.select().from(media).where(eq(media.id, other.id))).toHaveLength(0);
  });
});
