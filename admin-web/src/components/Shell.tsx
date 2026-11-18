import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { Me } from "../api";
import { currentTheme, setTheme } from "../theme";
import { Icon, type IconName } from "./Icon";

const NAV_KEY = "siwak-nav-collapsed";
const readCollapsed = () => {
  try {
    return localStorage.getItem(NAV_KEY) === "1";
  } catch {
    return false;
  }
};

/** Tautan menu samping dengan ikon; saat menu diciutkan hanya ikonnya yang tampil. */
function NavItem({ to, icon, label, end }: { to: string; icon: IconName; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} title={label}>
      <Icon name={icon} />
      <span className="nav-text">{label}</span>
    </NavLink>
  );
}

export function Shell({ me }: { me: Me }) {
  const { user, csrfToken } = me;
  const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleNav = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(NAV_KEY, c ? "0" : "1");
      } catch {
        // penyimpanan peramban tidak tersedia: pilihan berlaku sampai halaman dimuat ulang
      }
      return !c;
    });
  };
  return (
    <div className={collapsed ? "layout nav-collapsed" : "layout"}>
      <header className="topbar">
        <a className="brand" href="/admin/">
          <img src="/admin/logo-mark.png" alt="" />
          SIWAK
        </a>
        <div className="spacer" />
        <ThemeToggle />
        <div className="user-menu">
          <span className="who" title={user.email}>
            {user.name ?? user.email}
          </span>
          <span className="avatar" aria-hidden="true">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : initial}
          </span>
          <form method="post" action="/auth/logout">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <button className="btn-logout" type="submit">
              Keluar
            </button>
          </form>
        </div>
      </header>
      <nav className="nav" aria-label="Menu utama">
        <button type="button" className="nav-toggle" onClick={toggleNav} aria-expanded={!collapsed} title={collapsed ? "Tampilkan menu" : "Ciutkan menu"}>
          <Icon name={collapsed ? "expand" : "collapse"} />
          <span className="nav-text">Ciutkan menu</span>
        </button>
        <NavItem to="/" end icon="home" label="Beranda" />
        {(user.isSuperAdmin || me.memberships.length > 0) && <NavItem to="/semua-tv" icon="tv" label="Semua TV" />}
        {user.isSuperAdmin && (
          <>
            <span className="nav-label">Super admin</span>
            <NavItem to="/masjid" icon="mosque" label="Masjid" />
            <NavItem to="/pengguna" icon="users" label="Pengguna" />
            <NavItem to="/pustaka" icon="book" label="Kumpulan hadits" />
            <NavItem to="/log" icon="history" label="Riwayat perubahan" />
          </>
        )}
      </nav>
      <main className="main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>
          <strong>SIWAK</strong> · Sistem Informasi Waktu Shalat
        </span>
        <span>
          Dikembangkan oleh <strong>Alfian Yudisurya</strong>
        </span>
        <a href="/panduan">Panduan</a>
        <a href="/privasi">Privasi</a>
        <a href="https://github.com/alfian-yds/siwak" target="_blank" rel="noreferrer">
          Open source (MIT)
        </a>
      </footer>
    </div>
  );
}

/** Ganti tema terang/gelap; pilihan disimpan di peramban ini. */
function ThemeToggle() {
  const [theme, setThemeState] = useState(currentTheme());
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="btn-theme"
      aria-label={next === "dark" ? "Pakai mode gelap" : "Pakai mode terang"}
      title={next === "dark" ? "Mode gelap" : "Mode terang"}
      onClick={() => {
        setTheme(next);
        setThemeState(next);
      }}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
