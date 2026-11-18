#!/usr/bin/env node
/**
 * Memeriksa lisensi semua dependensi produksi (termasuk transitif) di semua workspace.
 * Gagal (exit 1) bila ada lisensi di luar daftar yang diizinkan. Kebijakan: docs/02-TRD.md.
 *
 *   node scripts/check-licenses.mjs          → periksa
 *   node scripts/check-licenses.mjs --list   → cetak tabel Markdown untuk NOTICE.md
 *
 * Dibuat sendiri karena pemeriksa lisensi umum tidak membaca dependensi workspace npm yang di-hoist.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Zlib",
  "Python-2.0",
  "OFL-1.1", // font (Plus Jakarta Sans, Marcellus, IBM Plex Mono, Amiri)
]);

// Perintah tetap tanpa masukan pengguna, jadi aman dijalankan lewat shell (perlu di Windows untuk npm.cmd).
// `npm ls` keluar dengan galat bila ada versi "invalid" (mis. karena overrides di package.json);
// keluarannya tetap lengkap, jadi tetap dipakai.
let raw;
try {
  raw = execSync("npm ls --omit=dev --all --json --long", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
} catch (err) {
  raw = err.stdout;
}

/** Bila package.json tidak menyebut lisensi, kenali dari berkas LICENSE (hanya lisensi umum). */
function licenseFromFile(dir) {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  if (!file || !existsSync(join(dir, file))) return null;
  const head = readFileSync(join(dir, file), "utf8").slice(0, 400);
  if (/MIT License|Permission is hereby granted, free of charge/i.test(head)) return "MIT";
  if (/Apache License,?\s+Version 2\.0/i.test(head)) return "Apache-2.0";
  if (/ISC License/i.test(head)) return "ISC";
  return null;
}
const tree = JSON.parse(raw);

/** @type {Map<string, {name: string, version: string, license: string, path: string}>} */
const found = new Map();
(function walk(node) {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    if (!dep.path || dep.missing) continue;
    const key = `${name}@${dep.version}`;
    if (found.has(key)) continue;
    const pkg = JSON.parse(readFileSync(join(dep.path, "package.json"), "utf8"));
    if (!pkg.private) {
      const license =
        typeof pkg.license === "string"
          ? pkg.license
          : (pkg.license?.type ??
            (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type ?? l).join(" OR ") : null) ??
            (licenseFromFile(dep.path) ? `${licenseFromFile(dep.path)} (berkas LICENSE)` : "UNKNOWN"));
      found.set(key, { name, version: dep.version, license, path: dep.path });
    }
    walk(dep);
  }
})(tree);

/** Ekspresi SPDX sederhana: "A OR B" cukup salah satu diizinkan, "A AND B" harus semuanya. */
function allowed(expr) {
  const e = expr.trim().replace(/^\((.*)\)$/, "$1");
  if (/\sOR\s/i.test(e)) return e.split(/\s+OR\s+/i).some(allowed);
  if (/\sAND\s/i.test(e)) return e.split(/\s+AND\s+/i).every(allowed);
  return ALLOWED.has(e.replace(/[()]/g, "").replace(/\s*berkas LICENSE\s*/, "").trim());
}

const list = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));

if (process.argv.includes("--list")) {
  console.log("| Paket | Versi | Lisensi |\n|---|---|---|");
  for (const p of list) console.log(`| ${p.name} | ${p.version} | ${p.license} |`);
  process.exit(0);
}

const bad = list.filter((p) => !allowed(p.license));
const counts = {};
for (const p of list) counts[p.license] = (counts[p.license] ?? 0) + 1;
console.log(`${list.length} paket produksi diperiksa:`);
for (const [l, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${l.padEnd(28)} ${n}`);

if (list.length === 0) {
  console.error("Tidak ada paket yang terbaca. Jalankan npm ci terlebih dahulu.");
  process.exit(1);
}
if (bad.length) {
  console.error("\nLisensi di luar kebijakan:");
  for (const p of bad) console.error(`  ${p.name}@${p.version}: ${p.license}`);
  process.exit(1);
}
console.log("\nSemua lisensi sesuai kebijakan.");
