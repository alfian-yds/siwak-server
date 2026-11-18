// Membuat Buku Panduan SIWAK (site/panduan.pdf) dari site/panduan.md.
// Tata letak buku: sampul, daftar isi bernomor halaman, tiga bagian, gambar bernomor, nomor halaman di kaki.
// Butuh Microsoft Edge atau Google Chrome (headless) dan pdfunite + pdftotext (poppler).
//   node scripts/panduan-pdf.mjs            (atur BROWSER=<path> bila peramban tidak ditemukan)
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { Marked } from "marked";

const ROOT = resolve(import.meta.dirname, "..");
const SITE = join(ROOT, "site");
const OUT = join(SITE, "panduan.pdf");
const VERSION = "2.0";
const EDITION = "November 2026";

const BROWSERS = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const BROWSER = BROWSERS.find((p) => existsSync(p));
if (!BROWSER) throw new Error("Peramban tidak ditemukan. Atur BROWSER=<path ke Edge/Chrome>.");

/** Bagian buku: judul dan bab pertama yang masuk ke bagian itu. */
const PARTS = [
  { from: 1, title: "Memulai", intro: "Mengenal SIWAK, menyiapkan perangkat, memasang aplikasi, dan memakai TV tanpa website." },
  { from: 5, title: "Mengatur dari HP", intro: "Masuk ke website pengurus, menghubungkan TV, lalu mengatur isi layar, jadwal, suara, dan tampilan." },
  { from: 11, title: "Lanjutan", intro: "TV yang sudah terhubung, memakai HP, tugas super admin, serta perawatan dan penyelesaian masalah." },
];

// ---- Isi: Markdown -> HTML bab ---------------------------------------------------------------
const md = readFileSync(join(SITE, "panduan.md"), "utf8");
// Pembuka versi web (judul, tautan PDF, daftar isi) diganti halaman buku sendiri: ambil mulai bab 1.
const body = md.slice(md.indexOf("## 1."));
const img = (name) => pathToFileURL(join(SITE, "panduan", name)).href;

const marked = new Marked({ gfm: true });
let html = marked.parse(body, { async: false });

// Gambar: setiap paragraf berisi satu gambar menjadi <figure> bernomor per bab.
let chapter = 0;
let fig = 0;
html = html.replace(/<h2>(\d+)\.|<p><img src="\/panduan\/([\w-]+\.jpg)" alt="([^"]*)"><\/p>/g, (m, ch, file, alt) => {
  if (ch) {
    chapter = Number(ch);
    fig = 0;
    return m;
  }
  fig += 1;
  const kind = file.startsWith("tv-") ? "tv" : file.startsWith("web-hp-") ? "hp" : "web";
  return `<figure class="${kind}"><img src="${img(file)}" alt=""><figcaption><b>Gambar ${chapter}.${fig}</b> ${alt}</figcaption></figure>`;
});
// Dua tangkapan layar HP berurutan disandingkan.
html = html.replace(/(<figure class="hp">[\s\S]*?<\/figure>)\s*(<figure class="hp">[\s\S]*?<\/figure>)/g, '<div class="pair">$1$2</div>');
// Paragraf yang hanya berisi teks tebal adalah judul kecil: jangan sampai tertinggal sendiri di bawah halaman.
html = html.replace(/<p><strong>([^<]+)<\/strong><\/p>/g, "<h4>$1</h4>");
// Kutipan "Penting" menjadi kotak catatan.
html = html.replace(/<blockquote>/g, '<blockquote class="note">');
// Garis pemisah dan baris penutup versi web tidak dipakai di buku.
html = html.replace(/<hr>[\s\S]*$/, "");

// Bab dan subbab mendapat id untuk daftar isi; bagian disisipkan sebelum bab pertamanya.
const toc = [];
html = html.replace(/<h([23])>([^<]+)<\/h\1>/g, (m, level, text) => {
  const id = `s${toc.length}`;
  let prefix = "";
  if (level === "2") {
    const n = Number(text.split(".")[0]);
    const part = PARTS.findIndex((p) => p.from === n);
    if (part >= 0) {
      const p = PARTS[part];
      toc.push({ level: 1, id: `p${part}`, text: `Bagian ${part + 1} · ${p.title}` });
      prefix = `<section class="part" id="p${part}"><div class="part-no">Bagian ${part + 1}</div><div class="part-title">${p.title}</div><p>${p.intro}</p></section>`;
    }
  }
  toc.push({ level: Number(level), id, text });
  return `${prefix}<h${level} id="${id}">${text}</h${level}>`;
});

