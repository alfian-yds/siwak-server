/**
 * Uji beban heartbeat (tugas 3.6): mensimulasikan banyak TV yang mengirim heartbeat ke server yang
 * sedang berjalan, lalu melaporkan p50/p95/p99. Target: p95 < 200 ms untuk 200 TV di VPS.
 *
 * Skrip membuat satu masjid sementara "Uji beban …" beserta TV-nya langsung di basis data, lalu
 * menghapus semuanya di akhir (juga bila dihentikan dengan Ctrl+C).
 *
 *   npm run load-test -- --tvs 200 --rounds 3 --spread 60   (dari folder siwak-server, setelah npm run build)
 *
 * Opsi: --url (bawaan LOAD_TEST_URL atau http://127.0.0.1:PORT, langsung ke Node tanpa Nginx), --tvs 200, --rounds 3,
 * --spread 60 (detik; heartbeat tiap TV disebar acak dalam jendela ini, seperti TV sungguhan yang
 * mengirim tiap 60 detik), --burst (tambahan satu putaran: semua TV mengirim serentak).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "../db/client.js";
import { devices, mosques, weatherCache } from "../db/schema.js";
import { newDeviceToken, sha256Hex } from "../services/device-secrets.js";
import { cellKeyOf } from "../services/weather.js";

const { values: opt } = parseArgs({
  options: {
    url: { type: "string" },
    tvs: { type: "string", default: "200" },
    rounds: { type: "string", default: "3" },
    spread: { type: "string", default: "60" },
    burst: { type: "boolean", default: false },
  },
});
const baseUrl = (opt.url ?? process.env.LOAD_TEST_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8080}`).replace(/\/$/, "");
const tvCount = Number(opt.tvs);
const rounds = Number(opt.rounds);
const spreadMs = Number(opt.spread) * 1000;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL belum diisi (jalankan dari folder api dengan --env-file=../.env).");

const { db, pool } = createDb(process.env.DATABASE_URL);
const mosqueId = randomUUID();
// Koordinat di tengah laut agar tidak berbagi sel cuaca dengan masjid sungguhan.
const lat = -8.95;
const lon = 107.05;
const cell = cellKeyOf(lat, lon);
let createdCell = false;
const tvs: { id: string; token: string }[] = [];

async function setup() {
  await db.insert(mosques).values({ id: mosqueId, name: `Uji beban ${new Date().toISOString()}`, slug: `uji-beban-${mosqueId.slice(0, 8)}`, latitude: String(lat), longitude: String(lon) });
  // Sel cuaca tiruan: heartbeat tidak memicu permintaan ke OpenWeather.
  const [hasCell] = await db.select({ k: weatherCache.cellKey }).from(weatherCache).where(eq(weatherCache.cellKey, cell));
  if (!hasCell) {
    const old = new Date(Date.now() - 30 * 24 * 3600_000);
    await db.insert(weatherCache).values({ cellKey: cell, payload: { cellKey: cell, uji: true }, fetchedAt: new Date(), lastRequestedAt: old });
    createdCell = true;
  }
  const rows = Array.from({ length: tvCount }, (_, i) => {
    const token = newDeviceToken();
    const id = randomUUID();
    tvs.push({ id, token });
    return {
      id,
      mosqueId,
      name: `TV ${i + 1}`,
      tokenHash: sha256Hex(token),
      // PIN tidak dipakai heartbeat; isi acak.
      pinCiphertext: randomBytes(32).toString("base64"),
      pinSalt: randomBytes(16).toString("hex"),
      pinHash: randomBytes(32).toString("hex"),
    };
  });
  for (let i = 0; i < rows.length; i += 100) await db.insert(devices).values(rows.slice(i, i + 100));
}

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  const ids = tvs.map((t) => t.id);
  for (let i = 0; i < ids.length; i += 200) await db.delete(devices).where(inArray(devices.id, ids.slice(i, i + 200)));
  await db.delete(mosques).where(eq(mosques.id, mosqueId));
  if (createdCell) await db.delete(weatherCache).where(eq(weatherCache.cellKey, cell));
  await pool.end();
}
process.on("SIGINT", () => {
  console.log("\nDihentikan; membersihkan data uji…");
  void cleanup().finally(() => process.exit(130));
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Latensi per fase: "tersebar" (seperti TV sungguhan) dan "serentak" (kasus terburuk). */
const phases = { tersebar: [] as number[], serentak: [] as number[] };
type Phase = keyof typeof phases;
let errors = 0;
const statusCounts = new Map<number, number>();

