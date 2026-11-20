/**
 * Demo layar TV publik (/demo): tampilan yang sama dengan pratinjau pengurus, memakai data contoh
 * "Masjid Al-Ikhlas" dari /api/public/demo. Dengan ?embed=1 hanya layar TV yang tampil dan layar
 * berganti otomatis (dipakai di halaman depan).
 */
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/marcellus/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/amiri/arabic-400.css";
import "./styles.css";
import "./mosque.css";

import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Bundle, TvPreview } from "./pages/Preview";
import { THEMES } from "./pages/SettingsPages";
import { applyTheme, currentTheme, setTheme, storedTheme } from "./theme";

applyTheme(storedTheme());
const embed = new URLSearchParams(location.search).has("embed");

const SAMPLE_ANNOUNCEMENT = "Mobil B 1234 CD mohon dipindahkan, menghalangi pintu keluar";

function Demo() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [failed, setFailed] = useState(false);
  const [theme, setThemeId] = useState("classic_mosque");
  const [announceUntil, setAnnounceUntil] = useState(0);
  const [, tick] = useState(0);
  const [dark, setDark] = useState(() => currentTheme() === "dark");

  useEffect(() => {
    fetch("/api/public/demo")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: Bundle) => setBundle(b))
      .catch(() => setFailed(true));
  }, []);
  // Contoh pengumuman berakhir sendiri.
  useEffect(() => {
    if (!announceUntil) return;
    const t = setTimeout(() => tick((n) => n + 1), Math.max(0, announceUntil - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [announceUntil]);

  const announcing = announceUntil > Date.now();
  const shown = useMemo<Bundle | null>(() => {
    if (!bundle) return null;
    const nowIso = new Date(Date.now() - 60_000).toISOString();
    return {
      ...bundle,
      settings: { ...bundle.settings, display: { ...bundle.settings.display, colorTheme: theme } },
      announcements: announcing ? [{ id: "demo-ann", text: SAMPLE_ANNOUNCEMENT, startsAt: nowIso, expiresAt: new Date(announceUntil).toISOString() }] : [],
    };
  }, [bundle, theme, announcing, announceUntil]);

  if (failed) return <p className="demo-error">Demo belum bisa dimuat. Coba muat ulang halaman.</p>;
  if (!shown) return <div className={embed ? "tv-embed" : "demo-loading"} aria-busy="true" />;
  if (embed) return <TvPreview bundle={shown} mode="embed" tour />;

  const fullscreen = () => {
    const el = document.querySelector<HTMLElement>(".tv-frame");
    void el?.requestFullscreen?.();
  };

  return (
    <div className="demo-page">
      <header className="demo-top">
        <a className="demo-brand" href="/">
          <img src="/admin/logo-mark.png" alt="" width="34" height="34" />
          SIWAK
        </a>
        <nav>
          <a href="/panduan">Panduan</a>
          <a href="/admin/login">Masuk pengurus</a>
          <button
            type="button"
            className="demo-theme-btn"
            aria-label="Ganti mode terang/gelap"
            onClick={() => {
              const t = dark ? "light" : "dark";
              setTheme(t);
              setDark(!dark);
            }}
          >
            {dark ? "☀" : "☾"}
          </button>
        </nav>
      </header>

      <div className="stack">
        <div>
          <h1 className="demo-title">Coba tampilan layar TV SIWAK</h1>
          <p className="muted" style={{ margin: 0 }}>
            Inilah yang tampil di TV masjid setelah SIWAK dipasang. Isi di bawah adalah contoh untuk masjid fiktif Masjid Al-Ikhlas; jam dan jadwal shalat
            berjalan sesuai waktu sekarang di Yogyakarta. Di masjid Anda, semua isi ini diatur pengurus dari HP.
          </p>
        </div>

        <div className="demo-tools">
          <label className="demo-select">
            <span>Tema warna</span>
            <select value={theme} onChange={(e) => setThemeId(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-small" onClick={() => setAnnounceUntil(Date.now() + 30_000)} disabled={announcing}>
            {announcing ? "Pengumuman sedang tampil…" : "Kirim contoh pengumuman"}
          </button>
          <button type="button" className="btn btn-small" onClick={fullscreen}>
            Layar penuh
          </button>
        </div>

        <TvPreview bundle={shown} mode="demo" />

        <div className="demo-cta">
          <div>
            <h2>Pasang di masjid Anda</h2>
            <p className="muted">Gratis, tanpa iklan, dan open source. Bisa dipakai mandiri dengan remote, atau dihubungkan ke HP pengurus.</p>
          </div>
          <div className="actions">
            <a className="btn btn-primary" href="/api/public/latest-apk">
              Unduh aplikasi TV
            </a>
            <a className="btn" href="/panduan">
              Baca panduan
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