// ---- Gaya --------------------------------------------------------------------------------------
const css = `
@page{size:A4;margin:18mm 18mm 20mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font:10.5pt/1.55 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif;color:#1d2a23}
h1,h2,h3{color:#0C5138;line-height:1.25;break-after:avoid}
h2{font-size:17pt;margin:22pt 0 8pt;padding-bottom:5pt;border-bottom:2px solid #E7D5A8}
h3{font-size:12.5pt;margin:16pt 0 5pt}
h4{font-size:11pt;margin:12pt 0 4pt;color:#1d2a23;break-after:avoid}
p{margin:0 0 7pt;orphans:3;widows:3}
ul,ol{margin:0 0 8pt;padding-left:18pt}li{margin:2pt 0}
a{color:#0C5138;text-decoration:none}
code{font-family:Consolas,monospace;background:#F1EEE6;border-radius:3px;padding:0 3px}
table{border-collapse:collapse;width:100%;margin:6pt 0 10pt;font-size:9.5pt;break-inside:avoid}
th{background:#0C5138;color:#fff;text-align:left;font-weight:600}
th,td{padding:5pt 7pt;border:1px solid #DDD8CC;vertical-align:top}
tr:nth-child(even) td{background:#FAF8F3}
.note{margin:8pt 0 10pt;padding:8pt 11pt;background:#FBF3DF;border-left:4px solid #B08D57;border-radius:4px;break-inside:avoid}
.note p{margin:0}
figure{margin:6pt auto 12pt;break-inside:avoid;text-align:center}
figure img{display:block;margin:0 auto;border:1px solid #D9D4C7;border-radius:6px;object-fit:cover;object-position:top}
figure.tv img{width:82%;aspect-ratio:16/9}
figure.web img{width:82%;aspect-ratio:16/10.5}
figure.hp img{width:100%;aspect-ratio:9/16;border-radius:14px}
figcaption{font-size:8.8pt;color:#5d5b54;margin-top:4pt;padding:0 9%}
figcaption b{color:#0C5138;margin-right:3pt}
.pair{display:flex;gap:14mm;justify-content:center;break-inside:avoid;margin:6pt 0 12pt}
.pair figure{width:52mm;margin:0}.pair figcaption{padding:0}
.part{break-before:page;margin:0 0 14pt;padding:16mm 12mm 12mm;border-radius:10px;color:#F7F2E4;background:linear-gradient(135deg,#0C5138,#083B29)}
.part-no{font-size:10pt;letter-spacing:.25em;text-transform:uppercase;color:#E7C988}
.part-title{font-size:26pt;font-weight:700;margin:4pt 0 6pt;color:#fff}
.part p{margin:0;color:#DCE8DF;font-size:11pt}
.part + h2{margin-top:6pt}
/* Halaman depan dalam */
.front h1{font-size:20pt;margin:0 0 10pt;border:0}
.toc{list-style:none;padding:0;margin:4pt 0 0}
.toc li{display:flex;align-items:baseline;gap:6pt;margin:0}
.toc .l1{margin-top:9pt;font-weight:700;color:#0C5138;font-size:11pt}
.toc .l2{font-weight:600;padding-left:8pt;margin-top:2.5pt}
.toc .l3{padding-left:24pt;color:#4a4a44;font-size:9.6pt}
.toc .dots{flex:1;border-bottom:1px dotted #B9B3A5;transform:translateY(-3pt)}
.toc .pg{min-width:16pt;text-align:right;font-variant-numeric:tabular-nums}
.about{margin-top:12pt;padding:10pt 12pt;border:1px solid #E4DCC8;border-radius:8px;background:#FBF9F4;font-size:9.8pt}
.about p{margin:0 0 4pt}
.end{margin-top:18pt;padding-top:8pt;border-top:1px solid #DDD8CC;font-size:9pt;color:#6b6a64}
`;

