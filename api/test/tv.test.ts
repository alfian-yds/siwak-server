import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { IdentityProvider } from "../src/auth/identity.js";
import { createSession } from "../src/auth/session.js";
import { type Db, createDb } from "../src/db/client.js";
import {
  activityLogs,
  deviceCommands,
  deviceEvents,
  devices,
  memberships,
  mosqueSettings,
  mosques,
  pairingCodes,
  runningTexts,
  sessions,
  users,
  weatherCache,
} from "../src/db/schema.js";
import { runMaintenance } from "../src/jobs.js";
import { sha256Hex } from "../src/services/device-secrets.js";
import { createWeatherService } from "../src/services/weather.js";
import { defaultSettings } from "../src/settings/schema.js";
import { testConfig } from "./helpers.js";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const noIdentity: IdentityProvider = {
  start: () => Promise.reject(new Error("tidak dipakai")),
  finish: () => Promise.reject(new Error("tidak dipakai")),
};

describe.skipIf(!hasDb)("TV: pairing, sinkron, pemantauan, perintah jarak jauh", () => {
  let app: FastifyInstance;
  let db: Db;
  let pool: { end: () => Promise<void> };
  let weatherCalls = 0;

  beforeAll(async () => {
    const created = createDb(process.env.TEST_DATABASE_URL!);
    db = created.db;
    pool = created.pool;
    // OpenWeather tiruan: tidak ada lalu lintas jaringan saat pengujian.
    const fakeFetch = async () => {
      weatherCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ main: { temp: 30.04, feels_like: 33.2, humidity: 70 }, wind: { speed: 2 }, weather: [{ icon: "02d", description: "sedikit berawan" }] }),
      };
    };
    const config = testConfig();
    app = await buildApp({ config, db, identity: noIdentity, weather: createWeatherService(db, "kunci-uji", { warn() {} } as never, fakeFetch) });
  });

  const reset = async () => {
    for (const t of [deviceCommands, deviceEvents, pairingCodes, devices, runningTexts, sessions, activityLogs, memberships, mosqueSettings, mosques, users, weatherCache]) {
      await db.delete(t);
    }
  };

  afterAll(async () => {
    await reset(); // berkas uji lain menghapus masjid; TV yang tersisa akan menghalanginya
    await app.close();
    await pool.end();
  });

  beforeEach(reset);

  async function actor(email: string, isSuperAdmin: boolean) {
    const id = randomUUID();
    await db.insert(users).values({ id, email, isSuperAdmin });
    const s = await createSession(db, id, {});
    const call = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: unknown) =>
      app.inject({ method, url, cookies: { siwak_sid: s.id }, headers: { "x-csrf-token": s.csrfToken }, ...(payload !== undefined && { payload: payload as object }) });
    return { id, call };
  }

  async function setup() {
    const sa = await actor("sa@example.com", true);
    const mosque = (await sa.call("POST", "/api/admin/mosques", { name: "Masjid Uji", latitude: -6.914744, longitude: 107.60981 })).json().mosque;
    return { sa, mosque };
  }

  /** TV meminta kode, pengurus mengklaim, TV mengambil kuncinya. */
  async function pairTv(sa: Awaited<ReturnType<typeof actor>>, mosqueId: string) {
    const nonce = randomBytes(24).toString("base64url");
    const start = await app.inject({ method: "POST", url: "/api/v1/pairing", payload: { nonce, appVersion: "2.0.0-alpha", model: "Uji TV" } });
    expect(start.statusCode).toBe(201);
    const { pairingId, code } = start.json();
    expect(code).toMatch(/^\d{8}$/);

    const waiting = await app.inject({ method: "GET", url: `/api/v1/pairing/${pairingId}?nonce=${nonce}` });
    expect(waiting.json().status).toBe("pending");

    const claim = await sa.call("POST", "/api/admin/pairing/claim", { code: `${code.slice(0, 4)} ${code.slice(4)}`, mosqueId, name: "Serambi" });
    expect(claim.statusCode).toBe(201);
    expect(claim.json().pin).toMatch(/^\d{6}$/);

    const got = await app.inject({ method: "GET", url: `/api/v1/pairing/${pairingId}?nonce=${nonce}` });
    expect(got.json().status).toBe("claimed");
    const token = got.json().deviceToken as string;
    // Kunci hanya dikirim sekali.
    expect((await app.inject({ method: "GET", url: `/api/v1/pairing/${pairingId}?nonce=${nonce}` })).json().status).toBe("expired");
    const tv = (method: "GET" | "POST", url: string, payload?: unknown) =>
      app.inject({ method, url, headers: { authorization: `Device ${token}` }, ...(payload !== undefined && { payload: payload as object }) });
    return { tv, token, deviceId: got.json().deviceId as string, pin: claim.json().pin as string, nonce, pairingId };
  }

  const beat = (extra: Record<string, unknown> = {}) => ({ appVersion: "2.0.0-alpha", configVersion: 1, contentVersion: 1, deviceTime: new Date().toISOString(), ...extra });

  it("pairing lengkap: kode → klaim → kunci sekali → bundle berisi pengaturan, teks, dan hash PIN", async () => {
    const { sa, mosque } = await setup();
    const { tv, pin, deviceId } = await pairTv(sa, mosque.id);
    await sa.call("POST", `/api/admin/mosques/${mosque.id}/running-texts`, { text: "Kajian Selasa ba'da Maghrib" });
    await sa.call("POST", `/api/admin/mosques/${mosque.id}/running-texts`, { text: "Sudah lewat", endsOn: "2020-01-01" });

    const b = await tv("GET", "/api/v1/device/bundle");
    expect(b.statusCode).toBe(200);
    const bundle = b.json();
    expect(bundle.mosque).toMatchObject({ name: "Masjid Uji", latitude: -6.914744 });
    expect(bundle.device.id).toBe(deviceId);
    expect(bundle.device.pinHash).toBe(sha256Hex(bundle.device.pinSalt + pin));
    expect(bundle.settings.prayerCycle.iqamahGapMinutes.subuh).toBe(20);
    expect(bundle.runningTexts.map((t: { text: string }) => t.text)).toEqual(["Kajian Selasa ba'da Maghrib"]);
  });

  it("kode salah ditolak dengan pesan jelas; nonce salah tidak membocorkan status", async () => {
    const { sa, mosque } = await setup();
    const bad = await sa.call("POST", "/api/admin/pairing/claim", { code: "12345678", mosqueId: mosque.id, name: "TV" });
    expect(bad.statusCode).toBe(404);
    expect(bad.json().error.message).toContain("Periksa angka di layar TV");

    const start = await app.inject({ method: "POST", url: "/api/v1/pairing", payload: { nonce: "n".repeat(20) } });
    const other = await app.inject({ method: "GET", url: `/api/v1/pairing/${start.json().pairingId}?nonce=${"x".repeat(20)}` });
    expect(other.statusCode).toBe(404);
  });

  it("operator tidak boleh menghubungkan TV, admin masjid boleh", async () => {
    const { mosque } = await setup();
    const op = await actor("op@example.com", false);
    const adm = await actor("adm@example.com", false);
    await db.insert(memberships).values([
      { userId: op.id, mosqueId: mosque.id, role: "operator" },
      { userId: adm.id, mosqueId: mosque.id, role: "admin" },
    ]);
    const start = await app.inject({ method: "POST", url: "/api/v1/pairing", payload: { nonce: "n".repeat(20) } });
    const body = { code: start.json().code, mosqueId: mosque.id, name: "TV" };
    expect((await op.call("POST", "/api/admin/pairing/claim", body)).statusCode).toBe(403);
    expect((await adm.call("POST", "/api/admin/pairing/claim", body)).statusCode).toBe(201);
  });

  it("mengubah pengaturan menaikkan configVersion yang dilaporkan heartbeat; nilai di luar batas ditolak", async () => {
    const { sa, mosque } = await setup();
    const { tv } = await pairTv(sa, mosque.id);
    const v0 = (await tv("POST", "/api/v1/device/heartbeat", beat())).json().configVersion;

    const s = defaultSettings();
    s.schedule.offsetsEnabled = true;
    s.schedule.offsets.subuh = 2;
    const put = await sa.call("PUT", `/api/admin/mosques/${mosque.id}/settings`, { settings: s });
    expect(put.statusCode).toBe(200);
    expect(put.json().settings.schedule.offsets.subuh).toBe(2);

    const hb = (await tv("POST", "/api/v1/device/heartbeat", beat({ configVersion: v0 }))).json();
    expect(hb.configVersion).toBe(v0 + 1);
    expect((await tv("GET", "/api/v1/device/bundle")).json().settings.schedule.offsets.subuh).toBe(2);

    s.schedule.offsets.subuh = 99;
    const bad = await sa.call("PUT", `/api/admin/mosques/${mosque.id}/settings`, { settings: s });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields["schedule.offsets.subuh"]).toBe("maksimal 15 menit");

    const log = await db.select().from(activityLogs).where(eq(activityLogs.action, "settings.update"));
    expect(log[0]?.diff).toMatchObject({ "schedule.offsets.subuh": { old: 0, new: 2 } });
  });

  it("heartbeat mencatat SIWAK tampil/latar belakang dan izin buka dari latar belakang", async () => {
    const { sa, mosque } = await setup();
    const { tv } = await pairTv(sa, mosque.id);
    await tv("POST", "/api/v1/device/heartbeat", beat({ app: { foreground: true, canOpenApp: false } }));
    const since = new Date(Date.now() - 120_000).toISOString();
    await tv("POST", "/api/v1/device/heartbeat", beat({ app: { foreground: false, since, canOpenApp: true } }));

    const list = (await sa.call("GET", `/api/admin/mosques/${mosque.id}/devices`)).json();
    expect(list.devices[0]).toMatchObject({ name: "Serambi", online: true, app: { foreground: false, canOpenApp: true } });
    expect(new Date(list.devices[0].app.since).toISOString()).toBe(since);
    const types = (await db.select().from(deviceEvents)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["paired", "online", "app_background"]));
  });

  it("perintah Buka SIWAK: pending → delivered lewat heartbeat → done dengan hasil dari TV", async () => {
    const { sa, mosque } = await setup();
    const { tv, deviceId } = await pairTv(sa, mosque.id);

    const sent = await sa.call("POST", `/api/admin/devices/${deviceId}/commands`, { type: "open_app" });
    expect(sent.statusCode).toBe(201);
    const cmdId = sent.json().command.id;
    // Menekan tombol dua kali tidak membuat perintah ganda.
    expect((await sa.call("POST", `/api/admin/devices/${deviceId}/commands`, { type: "open_app" })).json()).toMatchObject({ reused: true, command: { id: cmdId } });

    const hb1 = (await tv("POST", "/api/v1/device/heartbeat", beat())).json();
    expect(hb1.commands).toEqual([{ id: cmdId, type: "open_app" }]);
    expect((await tv("POST", "/api/v1/device/heartbeat", beat())).json().commands).toEqual([]);

    await tv("POST", "/api/v1/device/heartbeat", beat({ commandResults: [{ id: cmdId, ok: true, message: null }], app: { foreground: true } }));
    const dev = (await sa.call("GET", `/api/admin/mosques/${mosque.id}/devices`)).json().devices[0];
    expect(dev.commands).toEqual([expect.objectContaining({ id: cmdId, type: "open_app", status: "done" })]);
    expect(dev.app.foreground).toBe(true);
  });

  it("operator boleh Buka SIWAK tetapi tidak boleh Mulai ulang", async () => {
    const { sa, mosque } = await setup();
    const { deviceId } = await pairTv(sa, mosque.id);
    const op = await actor("op@example.com", false);
    await db.insert(memberships).values({ userId: op.id, mosqueId: mosque.id, role: "operator" });
    expect((await op.call("POST", `/api/admin/devices/${deviceId}/commands`, { type: "open_app" })).statusCode).toBe(201);
    expect((await op.call("POST", `/api/admin/devices/${deviceId}/commands`, { type: "restart_app" })).statusCode).toBe(403);
  });

  it("pemeliharaan: perintah > 10 menit kedaluwarsa, TV tanpa heartbeat > 5 menit menjadi offline", async () => {
    const { sa, mosque } = await setup();
    const { tv, deviceId } = await pairTv(sa, mosque.id);
    await tv("POST", "/api/v1/device/heartbeat", beat());
    await sa.call("POST", `/api/admin/devices/${deviceId}/commands`, { type: "sync_now" });

    const later = new Date(Date.now() + 11 * 60_000);
    const res = await runMaintenance(db, later);
    expect(res).toEqual({ offline: 1, expiredCommands: 1 });
    const [d] = await db.select().from(devices).where(eq(devices.id, deviceId));
    expect(d?.isOnline).toBe(false);
    expect((await db.select().from(deviceCommands))[0]?.status).toBe("expired");
  });

  it("PIN bisa dilihat (tercatat di log) dan dibuat ulang; lepas TV mencabut kuncinya", async () => {
    const { sa, mosque } = await setup();
    const { tv, deviceId, pin } = await pairTv(sa, mosque.id);
    expect((await sa.call("GET", `/api/admin/devices/${deviceId}/pin`)).json().pin).toBe(pin);
    const fresh = (await sa.call("POST", `/api/admin/devices/${deviceId}/pin`)).json().pin;
    const b = (await tv("GET", "/api/v1/device/bundle")).json();
    expect(b.device.pinHash).toBe(sha256Hex(b.device.pinSalt + fresh));
    expect((await db.select().from(activityLogs).where(eq(activityLogs.action, "device.pin.view")))).toHaveLength(1);

    expect((await sa.call("POST", `/api/admin/devices/${deviceId}/unpair`)).statusCode).toBe(200);
    const after = await tv("POST", "/api/v1/device/heartbeat", beat());
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe("device_unknown");
  });

  it("cuaca: diambil sekali per sel lalu dilayani dari cache", async () => {
    const { sa, mosque } = await setup();
    const { tv } = await pairTv(sa, mosque.id);
    weatherCalls = 0;
    await tv("POST", "/api/v1/device/heartbeat", beat());
    await new Promise((r) => setTimeout(r, 200));
    const w = await tv("GET", "/api/v1/device/weather");
    expect(w.statusCode).toBe(200);
    expect(w.json()).toMatchObject({ cellKey: "-6.91,107.61", temperatureC: 30, windKmh: 7.2, iconCode: "02d" });
    expect((await tv("POST", "/api/v1/device/heartbeat", beat())).json().weatherStamp).toBe(w.json().fetchedAt);
    expect(weatherCalls).toBe(1);
  });

  it("teks berjalan: tambah, ubah, urut ulang, hapus; tanggal terbalik ditolak", async () => {
    const { sa, mosque } = await setup();
    const base = `/api/admin/mosques/${mosque.id}/running-texts`;
    const a = (await sa.call("POST", base, { text: "A" })).json().runningText;
    const b = (await sa.call("POST", base, { text: "B" })).json().runningText;
    expect((await sa.call("POST", base, { text: "C", startsOn: "2026-12-10", endsOn: "2026-12-01" })).statusCode).toBe(400);

    await sa.call("PATCH", `${base}/${a.id}`, { enabled: false });
    const ordered = (await sa.call("PUT", `${base}/order`, { ids: [b.id, a.id] })).json().runningTexts;
    expect(ordered.map((t: { text: string }) => t.text)).toEqual(["B", "A"]);
    expect(ordered[1].enabled).toBe(false);
    await sa.call("DELETE", `${base}/${b.id}`);
    expect((await sa.call("GET", base)).json().runningTexts).toHaveLength(1);
  });
});
