/** Tema admin web: terang (bawaan) atau gelap. Kunjungan pertama mengikuti sistem; pilihan disimpan. */
export type Theme = "light" | "dark";
const KEY = "siwak-theme";

export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return storedTheme() ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

export function applyTheme(t: Theme | null): void {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", (t ?? currentTheme()) === "dark" ? "#083B29" : "#F7F6F3");
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // penyimpanan peramban tidak tersedia: tema tetap berlaku untuk sesi ini
  }
  applyTheme(t);
}