const coverCss = `
@page{size:A4;margin:0}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:"Segoe UI",system-ui,sans-serif}
.cover{width:210mm;height:297mm;position:relative;overflow:hidden;color:#F7F2E4;
  background:radial-gradient(120% 70% at 50% 0%,#14704E 0%,#0C5138 45%,#062C1F 100%);padding:26mm 22mm 20mm;display:flex;flex-direction:column}
.cover:before{content:"";position:absolute;inset:0;opacity:.07;
  background-image:radial-gradient(circle at 1px 1px,#fff 1.2px,transparent 1.3px);background-size:9mm 9mm}
.top{display:flex;align-items:center;gap:6mm;position:relative}
.logo{width:30mm;background:#fff;border-radius:6mm;padding:3mm}
.brand{font-size:30pt;font-weight:800;letter-spacing:.18em;color:#fff;line-height:1}
.brand small{display:block;font-size:9.5pt;font-weight:500;letter-spacing:.2em;color:#E7C988;margin-top:3mm;text-transform:uppercase}
.title{position:relative;margin-top:22mm}
.kicker{font-size:11pt;letter-spacing:.32em;text-transform:uppercase;color:#E7C988}
h1{font-size:44pt;line-height:1.05;margin:4mm 0 6mm;color:#fff;font-weight:800}
.lead{font-size:14pt;line-height:1.45;color:#DCE8DF;max-width:150mm;margin:0}
.tv{position:relative;margin:18mm auto 0;width:150mm}
.tv .screen{border:3.2mm solid #0d0f0e;border-radius:3mm;box-shadow:0 10mm 18mm rgba(0,0,0,.45);overflow:hidden;background:#000}
.tv img{display:block;width:100%}
.tv .stand{width:34mm;height:7mm;margin:0 auto;background:linear-gradient(#1b1d1c,#0d0f0e);border-radius:0 0 3mm 3mm}
.bottom{position:relative;margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(231,201,136,.45);padding-top:6mm;font-size:10.5pt;color:#DCE8DF}
.bottom b{color:#fff;font-size:12pt}
.ver{display:inline-block;background:#E7C988;color:#0C5138;font-weight:700;border-radius:99px;padding:1.5mm 5mm;font-size:10.5pt}
`;

const cover = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>${coverCss}</style></head><body>
<div class="cover">
  <div class="top"><img class="logo" src="${pathToFileURL(join(ROOT, "admin-web/public/logo-full.png")).href}" alt="">
    <div class="brand">SIWAK<small>Sistem Informasi Waktu Shalat</small></div></div>
  <div class="title"><div class="kicker">Buku Panduan</div>
    <h1>Jam &amp; Jadwal Shalat<br>untuk Layar Masjid</h1>
    <p class="lead">Panduan lengkap memasang SIWAK di TV, mengatur isi layar dari HP, dan merawatnya sehari-hari.</p></div>
  <div class="tv"><div class="screen"><img src="${img("tv-galeri.jpg")}" alt=""></div><div class="stand"></div></div>
  <div class="bottom"><div><b>siwak.alfianys.id</b><br>Gratis dan open source</div><div style="text-align:right"><span class="ver">Versi ${VERSION}</span><br>${EDITION}</div></div>
</div></body></html>`;

const tocHtml = (pages) =>
  `<ul class="toc">${toc
    .map((t) => `<li class="l${t.level}"><span>${t.text}</span><span class="dots"></span><span class="pg">${pages[t.id] ?? "00"}</span></li>`)
    .join("")}</ul>`;

const book = (pages) => `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Buku Panduan SIWAK</title><style>${css}</style></head><body>
<section class="front">
  <h1>Daftar Isi</h1>
  ${tocHtml(pages)}
  <div class="about">
    <p><b>Tentang buku ini.</b> Buku ini untuk pengurus masjid dan tidak membutuhkan keahlian teknis. Ikuti dari awal:
    memasang aplikasi di TV, menghubungkannya ke website, lalu mengatur isi layar. Contoh di dalamnya memakai masjid fiktif
    <b>Masjid Al-Ikhlas</b>; tampilan di perangkat Anda bisa sedikit berbeda.</p>
    <p>Versi online selalu terbaru: <b>siwak.alfianys.id/panduan</b></p>
  </div>
