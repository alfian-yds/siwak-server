/**
 * Situs publik (F-WEB): halaman depan, /panduan, /privasi, /syarat, dan tautan unduh APK terbaru.
 * Isi Privasi dan Syarat dibaca dari site/*.md (salinan dokumen di repo aplikasi TV); panduan ditulis di repo ini.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { Marked } from "marked";
import type { Config } from "./config.js";
import { escapeHtml } from "./pages.js";

export const defaultSiteDir = fileURLToPath(new URL("../../site/", import.meta.url));

const css = `
:root{--zamrud:#0C5138;--zamrud-gelap:#083B29;--kuningan:#8A6514;--krem:#F4D99A;--bg:#F7F6F3;--surface:#fff;--text:#17231D;--text-2:#6B6A64;--border:#E4E2DC;--head:rgba(247,246,243,.92);--head-text:#0C5138;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#07140E;--surface:#0F2219;--text:#EEF5EF;--text-2:#A9C2B2;--border:#24402F;--kuningan:#E0BA60;--head:#083B29;--head-text:#F4D99A;color-scheme:dark}}
:root[data-theme=dark]{--bg:#07140E;--surface:#0F2219;--text:#EEF5EF;--text-2:#A9C2B2;--border:#24402F;--kuningan:#E0BA60;--head:#083B29;--head-text:#F4D99A;color-scheme:dark}
.theme-btn{background:transparent;border:1px solid var(--border);color:var(--head-text);border-radius:999px;min-height:36px;padding:0 12px;margin-left:16px;font:inherit;font-size:.9rem;cursor:pointer}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:400 16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--kuningan)}header{background:var(--head);color:var(--head-text);border-bottom:1px solid var(--border);position:sticky;top:0;backdrop-filter:blur(8px)}
.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px}
.brand{font-family:Georgia,"Times New Roman",serif;letter-spacing:.08em;font-size:1.35rem;color:var(--head-text);text-decoration:none;display:flex;align-items:center;gap:10px}.brand img{width:34px;height:34px;background:#fff;border-radius:9px;padding:3px;border:1px solid var(--border)}
.bar nav a{color:var(--head-text);text-decoration:none;margin-left:16px;font-weight:600;font-size:.95rem}
.hero{padding:40px 0 24px;display:grid;gap:32px;align-items:center}
@media (min-width:900px){.hero{grid-template-columns:1fr 1.1fr;padding:64px 0 40px}}
.eyebrow{color:var(--kuningan)!important;font-weight:700;font-size:.85rem!important;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px!important}
.hero h1{font-size:clamp(1.9rem,4.6vw,2.9rem);line-height:1.15;margin:0 0 14px}
.hero-text>p{color:var(--text-2);font-size:1.08rem;max-width:560px;margin:0}
.btn-ghost{background:transparent;border-color:transparent;color:var(--kuningan)}
.tv{background:#111;border-radius:18px;padding:10px;box-shadow:0 18px 40px rgba(0,0,0,.25)}
.tv-screen{aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:linear-gradient(160deg,#0d3b2b,#06150f);color:#fff;display:grid;grid-template-rows:1fr auto auto;container-type:size;font-family:Roboto,system-ui,sans-serif}
.tv-top{display:grid;grid-template-columns:1.25fr 1fr;gap:2.5cqh;padding:3cqh;min-height:0}
.tv-slide,.tv-clock{border-radius:2cqh;padding:3cqh;display:grid;align-content:center;gap:1cqh;min-height:0}
.tv-slide{background:linear-gradient(135deg,#1f5e8a,#163a5c)}
.tv-slide small,.tv-clock small{font-size:3.4cqh;letter-spacing:.08em;color:#F4D99A;font-weight:700}
.tv-slide strong{font-size:7cqh;line-height:1.1}.tv-slide span{font-size:4cqh;opacity:.85}
.tv-clock{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);text-align:center}
.tv-clock strong{font-size:17cqh;line-height:1;color:#FFD54F;font-variant-numeric:tabular-nums}
.tv-clock span{font-size:4cqh;color:#9ccc65}.tv-clock em{font-style:normal;font-size:3.6cqh;opacity:.85}
.tv-row{display:grid;grid-template-columns:repeat(6,1fr);gap:1.5cqh;padding:0 3cqh 2.5cqh}
.tv-p{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:1.6cqh;text-align:center;padding:1.6cqh 0}
.tv-p b{display:block;font-size:4cqh}.tv-p span{font-size:6.6cqh;font-weight:700;color:#FFD54F;font-variant-numeric:tabular-nums}
.tv-p.next{border-color:#FFD54F;background:rgba(255,213,79,.14)}
.tv-ticker{background:#0C5138;font-size:3.8cqh;padding:1.6cqh 3cqh;white-space:nowrap;overflow:hidden}
.block{margin:16px 0 40px}.block-title{font-size:1.4rem;margin:0 0 14px}
.steps{list-style:none;counter-reset:s;margin:0;padding:0;display:grid;gap:12px}
.two{display:grid;gap:12px}
@media (min-width:760px){.steps{grid-template-columns:repeat(3,1fr)}.two{grid-template-columns:1fr 1fr}}
.steps li{counter-increment:s;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 18px 18px 64px;position:relative;display:grid;gap:4px;align-content:start}
.steps li::before{content:counter(s);position:absolute;left:18px;top:18px;width:32px;height:32px;border-radius:50%;background:var(--zamrud);color:#fff;display:grid;place-items:center;font-weight:700}
.steps span{color:var(--text-2);font-size:.95rem}
.cta{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:24px;display:grid;gap:12px;align-items:center}
@media (min-width:760px){.cta{grid-template-columns:1fr auto}}
.cta h2{margin:0 0 6px;font-size:1.3rem}.cta p{margin:0;color:var(--text-2)}.cta .btns{margin:0}
.btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}
.btn{display:inline-flex;align-items:center;min-height:48px;padding:0 20px;border-radius:12px;font-weight:700;text-decoration:none;border:1px solid var(--border);color:var(--text);background:var(--surface)}
.btn-primary{background:var(--zamrud);border-color:var(--zamrud);color:#fff}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
@media (min-width:900px){.grid{grid-template-columns:repeat(3,1fr)}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px}
.card h2,.card h3{font-size:1.05rem;margin:0 0 6px}.card p{margin:0;color:var(--text-2);font-size:.95rem}
.doc{max-width:860px;margin-left:auto!important;margin-right:auto!important;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:8px 20px 24px;margin:24px 0 40px;overflow-wrap:anywhere}
.doc table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;font-size:.92rem}
.doc th,.doc td{border:1px solid var(--border);padding:8px;text-align:left;vertical-align:top}
.doc h1{font-size:1.6rem}.doc h2{font-size:1.2rem;margin-top:28px}
.doc img{display:block;max-width:100%;height:auto;margin:12px auto 18px;border:1px solid var(--border);border-radius:10px}
.doc blockquote{margin:12px 0;padding:8px 14px;border-left:4px solid var(--kuningan);background:var(--bg);border-radius:6px}
.doc hr{border:0;border-top:1px solid var(--border);margin:24px 0}
@media print{header,footer,.theme-btn{display:none!important}body{background:#fff;color:#000;font-size:11pt}
.doc{border:0;padding:0;margin:0!important;max-width:none}.doc h2{break-before:page;margin-top:0}.doc h2:first-of-type{break-before:auto}
.doc img{break-inside:avoid;max-height:14cm;width:auto}.doc table{display:table;break-inside:avoid}a{color:#000;text-decoration:none}}
footer{border-top:1px solid var(--border);color:var(--text-2);font-size:.9rem;padding:20px 0 32px}
footer a{margin-right:14px}`;

/**
 * Tema situs, halaman masuk, dan admin web memakai kunci yang sama ("siwak-theme"): bila belum pernah dipilih,
 * mengikuti setelan terang/gelap perangkat; bila sudah dipilih, pilihan itu berlaku di semua halaman.
 */
