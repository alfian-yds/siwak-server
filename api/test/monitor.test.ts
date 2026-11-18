import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { IdentityProvider } from "../src/auth/identity.js";
import { createSession } from "../src/auth/session.js";
import { type Db, createDb } from "../src/db/client.js";
import {
  activityLogs,
  announcements,
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
import { runMaintenance, runRetention } from "../src/jobs.js";
import { nextMidnight } from "../src/routes/admin-announcements.js";
import { makePin, newDeviceToken, sha256Hex } from "../src/services/device-secrets.js";
import { createWeatherService } from "../src/services/weather.js";
import { testConfig } from "./helpers.js";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const noIdentity: IdentityProvider = {
  start: () => Promise.reject(new Error("tidak dipakai")),
  finish: () => Promise.reject(new Error("tidak dipakai")),
};

describe("nextMidnight", () => {
  it("pukul 00.00 berikutnya menurut zona waktu masjid", () => {
    // 2026-11-17 20:15 WIB = 13:15 UTC → tengah malam WIB = 17:00 UTC.
    expect(nextMidnight(new Date("2026-11-17T13:15:30.500Z"), "Asia/Jakarta").toISOString()).toBe("2026-11-17T17:00:00.000Z");
    // 2026-11-17 23:30 WIT (UTC+9) = 14:30 UTC → 15:00 UTC.
    expect(nextMidnight(new Date("2026-11-17T14:30:00Z"), "Asia/Jayapura").toISOString()).toBe("2026-11-17T15:00:00.000Z");
    // Lewat tengah malam WIB tetapi masih tanggal sebelumnya di UTC.
    expect(nextMidnight(new Date("2026-11-17T17:05:00Z"), "Asia/Jakarta").toISOString()).toBe("2026-11-18T17:00:00.000Z");
  });
});

describe.skipIf(!hasDb)("Tahap 3: peran, dasbor TV, log aktivitas, pengumuman, retensi", () => {
  let app: FastifyInstance;
  let db: Db;
  let pool: { end: () => Promise<void> };
  const config = testConfig();

  beforeAll(async () => {
    const created = createDb(process.env.TEST_DATABASE_URL!);
    db = created.db;
    pool = created.pool;
    const noFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    app = await buildApp({ config, db, identity: noIdentity, weather: createWeatherService(db, "kunci-uji", { warn() {} } as never, noFetch) });
  });

  const reset = async () => {
    for (const t of [announcements, slides, contentItems, media, deviceCommands, deviceEvents, pairingCodes, devices, runningTexts, sessions, activityLogs, memberships, mosqueSettings, mosques, users, weatherCache]) {
      await db.delete(t);
    }
  };
  afterAll(async () => {
    await reset();
    await app.close();
    await pool.end();
  });
  beforeEach(reset);

  type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  async function actor(email: string, isSuperAdmin = false) {
    const id = randomUUID();
    await db.insert(users).values({ id, email, isSuperAdmin });
    const s = await createSession(db, id, {});
    const call = (method: Method, url: string, payload?: unknown) =>
      app.inject({ method, url, cookies: { siwak_sid: s.id }, headers: { "x-csrf-token": s.csrfToken }, ...(payload !== undefined && { payload: payload as object }) });
    return { id, call };
  }

  async function mosque(sa: Awaited<ReturnType<typeof actor>>, name: string) {
    const res = await sa.call("POST", "/api/admin/mosques", { name, latitude: -7.7712, longitude: 110.3874 });
    expect(res.statusCode).toBe(201);
    return res.json().mosque as { id: string; name: string };
  }

  /** TV terhubung, dimasukkan langsung ke basis data (tanpa batas laju pairing). */
  async function addTv(mosqueId: string, name: string) {
    const id = randomUUID();
    const token = newDeviceToken();
    const pin = makePin(config.PIN_ENCRYPTION_KEY);
    await db.insert(devices).values({ id, mosqueId, name, tokenHash: sha256Hex(token), pinCiphertext: pin.pinCiphertext, pinSalt: pin.pinSalt, pinHash: pin.pinHash });
    const tv = (method: "GET" | "POST", url: string, payload?: unknown) =>
      app.inject({ method, url, headers: { authorization: `Device ${token}` }, ...(payload !== undefined && { payload: payload as object }) });
    const beat = (deviceTime = new Date()) => tv("POST", "/api/v1/device/heartbeat", { appVersion: "2.0.0-alpha", configVersion: 1, contentVersion: 1, deviceTime: deviceTime.toISOString() });
    return { id, tv, beat };
  }

  async function team() {
    const sa = await actor("sa@example.com", true);
    const a = await mosque(sa, "Masjid A");
    const b = await mosque(sa, "Masjid B");
    const op = await actor("op@example.com");
    const adm = await actor("adm@example.com");
    await db.insert(memberships).values([
      { userId: op.id, mosqueId: a.id, role: "operator" },
      { userId: adm.id, mosqueId: a.id, role: "admin" },
      { userId: adm.id, mosqueId: b.id, role: "operator" },
    ]);
    return { sa, a, b, op, adm };
  }

  it("3.1 operator ditolak server di halaman Jadwal/Suara/Tampilan, tetap bisa membuka pratinjau", async () => {
    const { a, b, op, adm } = await team();
    expect((await op.call("GET", `/api/admin/mosques/${a.id}/settings`)).statusCode).toBe(403);
    expect((await op.call("GET", `/api/admin/mosques/${a.id}/preview`)).statusCode).toBe(200);
    const s = await adm.call("GET", `/api/admin/mosques/${a.id}/settings`);
    expect(s.statusCode).toBe(200);
    expect((await op.call("PUT", `/api/admin/mosques/${a.id}/settings`, { settings: s.json().settings })).statusCode).toBe(403);
    // Peran berlaku per masjid: admin di A hanya operator di B.
    expect((await adm.call("GET", `/api/admin/mosques/${b.id}/settings`)).statusCode).toBe(403);
    expect((await adm.call("GET", `/api/admin/mosques/${b.id}`)).json().role).toBe("operator");
  });

  it("3.2 dasbor: super admin melihat semua TV, pengurus hanya masjidnya; offline > 5 menit menjadi merah", async () => {
    const { sa, a, b, op } = await team();
    const t1 = await addTv(a.id, "Serambi");
    const t2 = await addTv(b.id, "Utama");
    await t1.beat();
    await t2.beat();

    const all = (await sa.call("GET", "/api/admin/devices")).json();
    expect(all.devices.map((d: { name: string; mosque: { name: string } }) => `${d.mosque.name}/${d.name}`)).toEqual(["Masjid A/Serambi", "Masjid B/Utama"]);
    expect(all.summary).toMatchObject({ total: 2, online: 2, offline: 0 });

    const mine = (await op.call("GET", "/api/admin/devices")).json();
    expect(mine.devices).toHaveLength(1);
    expect(mine.devices[0].id).toBe(t1.id);

    // TV dimatikan: heartbeat terakhir 6 menit lalu → offline di dasbor dan tercatat di riwayat.
    await db.update(devices).set({ lastSeenAt: new Date(Date.now() - 6 * 60_000) }).where(eq(devices.id, t1.id));
    expect((await op.call("GET", "/api/admin/devices")).json().devices[0].online).toBe(false);
    await runMaintenance(db);
    const ev = (await op.call("GET", `/api/admin/devices/${t1.id}/events`)).json();
    expect(ev.items[0].type).toBe("offline");

    // Riwayat TV masjid lain tidak bisa dibuka.
    expect((await op.call("GET", `/api/admin/devices/${t2.id}/events`)).statusCode).toBe(404);
  });

  it("3.2 peringatan selisih jam > 60 detik dan riwayat kejadian berhalaman", async () => {
    const { sa, a } = await team();
    const t = await addTv(a.id, "Serambi");
    await t.beat(new Date(Date.now() + 3 * 60_000));
    const list = (await sa.call("GET", "/api/admin/devices")).json();
    expect(list.devices[0].clockDriftSec).toBeGreaterThanOrEqual(179);
    expect(list.summary.clockDrift).toBe(1);
    expect(list.driftWarnSec).toBe(60);

    for (let i = 0; i < 5; i++) await db.insert(deviceEvents).values({ deviceId: t.id, type: "error", detail: { message: `galat ${i}` } });
    const p1 = (await sa.call("GET", `/api/admin/devices/${t.id}/events?limit=3`)).json();
    expect(p1.items).toHaveLength(3);
    expect(p1.items[0].detail.message).toBe("galat 4");
    const p2 = (await sa.call("GET", `/api/admin/devices/${t.id}/events?limit=3&before=${p1.nextBefore}`)).json();
    expect(p2.items.map((e: { type: string }) => e.type)).toEqual(["error", "error", "clock_drift"]);
    expect(p2.nextBefore).toBe(p2.items[2].id);
  });

  it("3.3 log aktivitas: perubahan pengaturan tercatat dengan nilai lama dan baru; hanya admin ke atas", async () => {
    const { sa, a, op, adm } = await team();
    const { settings } = (await adm.call("GET", `/api/admin/mosques/${a.id}/settings`)).json();
    const before = settings.prayerCycle.iqamahGapMinutes.subuh;
    settings.prayerCycle.iqamahGapMinutes.subuh = before + 2;
    expect((await adm.call("PUT", `/api/admin/mosques/${a.id}/settings`, { settings })).statusCode).toBe(200);

    expect((await op.call("GET", `/api/admin/mosques/${a.id}/activity`)).statusCode).toBe(403);
    const log = (await adm.call("GET", `/api/admin/mosques/${a.id}/activity`)).json();
    const entry = log.items.find((i: { action: string }) => i.action === "settings.update");
    expect(entry.diff["prayerCycle.iqamahGapMinutes.subuh"]).toEqual({ old: before, new: before + 2 });
    expect(entry.user.email).toBe("adm@example.com");
    expect(entry.ip).toBeUndefined(); // IP hanya untuk super admin

    const filtered = (await adm.call("GET", `/api/admin/mosques/${a.id}/activity?action=mosque`)).json();
    expect(filtered.items.every((i: { action: string }) => i.action.startsWith("mosque"))).toBe(true);

    expect((await adm.call("GET", "/api/admin/activity")).statusCode).toBe(403);
    const global = (await sa.call("GET", "/api/admin/activity")).json();
    expect(global.items.some((i: { action: string; ip?: string }) => i.action === "settings.update" && "ip" in i)).toBe(true);
    expect(global.items.filter((i: { action: string }) => i.action === "mosque.create")).toHaveLength(2);
  });

  it("3.4 pengumuman: operator mengirim, TV sasaran menerimanya di bundle, cabut menghapusnya", async () => {
    const { a, b, op } = await team();
    const t1 = await addTv(a.id, "Serambi");
    const t2 = await addTv(a.id, "Utama");
    const other = await addTv(b.id, "Lain");
    const base = `/api/admin/mosques/${a.id}/announcements`;
    const version = async () => (await t1.beat()).json().configVersion as number;
    const v0 = await version();

    // Validasi.
    const long = await op.call("POST", base, { text: "x".repeat(201), deviceId: null, duration: "1h" });
    expect(long.statusCode).toBe(400);
    expect(long.json().error.fields.text).toMatch(/200/);
    expect((await op.call("POST", base, { text: "Halo", deviceId: null })).json().error.fields.duration).toBeTruthy();
    expect((await op.call("POST", base, { text: "Halo", deviceId: other.id, duration: "1h" })).json().error.fields.deviceId).toBeTruthy();
    const past = await op.call("POST", base, { text: "Halo", deviceId: null, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(past.json().error.fields.expiresAt).toBeTruthy();

    const all = await op.call("POST", base, { text: "  Mohon   parkir di halaman belakang  ", deviceId: null, duration: "30m" });
    expect(all.statusCode).toBe(201);
    expect(all.json().announcement.text).toBe("Mohon parkir di halaman belakang");
    const only = await op.call("POST", base, { text: "Khusus serambi", deviceId: t1.id, duration: "today" });
    expect(only.statusCode).toBe(201);
    expect(new Date(only.json().announcement.expiresAt).toISOString()).toBe(nextMidnight(new Date(), "Asia/Jakarta").toISOString());
    expect(await version()).toBe(v0 + 2);

    const texts = async (tv: typeof t1) => ((await tv.tv("GET", "/api/v1/device/bundle")).json().announcements as { text: string }[]).map((x) => x.text);
    expect(await texts(t1)).toEqual(["Mohon parkir di halaman belakang", "Khusus serambi"]);
    expect(await texts(t2)).toEqual(["Mohon parkir di halaman belakang"]);
    expect(await texts(other)).toEqual([]);

    const list = (await op.call("GET", base)).json();
    expect(list.active).toHaveLength(2);
    expect(list.active[1].deviceName).toBe("Serambi");

    expect((await op.call("POST", `/api/admin/announcements/${all.json().announcement.id}/revoke`)).json().changed).toBe(true);
    expect((await op.call("POST", `/api/admin/announcements/${all.json().announcement.id}/revoke`)).json().changed).toBe(false);
    expect(await texts(t2)).toEqual([]);
    const after = (await op.call("GET", base)).json();
    expect(after.active).toHaveLength(1);
    expect(after.recent[0].revokedAt).toBeTruthy();

    // Pengurus masjid lain tidak bisa mencabut.
    const stranger = await actor("lain@example.com");
    expect((await stranger.call("POST", `/api/admin/announcements/${only.json().announcement.id}/revoke`)).statusCode).toBe(404);
    const actions = (await db.select().from(activityLogs)).map((l) => l.action);
    expect(actions.filter((x) => x.startsWith("announcement."))).toEqual(["announcement.create", "announcement.create", "announcement.revoke"]);
  });

  it("3.5 retensi: data lama dihapus sesuai Backend Schema §3.6, media tanpa rujukan ikut berkasnya", async () => {
    const { sa, a } = await team();
    const t = await addTv(a.id, "Serambi");
    const dir = await mkdtemp(join(tmpdir(), "siwak-ret-"));
    try {
      const day = 24 * 3600_000;
      const ago = (d: number) => new Date(Date.now() - d * day);
      await db.insert(activityLogs).values([{ action: "lama", at: ago(400) }, { action: "baru", at: ago(10) }]);
      await db.insert(deviceEvents).values([{ deviceId: t.id, type: "online", at: ago(100) }, { deviceId: t.id, type: "online", at: ago(5) }]);
      await db.insert(announcements).values([
        { id: randomUUID(), mosqueId: a.id, text: "lama", startsAt: ago(101), expiresAt: ago(100) },
        { id: randomUUID(), mosqueId: a.id, text: "baru", startsAt: ago(11), expiresAt: ago(10) },
      ]);
      const mk = async (shaChar: string, createdAt: Date) => {
        const id = randomUUID();
        const sha = shaChar.repeat(64);
        await writeFile(join(dir, sha), "x");
        await db.insert(media).values({ id, mosqueId: a.id, kind: "image", mime: "image/webp", bytes: 1, sha256: sha, createdAt });
        return { id, path: join(dir, sha) };
      };
      const orphanOld = await mk("a", ago(40));
      const usedOld = await mk("b", ago(40));
      const orphanNew = await mk("c", ago(3));
      await db.insert(contentItems).values({ id: randomUUID(), scope: "mosque", mosqueId: a.id, type: "image", status: "published", mediaId: usedOld.id, createdBy: sa.id });

      const res = await runRetention(db, dir);
      expect(res).toMatchObject({ activityLogs: 1, deviceEvents: 1, announcements: 1, media: 1 });
      expect((await db.select().from(activityLogs)).map((l) => l.action)).not.toContain("lama");
      expect((await db.select().from(announcements)).map((x) => x.text)).toEqual(["baru"]);
      expect(existsSync(orphanOld.path)).toBe(false);
      expect(existsSync(usedOld.path)).toBe(true);
      expect(existsSync(orphanNew.path)).toBe(true);
      expect((await db.select().from(media)).map((m) => m.id).sort()).toEqual([usedOld.id, orphanNew.id].sort());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("status penerapan: TV melaporkan versi yang diterapkan beserta waktunya; galat dicatat sekali", async () => {
    const { sa, a } = await team();
    const t = await addTv(a.id, "Serambi");
    const hb = (configVersion: number, lastError: string | null = null) =>
      t.tv("POST", "/api/v1/device/heartbeat", { appVersion: "2.0.0-rc.2", configVersion, contentVersion: 1, deviceTime: new Date().toISOString(), health: { lastError } });
    const v = (await hb(0)).json().configVersion as number;
    let d = (await sa.call("GET", `/api/admin/mosques/${a.id}/devices`)).json().devices[0];
    expect(d.synced).toBe(false);
    await hb(v);
    d = (await sa.call("GET", `/api/admin/mosques/${a.id}/devices`)).json().devices[0];
    expect(d.synced).toBe(true);
    expect(d.lastConfigVersion).toBe(v);
    expect(d.configAppliedAt).toBeTruthy();

    await hb(v, "Gagal mengunduh media; tampilan lama dipertahankan.");
    await hb(v, "Gagal mengunduh media; tampilan lama dipertahankan.");
    d = (await sa.call("GET", `/api/admin/mosques/${a.id}/devices`)).json().devices[0];
    expect(d.lastError).toMatch(/Gagal mengunduh/);
    const errors = (await db.select().from(deviceEvents)).filter((e) => e.type === "error");
    expect(errors).toHaveLength(1);
    await hb(v);
    d = (await sa.call("GET", `/api/admin/mosques/${a.id}/devices`)).json().devices[0];
    expect(d.lastError).toBeNull();
  });

  it("ringkasan masjid: masalah fitur beserta tombol perbaikan; operator tidak melihat masalah khusus admin", async () => {
    const { sa, a, op } = await team();
    let ov = (await sa.call("GET", `/api/admin/mosques/${a.id}/overview`)).json();
    expect(ov.issues.map((i: { code: string }) => i.code)).toEqual(expect.arrayContaining(["no_tv", "schedule_unchecked"]));
    expect(ov.checklist).toEqual({ scheduleChecked: false, tvConnected: false, runningText: false, slides: false });

    // Slide ada tetapi tata letak masih Bar bawah.
    const info = await sa.call("POST", `/api/admin/mosques/${a.id}/content`, { type: "info_kas", body: { type: "info_kas", reportDate: "2026-11-17", openingBalance: 1000, income: 0, expense: 0 } });
    expect(info.statusCode).toBe(201);
    expect((await sa.call("POST", `/api/admin/mosques/${a.id}/slides`, { contentItemId: info.json().content.id })).statusCode).toBe(201);
    ov = (await sa.call("GET", `/api/admin/mosques/${a.id}/overview`)).json();
    const hidden = ov.issues.find((i: { code: string }) => i.code === "content_off");
    expect(hidden.action).toBe("enable_content");
    expect(ov.showing.slidesVisible).toBe(0);

    const opView = (await op.call("GET", `/api/admin/mosques/${a.id}/overview`)).json();
    expect(opView.issues.some((i: { code: string }) => i.code === "content_off")).toBe(false);
  });

  it("perintah Tampilkan Mutiara ke semua TV masjid, boleh oleh operator", async () => {
    const { a, op } = await team();
    await addTv(a.id, "Serambi");
    const t2 = await addTv(a.id, "Utama");
    const res = await op.call("POST", `/api/admin/mosques/${a.id}/commands`, { type: "show_mutiara" });
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toHaveLength(2);
    const hb = (await t2.beat()).json();
    expect(hb.commands).toEqual([expect.objectContaining({ type: "show_mutiara" })]);
    // Operator tetap tidak boleh mulai ulang.
    expect((await op.call("POST", `/api/admin/mosques/${a.id}/commands`, { type: "restart_app" })).statusCode).toBe(403);
  });

  it("layar konten: mati = TV seperti v1.x (Bar bawah, tanpa layar penuh); data lama dianggap aktif", async () => {
    const { sa, a } = await team();
    const t = await addTv(a.id, "Serambi");
    const { settings } = (await sa.call("GET", `/api/admin/mosques/${a.id}/settings`)).json();
    expect(settings.display.content).toEqual({ enabled: false, slideSeconds: 20, autoHadith: true });
    settings.display.layout = "GALERI";
    settings.display.mutiaraHadits = { enabled: true, everyMinutes: 1, showSeconds: 10 };
    settings.display.clock.type = "ANALOG";
    expect((await sa.call("PUT", `/api/admin/mosques/${a.id}/settings`, { settings })).statusCode).toBe(200);
    let b = (await t.tv("GET", "/api/v1/device/bundle")).json();
    expect(b.settings.display.layout).toBe("BAR_BAWAH");
    expect(b.settings.display.mutiaraHadits.enabled).toBe(false);
    expect(b.settings.display.clock.type).toBe("DIGITAL");

    settings.display.content.enabled = true;
    expect((await sa.call("PUT", `/api/admin/mosques/${a.id}/settings`, { settings })).statusCode).toBe(200);
    b = (await t.tv("GET", "/api/v1/device/bundle")).json();
    expect(b.settings.display.layout).toBe("GALERI");
    expect(b.settings.display.mutiaraHadits).toEqual({ enabled: true, everyMinutes: 1, showSeconds: 10 });

    // Batas baru: tiap minimal 1 menit, lama minimal 10 detik.
    settings.display.mutiaraHadits.showSeconds = 9;
    expect((await sa.call("PUT", `/api/admin/mosques/${a.id}/settings`, { settings })).statusCode).toBe(400);

    // Dokumen lama tanpa display.content: aktif bila Galeri/Mutiara dipakai.
    const { readSettings } = await import("../src/settings/schema.js");
    const legacy = structuredClone(settings);
    delete legacy.display.content;
    legacy.display.mutiaraHadits = { enabled: true, everyMinutes: 15, showSeconds: 30 };
    expect(readSettings(legacy).display.content.enabled).toBe(true);
    legacy.display.mutiaraHadits.enabled = false;
    legacy.display.layout = "BAR_BAWAH";
    expect(readSettings(legacy).display.content.enabled).toBe(false);
  });
});
