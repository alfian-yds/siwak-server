/**
 * Halaman HTML sederhana yang dirender server: masuk, akses ditolak, dan beranda sementara.
 * Admin web lengkap (React) menggantikan beranda sementara di tugas 1.4.
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · SIWAK</title>
<meta name="theme-color" content="#F7F6F3">
<script src="/site-theme.js"></script>
<style>
  :root { --merek:#0c5138; color-scheme:light; --zamrud:#0c5138; --zamrud-gelap:#083b29; --kuningan:#8a6514; --latar:#f7f6f3; --kartu:#fff; --teks:#17231d; --redup:#6b6a64; --garis:#e4e2dc; --merah:#a83a2c; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { --latar:#07140e; --kartu:#0f2219; --teks:#eef5ef; --redup:#a9c2b2; --garis:#24402f; --kuningan:#e0ba60; --merek:#7fd3ad; color-scheme:dark; } }
  :root[data-theme=dark] { --latar:#07140e; --kartu:#0f2219; --teks:#eef5ef; --redup:#a9c2b2; --garis:#24402f; --kuningan:#e0ba60; --merek:#7fd3ad; color-scheme:dark; }
  .theme-btn { position:fixed; top:16px; right:16px; background:var(--kartu); border:1px solid var(--garis); color:var(--teks); border-radius:999px; min-height:40px; min-width:40px; padding:0 12px; font:inherit; cursor:pointer; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px 16px; background:var(--latar); color:var(--teks); font:16px/1.6 system-ui, sans-serif; }
  main { width:100%; max-width:400px; background:var(--kartu); border:1px solid var(--garis); border-radius:16px; padding:32px 24px; text-align:center; }
  .logo { width:132px; height:auto; display:block; margin:0 auto 8px; background:#fff; border-radius:16px; padding:8px; }
  .merek { font-size:28px; letter-spacing:.12em; font-weight:700; color:var(--merek); margin:0; }
  .sub { color:var(--kuningan); font-size:12px; letter-spacing:.18em; text-transform:uppercase; margin:4px 0 24px; }
  h1 { font-size:20px; margin:0 0 8px; }
  p { color:var(--redup); margin:0 0 20px; }
  .tombol { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; min-height:48px; padding:12px 16px; border:0; border-radius:12px; background:var(--zamrud); color:#fff; font:600 16px system-ui, sans-serif; text-decoration:none; cursor:pointer; }
  .tombol:hover { background:var(--zamrud-gelap); }
  .tombol.kedua { background:transparent; color:var(--teks); border:1px solid var(--garis); }
  .galat { color:var(--merah); font-weight:600; }
  :focus-visible { outline:3px solid var(--kuningan); outline-offset:2px; }
  footer { margin-top:24px; font-size:13px; color:var(--redup); }
  footer a { color:inherit; }
</style>
</head>
<body><button type="button" class="theme-btn" id="theme-btn" aria-label="Ganti mode terang/gelap">☾</button><main>${body}</main></body>
</html>`;
}

const merek = `<img class="logo" src="/admin/logo-full.png" alt="SIWAK, Sistem Informasi Waktu Shalat" width="132" height="170">`;
const kaki = `<footer><a href="/privasi">Kebijakan Privasi</a> · <a href="/syarat">Syarat Penggunaan</a><br>Dikembangkan oleh Alfian Yudisurya</footer>`;

const pesanMasuk: Record<string, string> = {
  batal: "Proses masuk dibatalkan. Silakan coba lagi.",
  gagal: "Masuk dengan Google gagal. Silakan coba lagi.",
  keluar: "Anda sudah keluar.",
  sesi: "Sesi Anda berakhir. Silakan masuk lagi.",
};

export function loginPage(code?: string): string {
  const pesan = code && pesanMasuk[code];
  return layout(
    "Masuk",
    `${merek}
<h1>Masuk ke admin SIWAK</h1>
<p>Untuk pengurus masjid yang sudah didaftarkan.</p>
${pesan ? `<p class="${code === "keluar" ? "" : "galat"}" role="status">${escapeHtml(pesan)}</p>` : ""}
<a class="tombol" href="/auth/google">Masuk dengan Google</a>
${kaki}`,
  );
}

export function notRegisteredPage(email: string): string {
  return layout(
    "Belum terdaftar",
    `${merek}
<h1>Email belum terdaftar</h1>
<p><strong>${escapeHtml(email || "Akun ini")}</strong> belum terdaftar di SIWAK. Hubungi super admin untuk mendapatkan akses.</p>
<a class="tombol kedua" href="/auth/google">Masuk dengan akun lain</a>
${kaki}`,
  );
}

export function deniedPage(reason: string): string {
  return layout(
    "Akses ditolak",
    `${merek}
<h1>Akses ditolak</h1>
<p>${escapeHtml(reason)}</p>
<a class="tombol kedua" href="/admin/login">Kembali</a>
${kaki}`,
  );
}

/** Beranda sementara sampai admin web (tugas 1.4) jadi. */
export function adminHomePage(user: { name: string | null; email: string; isSuperAdmin: boolean }, csrfToken: string): string {
  return layout(
    "Admin",
    `${merek}
<h1>Assalamu'alaikum, ${escapeHtml(user.name ?? user.email)}</h1>
<p>Anda masuk sebagai <strong>${user.isSuperAdmin ? "super admin" : "pengurus"}</strong> (${escapeHtml(user.email)}).<br>Halaman admin sedang dibangun.</p>
<form method="post" action="/auth/logout">
  <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
  <button class="tombol kedua" type="submit">Keluar</button>
</form>`,
  );
}