export const themeJs = `(function(){var K="siwak-theme",d=document.documentElement,mq=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");
function get(){try{var v=localStorage.getItem(K);return v==="light"||v==="dark"?v:null}catch(e){return null}}
function eff(){return get()||(mq&&mq.matches?"dark":"light")}
function apply(){var t=get();if(t)d.dataset.theme=t;else delete d.dataset.theme;var e=eff();
var b=document.getElementById("theme-btn");if(b){b.textContent=e==="dark"?"☀":"☾";b.title=e==="dark"?"Ganti ke mode terang":"Ganti ke mode gelap";}
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",e==="dark"?"#083B29":"#F7F6F3");}
apply();if(mq&&mq.addEventListener)mq.addEventListener("change",apply);
document.addEventListener("DOMContentLoaded",function(){apply();var b=document.getElementById("theme-btn");
if(b)b.addEventListener("click",function(){var t=eff()==="dark"?"light":"dark";try{localStorage.setItem(K,t)}catch(e){}d.dataset.theme=t;apply();});});})();`;

function layout(title: string, body: string, publicUrl: string): string {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="theme-color" content="#F7F6F3">
<meta name="description" content="SIWAK: jam dan jadwal shalat untuk layar TV masjid, diatur dari HP. Gratis dan open source.">
<link rel="canonical" href="${escapeHtml(publicUrl)}">
<link rel="icon" href="/admin/favicon-64.png" type="image/png"><script src="/site-theme.js"></script><style>${css}</style></head>
<body><header><div class="wrap bar"><a class="brand" href="/"><img src="/admin/logo-mark.png" alt="" width="34" height="34">SIWAK</a>
<nav><a href="/panduan">Panduan</a><a href="/admin/login">Masuk pengurus</a><button type="button" class="theme-btn" id="theme-btn" aria-label="Ganti mode terang/gelap">☾</button></nav></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap"><a href="/panduan">Panduan pengurus</a><a href="/privasi">Kebijakan Privasi</a><a href="/syarat">Syarat Penggunaan</a>
<a href="https://github.com/alfian-yds/siwak">Kode sumber</a><br>SIWAK · Sistem Informasi Waktu Shalat · perangkat lunak open source berlisensi MIT · dikembangkan oleh <strong>Alfian Yudisurya</strong>.
Data cuaca dari OpenWeather.</div></footer></body></html>`;
}

function home(config: Config): string {
  const prayers = [
    ["Subuh", "04:12"],
    ["Terbit", "05:31"],
    ["Dzuhur", "11:48"],
    ["Ashar", "15:09"],
    ["Maghrib", "17:58"],
    ["Isya", "19:10"],
  ];
  const row = prayers.map(([n, t], i) => `<div class="tv-p${i === 3 ? " next" : ""}"><b>${n}</b><span>${t}</span></div>`).join("");
  return `<section class="hero">
<div class="hero-text"><p class="eyebrow">Gratis · tanpa iklan · open source</p>
<h1>Jam dan jadwal shalat untuk layar TV masjid</h1>
<p>Pasang SIWAK di TV atau TV box Android. Layar menampilkan jam, jadwal shalat, hitung mundur adzan dan iqamah,
pengumuman, slide info masjid, dan hadits pilihan. Pengurus mengaturnya dari HP.</p>
<div class="btns"><a class="btn btn-primary" href="/api/public/latest-apk">Unduh aplikasi TV</a>
<a class="btn" href="/admin/login">Masuk pengurus</a><a class="btn btn-ghost" href="/panduan">Baca panduan</a></div></div>
<div class="tv" aria-hidden="true"><div class="tv-screen">
<div class="tv-top"><div class="tv-slide"><small>INFO MASJID</small><strong>Kajian Ahad pagi</strong><span>Ba&#39;da Subuh · Serambi masjid</span></div>
<div class="tv-clock"><small>Masjid Contoh</small><strong>15:02</strong><span>18 November 2026</span><em>Ashar 7 menit lagi</em></div></div>
<div class="tv-row">${row}</div><div class="tv-ticker">Mohon luruskan dan rapatkan shaf · Matikan HP saat shalat</div></div></div>
</section>

<section class="block"><h2 class="block-title">Mulai dalam tiga langkah</h2>
<ol class="steps">
<li><b>Pasang di TV</b><span>Unduh aplikasi, pasang di TV atau TV box Android 5.0 ke atas, lalu buka SIWAK.</span></li>
<li><b>Atur lokasi</b><span>Jadwal shalat langsung dihitung dari lokasi masjid. Cocokkan dengan jadwal setempat lewat koreksi menit.</span></li>
<li><b>Hubungkan ke HP (opsional)</b><span>Di TV pilih <em>Hubungkan ke website SIWAK</em>, lalu ketik kode 8 angka di HP. Setelah itu semua diatur dari HP.</span></li>
</ol></section>

<section class="block"><h2 class="block-title">Dua cara pakai</h2>
<div class="two">
<div class="card"><h3>Mandiri</h3><p>Semua diatur langsung di TV dengan remote. Tidak perlu akun, dan tidak perlu internet setelah jadwal tersimpan.</p></div>
<div class="card"><h3>Terhubung ke website</h3><p>Pengurus mengatur dari HP: jadwal, suara, tampilan, pengumuman, slide, dan hadits. Satu akun bisa mengelola beberapa TV dan beberapa masjid.</p></div>
</div></section>

<section class="block"><h2 class="block-title">Yang bisa dilakukan</h2>
<div class="grid">
<div class="card"><h3>Tetap jalan tanpa internet</h3><p>Jadwal 7 hari tersimpan di TV. Saat internet putus, layar tetap berjalan dengan data terakhir.</p></div>
<div class="card"><h3>Pengumuman seketika</h3><p>Kirim pengumuman dari HP ke satu atau semua TV masjid. Tampil di bagian bawah layar dalam 1 menit.</p></div>
<div class="card"><h3>Slide &amp; hadits</h3><p>Laporan kas, petugas Jumat, agenda, hari besar, gambar, dan hadits terverifikasi diputar bergantian.</p></div>
<div class="card"><h3>Suara adzan &amp; iqamah</h3><p>Pilih bunyi bip, tik, atau rekaman sendiri. Suara tetap berbunyi walau internet putus.</p></div>
<div class="card"><h3>Dipantau dari jauh</h3><p>Lihat apakah TV menyala dan SIWAK sedang tampil. Buka atau mulai ulang SIWAK dari HP.</p></div>
<div class="card"><h3>Pratinjau sebelum tayang</h3><p>Lihat gambaran layar TV di HP, termasuk layar adzan dan iqamah, sebelum mengubah pengaturan.</p></div>
</div></section>

<section class="block cta"><div><h2>Siap dipasang di masjid Anda?</h2>
<p>SIWAK gratis untuk semua masjid. Kode sumbernya terbuka di GitHub (${escapeHtml(config.GITHUB_REPO)}) dan tidak ada data jamaah yang dikumpulkan.</p></div>
<div class="btns"><a class="btn btn-primary" href="/api/public/latest-apk">Unduh aplikasi TV</a><a class="btn" href="/panduan">Panduan pengurus</a><a class="btn" href="/panduan.pdf">Buku panduan (PDF)</a></div></section>`;
}

export async function siteRoutes(app: FastifyInstance, config: Config, dir: string = defaultSiteDir): Promise<void> {
  // Tautan relatif di dokumen (mis. LICENSE) diarahkan ke repo aplikasi TV di GitHub.
  const repoBase = `https://github.com/${config.GITHUB_REPO}/blob/master/`;
  const marked = new Marked({
    gfm: true,
    renderer: {
      link({ href, text }) {
        const url = /^(https?:|mailto:|#|\/)/.test(href) ? href : repoBase + href;
        return `<a href="${escapeHtml(url)}">${text}</a>`;
      },
      html() {
        return ""; // komentar/HTML mentah di berkas sumber tidak ditampilkan
      },
    },
  });
  const page = (file: string, title: string) => {
    const path = join(dir, file);
    if (!existsSync(path)) return null;
    const html = marked.parse(readFileSync(path, "utf8"), { async: false });
    return layout(title, `<article class="doc">${html}</article>`, new URL(`/${file.replace(".md", "")}`, config.SIWAK_PUBLIC_URL).href);
  };
  const privasi = page("privasi.md", "Kebijakan Privasi · SIWAK");
  const syarat = page("syarat.md", "Syarat Penggunaan · SIWAK");
  const panduan = page("panduan.md", "Panduan Pengurus · SIWAK");
  const index = layout("SIWAK · Jam & jadwal shalat untuk TV masjid", home(config), config.SIWAK_PUBLIC_URL);

  const send = (html: string | null) => async (_req: unknown, reply: import("fastify").FastifyReply) =>
    html
      ? reply.type("text/html; charset=utf-8").header("Cache-Control", "public, max-age=600").send(html)
      : reply.code(404).type("text/plain; charset=utf-8").send("Halaman belum tersedia.");

  app.get("/site-theme.js", async (_req, reply) =>
    reply.type("text/javascript; charset=utf-8").header("Cache-Control", "public, max-age=600").send(themeJs),
  );
  app.get("/", send(index));
  app.get("/privasi", send(privasi));
  app.get("/syarat", send(syarat));
  app.get("/panduan", send(panduan));
  // Gambar buku panduan dan versi PDF-nya (nama berkas dibatasi agar tidak bisa keluar dari folder).
  app.get<{ Params: { name: string } }>("/panduan/:name", async (req, reply) => {
    const name = req.params.name;
    const path = join(dir, "panduan", name);
    if (!/^[a-z0-9-]+\.jpg$/.test(name) || !existsSync(path)) return reply.code(404).type("text/plain; charset=utf-8").send("Tidak ditemukan.");
    return reply.type("image/jpeg").header("Cache-Control", "public, max-age=86400").send(createReadStream(path));
  });
  app.get("/panduan.pdf", async (_req, reply) => {
    const path = join(dir, "panduan.pdf");
    if (!existsSync(path)) return reply.code(404).type("text/plain; charset=utf-8").send("Belum tersedia.");
    return reply
      .type("application/pdf")
      .header("Content-Disposition", 'inline; filename="Buku-Panduan-SIWAK.pdf"')
      .header("Cache-Control", "public, max-age=3600")
      .send(createReadStream(path));
  });
  app.get("/api/public/latest-apk", async (_req, reply) => reply.redirect(`https://github.com/${config.GITHUB_REPO}/releases/latest`));
}