async function beat(tv: { token: string }, phase: Phase) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${baseUrl}/api/v1/device/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Device ${tv.token}` },
      body: JSON.stringify({
        appVersion: "2.0.0-alpha",
        configVersion: 1,
        contentVersion: 1,
        weatherStamp: null,
        deviceTime: new Date().toISOString(),
        health: { lastError: null, freeStorageMb: 1024 },
        app: { foreground: true, since: null, canOpenApp: true },
        commandResults: [],
      }),
    });
    await res.arrayBuffer();
    statusCounts.set(res.status, (statusCounts.get(res.status) ?? 0) + 1);
    if (!res.ok) errors++;
  } catch {
    errors++;
    statusCounts.set(0, (statusCounts.get(0) ?? 0) + 1);
  }
  phases[phase].push(performance.now() - t0);
}

/** Satu putaran: tiap TV mengirim sekali pada waktu acak di dalam jendela `windowMs`. */
async function round(windowMs: number, phase: Phase) {
  await Promise.all(
    tvs.map(async (tv) => {
      await sleep(Math.random() * windowMs);
      await beat(tv, phase);
    }),
  );
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;

try {
  const health = await fetch(`${baseUrl}/healthz`).catch(() => null);
  if (!health?.ok) throw new Error(`Server ${baseUrl} tidak menjawab /healthz.`);
  await setup();
  console.log(`${tvCount} TV, ${rounds} putaran × ${spreadMs / 1000} detik${opt.burst ? " + 1 putaran serentak" : ""} → ${baseUrl}`);
  const started = performance.now();
  for (let r = 1; r <= rounds; r++) {
    await round(spreadMs, "tersebar");
    console.log(`  putaran ${r}/${rounds} selesai`);
  }
  if (opt.burst) {
    await round(0, "serentak");
    console.log("  putaran serentak selesai");
  }
  const seconds = (performance.now() - started) / 1000;
  const total = phases.tersebar.length + phases.serentak.length;
  const ms = (v: number) => `${v.toFixed(1)} ms`;
  const line = (name: string, list: number[]) => {
    const sorted = [...list].sort((a, b) => a - b);
    console.log(`Latensi ${name.padEnd(9)}: p50 ${ms(pct(sorted, 50))} · p95 ${ms(pct(sorted, 95))} · p99 ${ms(pct(sorted, 99))} · maks ${ms(sorted[sorted.length - 1] ?? 0)} (${list.length} permintaan)`);
    return pct(sorted, 95);
  };
  console.log("");
  console.log(`Permintaan       : ${total} (${(total / seconds).toFixed(1)}/detik), galat ${errors}`);
  console.log(`Status           : ${[...statusCounts].map(([s, n]) => `${s || "jaringan"}×${n}`).join(", ")}`);
  const p95 = line("tersebar", phases.tersebar);
  if (phases.serentak.length) line("serentak", phases.serentak);
  // Kriteria tugas 3.6 memakai pola kirim sungguhan (tersebar); putaran serentak hanya informasi.
  const pass = p95 < 200 && errors === 0;
  console.log(pass ? "HASIL            : LULUS (p95 tersebar < 200 ms, tanpa galat)" : "HASIL            : TIDAK LULUS (target p95 tersebar < 200 ms, tanpa galat)");
  process.exitCode = pass ? 0 : 1;
} finally {
  await cleanup();
}