</section>
${html}
<div class="end">SIWAK adalah perangkat lunak gratis dan open source (lisensi MIT), dikembangkan oleh Alfian Yudisurya. Data cuaca dari OpenWeather.
Pertanyaan, saran, dan laporan masalah: github.com/alfian-yds/siwak/issues</div>
</body></html>`;

// ---- Cetak lewat CDP ------------------------------------------------------------------------
const work = mkdtempSync(join(tmpdir(), "siwak-buku-"));
const port = 9300 + Math.floor(Math.random() * 400);
const proc = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${join(work, "profil")}`, "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });

async function connect() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = list.find((x) => x.type === "page");
      if (t) return t.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("Peramban tidak merespons.");
}
const ws = new WebSocket(await connect());
if (process.env.DEBUG) console.log("terhubung ke peramban");
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, (d) => (d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
await send("Page.enable");

async function print(htmlText, file, opts) {
  const src = join(work, file.replace(".pdf", ".html"));
  if (process.env.DEBUG) console.log("cetak", file);
  writeFileSync(src, htmlText);
  await send("Page.navigate", { url: pathToFileURL(src).href });
  if (process.env.DEBUG) console.log(" navigasi ok");
  await sleep(2500); // tunggu gambar dimuat
  await send("Runtime.evaluate", {
    expression: "Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,5000))])",
    awaitPromise: true,
  });
  if (process.env.DEBUG) console.log(" gambar ok");
  // Hasil diambil bertahap (stream): PDF bergambar terlalu besar untuk satu pesan CDP.
  const { stream } = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, transferMode: "ReturnAsStream", ...opts });
  const chunks = [];
  for (;;) {
    const c = await send("IO.read", { handle: stream, size: 1 << 20 });
    chunks.push(Buffer.from(c.data, c.base64Encoded ? "base64" : "utf8"));
    if (c.eof) break;
  }
  await send("IO.close", { handle: stream });
  writeFileSync(join(work, file), Buffer.concat(chunks));
  return join(work, file);
}

const footer = `<div style="width:100%;font:8pt 'Segoe UI',sans-serif;color:#8a877e;padding:0 18mm;display:flex;justify-content:space-between">
<span>Buku Panduan SIWAK ${VERSION}</span><span class="pageNumber"></span></div>`;
const bodyOpts = { displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: footer };

// Lintasan 1: cari halaman tiap judul; lintasan 2: cetak dengan nomor halaman di daftar isi.
let pages = {};
let bodyPdf = await print(book(pages), "isi.pdf", bodyOpts);
for (let pass = 0; pass < 2; pass++) {
  const count = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [bodyPdf]).toString())[1]);
  const next = {};
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const pageText = [];
  for (let p = 1; p <= count; p++) pageText[p] = norm(execFileSync("pdftotext", ["-f", String(p), "-l", String(p), "-enc", "UTF-8", bodyPdf, "-"]).toString());
  // Daftar isi berakhir di halaman yang memuat "Tentang buku ini"; judul dicari sesudahnya.
  const tocPages = pageText.findIndex((t) => t?.includes("Tentang buku ini"));
  for (const [i, t] of toc.entries()) {
    if (t.level === 1) continue;
    const needle = norm(t.text);
    for (let p = tocPages + 1; p <= count; p++) {
      if (pageText[p].includes(needle)) {
        next[t.id] = p;
        break;
      }
    }
    // Kotak Bagian selalu satu halaman dengan bab pertamanya.
    if (toc[i - 1]?.level === 1) next[toc[i - 1].id] = next[t.id];
  }
  const stable = JSON.stringify(next) === JSON.stringify(pages);
  pages = next;
  if (stable) break;
  bodyPdf = await print(book(pages), "isi.pdf", bodyOpts);
}
const missing = toc.filter((t) => !pages[t.id]).map((t) => t.text);
if (missing.length) console.warn("Halaman tidak ditemukan untuk:", missing);

const coverPdf = await print(cover, "sampul.pdf", { displayHeaderFooter: false });
try {
  await send("Browser.close");
} catch {}
proc.kill();
execFileSync("pdfunite", [coverPdf, bodyPdf, OUT]);
const total = /Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [OUT]).toString())[1];
rmSync(work, { recursive: true, force: true });
console.log(`Selesai: ${OUT} (${total} halaman)`);
