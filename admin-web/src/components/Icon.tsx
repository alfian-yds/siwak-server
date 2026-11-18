/**
 * Ikon garis sederhana (flat) untuk menu dan pratinjau, menggantikan emoji. Warna mengikuti teks
 * (currentColor) sehingga ikut tema terang/gelap.
 */
export type IconName =
  | "home"
  | "tv"
  | "mosque"
  | "users"
  | "book"
  | "history"
  | "megaphone"
  | "ticker"
  | "slides"
  | "calendar"
  | "volume"
  | "palette"
  | "eye"
  | "menu"
  | "collapse"
  | "expand"
  | "phoneOff"
  | "pray"
  | "settings"
  | "layers"
  | "note"
  | "wallet"
  | "moon"
  | "image";

const PATHS: Record<IconName, string> = {
  note: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
  wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4 2 4M16 13h2",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  tv: "M3 6h18v11H3zM8 21h8M12 17v4",
  mosque: "M12 3c2.5 2 4.5 3.6 4.5 6.5H7.5C7.5 6.6 9.5 5 12 3zM6 9.5h12V20H6zM10 20v-4a2 2 0 0 1 4 0v4M3 20V11M21 20V11M2 20h20M3 11l0-3M21 11l0-3",
  users:
    "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6",
  book: "M4 4.5A1.5 1.5 0 0 1 5.5 3H20v16H5.5A1.5 1.5 0 0 0 4 20.5zM4 20.5A1.5 1.5 0 0 0 5.5 22H20M9 7h7",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
  megaphone: "M3 10v4h3l7 4V6l-7 4zM16 9a4 4 0 0 1 0 6M6 14l1.5 5h2.5l-1-4.5",
  ticker: "M3 7h18M3 12h12M3 17h8M18 15l3 2-3 2",
  slides: "M3 5h18v12H3zM3 14l5-4 4 3 3-2 6 4M8 21h8",
  calendar: "M4 5h16v16H4zM4 9h16M8 3v4M16 3v4M8 13h3M8 17h3M14 13h2",
  volume: "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12",
  palette:
    "M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.6-1.7 0-1.3-1-1.6-1-2.6 0-.9.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3zM7.5 11h.01M10 7h.01M14.5 7h.01M17 11h.01",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  menu: "M4 6h16M4 12h16M4 18h16",
  collapse: "M15 6l-6 6 6 6",
  expand: "M9 6l6 6-6 6",
  phoneOff: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2M3 3l18 18",
  pray: "M12 21v-6M9 21l-1-6 3-8 1 4M15 21l1-6-3-8-1 4M8 15H6l1.5-5M16 15h2l-1.5-5",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 18l10 5 10-5",
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
