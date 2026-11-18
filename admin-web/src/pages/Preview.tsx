import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type Settings, api, mediaUrl } from "../api";
import { Icon } from "../components/Icon";
import { type Period, TvIllustration } from "../components/TvIllustration";
import { ErrorAlert, Loading } from "../components/ui";
import { DAYS, HARI_BESAR, categoryLabel, rupiah } from "../labels";
import { useMosque } from "../mosque";
import { fmtMin, hijriText, scheduleFor, wallClock } from "../prayer";

interface BundleContent {
  id: string;
  type: string;
  category: string | null;
  arabicText: string | null;
  translation: string | null;
  sourceRef: string | null;
  body: Record<string, unknown> | null;
  mediaId: string | null;
}
interface Weather {
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windKmh: number;
  iconCode: string;
  description: string;
}
interface Bundle {
  mosque: {
    name: string;
    regionLabel: string | null;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  settings: Settings;
  runningTexts: {
    id: string;
    text: string;
    startsOn: string | null;
    endsOn: string | null;
  }[];
  slides: {
    id: string;
    contentId: string;
    durationSec: number;
    daysMask: number;
    timeFrom: string | null;
    timeTo: string | null;
  }[];
  content: BundleContent[];
  announcements: {
    id: string;
    text: string;
    startsAt: string;
    expiresAt: string;
  }[];
  weather: Weather | null;
}
interface Item {
  c: BundleContent;
  seconds: number;
  auto: boolean;
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "FAJAR", label: "Subuh" },
  { id: "SIANG", label: "Siang" },
  { id: "SENJA", label: "Senja" },
  { id: "MALAM", label: "Malam" },
];

/** Warna tema TV (cermin ui/theme/ColorTheme.kt di aplikasi TV). */
const TV_THEMES: Record<
  string,
  {
    accent: string;
    green: string;
    label: string;
    card: string;
    border: string;
    text: string;
    muted: string;
  }
> = {
  classic_mosque: {
    accent: "#B08D57",
    green: "#9CCC65",
    label: "#C9A86A",
    card: "#1A1A1A",
    border: "#3A3A3A",
    text: "#FFFFFF",
    muted: "#B0B0B0",
  },
  midnight_blue: {
    accent: "#F0F0F0",
    green: "#40C8FF",
    label: "#8FC7EA",
    card: "#0D1A2D",
    border: "#1E3557",
    text: "#FFFFFF",
    muted: "#E0E8F0",
  },
  desert_sand: {
    accent: "#E39A5D",
    green: "#FFA558",
    label: "#FFCC80",
    card: "#1C1410",
    border: "#3A2E22",
    text: "#FFF8F0",
    muted: "#E0D5C7",
  },
  royal_purple: {
    accent: "#FFD93D",
    green: "#E040FB",
    label: "#7C4DFF",
    card: "#1A1A1A",
    border: "#353535",
    text: "#FFFFFF",
    muted: "#E0D0F0",
  },
  ocean_teal: {
    accent: "#F5F5F5",
    green: "#26C6DA",
    label: "#4DD0E1",
    card: "#1A1A1A",
    border: "#343434",
    text: "#FFFFFF",
    muted: "#D0F0F0",
  },
  elegant_charcoal: {
    accent: "#F5C4A6",
    green: "#FF9E80",
    label: "#FFB4A0",
    card: "#1A1A1A",
    border: "#343434",
    text: "#FFFFFF",
    muted: "#E0E0E0",
  },
  emerald_garden: {
    accent: "#FFD700",
    green: "#4ADE80",
    label: "#22D3EE",
    card: "#1A1A1A",
    border: "#343434",
    text: "#FFFFFF",
    muted: "#D1FAE5",
  },
  burgundy_elegance: {
    accent: "#E5E5E5",
    green: "#F87171",
    label: "#FFB74D",
    card: "#1A1A1A",
    border: "#343434",
    text: "#FFFFFF",
    muted: "#FFE6E6",
  },
  sapphire_night: {
    accent: "#F8F9FA",
    green: "#60A5FA",
    label: "#93C5FD",
    card: "#1A1A1A",
    border: "#343434",
    text: "#FFFFFF",
    muted: "#E0E8F0",
  },
  amber_sunset: {
    accent: "#FFF8E1",
    green: "#FFB74D",
    label: "#FFE082",
    card: "#1A1A1A",
    border: "#343434",
    text: "#FFFFFF",
    muted: "#FFF3E0",
  },
};

type Screen = "UTAMA" | "ADZAN" | "IQAMAH" | "SHALAT" | "PENUH";

/** Daftar putar yang sama dengan TV: slide sesuai jadwal, hadits otomatis disisipkan (tiap slide bila slide hanya satu). */
function buildPlaylist(b: Bundle, now: Date): Item[] {
  const day = (now.getDay() + 6) % 7; // Senin = 0
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const byId = new Map(b.content.map((c) => [c.id, c]));
  const scheduled: Item[] = [];
  for (const s of b.slides) {
    if (!(s.daysMask & (1 << day))) continue;
    if (s.timeFrom && s.timeTo) {
      const [f, t] = [toMin(s.timeFrom), toMin(s.timeTo)];
      if (f <= t ? !(minutes >= f && minutes < t) : !(minutes >= f || minutes < t)) continue;
    }
    const c = byId.get(s.contentId);
    if (c) scheduled.push({ c, seconds: s.durationSec, auto: false });
  }
  if ((day === 3 && minutes >= 900) || (day === 4 && minutes < 720)) {
    scheduled.sort((a, z) => Number(z.c.type === "info_jumat") - Number(a.c.type === "info_jumat"));
  }
  const ids = new Set(scheduled.map((s) => s.c.id));
  const autoSec = b.settings.display.content.slideSeconds;
  // Urutan hadits otomatis diacak per hari (TV juga mengacak per hari; urutan persisnya bisa berbeda).
  const daySeed = Math.floor(now.getTime() / 86_400_000);
  const autos = shuffled(
    b.content.filter((c) => c.type === "hadith" && c.translation && !ids.has(c.id)),
    daySeed,
  ).map((c) => ({ c, seconds: autoSec, auto: true }));
  if (!scheduled.length) return autos;
  if (!autos.length) return scheduled;
  // Slide diulang sampai semua hadits kebagian tampil (sama dengan TV).
  const every = scheduled.length >= 2 ? 2 : 1;
  const out: Item[] = [];
  let a = 0;
  do {
    scheduled.forEach((s, i) => {
      out.push(s);
      if ((i + 1) % every === 0 && a < autos.length) out.push(autos[a++]!);
    });
  } while (a < autos.length);
  return out;
}

/** Acak berbenih (mulberry32) agar urutan stabil dalam sehari. */
function shuffled<T>(list: T[], seed: number): T[] {
  let t = seed >>> 0;
  const rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Menandai teks yang terpotong di TV (Design Brief §5: tidak boleh dikecilkan otomatis). */
function useClipped(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState<string[]>([]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const found = [...el.querySelectorAll<HTMLElement>("[data-clamp]")].filter((n) => n.scrollHeight > n.clientHeight + 2).map((n) => n.dataset.clamp!);
    setClipped(found);
  }, [dep]);
  return { ref, clipped };
}

const WX_ICON: Record<string, string> = {
  "01": "☀",
  "02": "⛅",
  "03": "☁",
  "04": "☁",
  "09": "🌧",
  "10": "🌧",
  "11": "⛈",
  "13": "❄",
  "50": "🌫",
};

export function PreviewPage() {
  const { mosque } = useMosque();
  const q = useQuery({
    queryKey: ["preview", mosque.id],
    queryFn: () => api<Bundle>("GET", `/api/admin/mosques/${mosque.id}/preview`),
  });
  const [period, setPeriod] = useState<Period | "AUTO">("AUTO");
  const [layoutView, setLayoutView] = useState<"AUTO" | "BAR_BAWAH" | "GALERI">("AUTO");
  const [screen, setScreen] = useState<Screen>("UTAMA");
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const playlist = useMemo(() => (q.data ? buildPlaylist(q.data, new Date()) : []), [q.data]);
  const item = playlist.length ? playlist[index % playlist.length] : null;
  const { ref, clipped } = useClipped(`${item?.c.id}-${screen}`);

  useEffect(() => {
    if (!auto || !item || playlist.length < 2) return;
    const t = setTimeout(() => setIndex((i) => i + 1), Math.min(item.seconds, 8) * 1000);
    return () => clearTimeout(t);
  }, [auto, item, playlist.length]);

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorAlert error={q.error} />;
  const b = q.data;
  const s = b.settings;
  const silhouette = s.display.illustration.silhouette;
  const tz = b.mosque.timezone || "Asia/Jakarta";
  const wc = wallClock(tz, now);
  const times = scheduleFor(s.schedule, b.mosque.latitude, b.mosque.longitude, tz, wc.y, wc.m, wc.d);
  const use24h = s.display.clock.use24h;
  const hhmm = fmtMin(wc.minutes, use24h);
  const clockText = s.display.clock.showSeconds ? hhmm.replace(/^(\d+:\d+)/, `$1:${String(wc.seconds).padStart(2, "0")}`) : hhmm;
  const cards = (
    [
      ["imsak", "Imsak"],
      ["subuh", "Subuh"],
      ["terbit", "Terbit"],
      ["dzuhur", "Dzuhur"],
      ["ashar", "Ashar"],
      ["maghrib", "Maghrib"],
      ["isya", "Isya"],
    ] as const
  ).filter(([k]) => (k !== "imsak" || s.schedule.showImsak) && (k !== "terbit" || s.schedule.showTerbit));
  const adzanKeys = ["subuh", "dzuhur", "ashar", "maghrib", "isya"] as const;
  const nextKey = adzanKeys.find((k) => times[k] > wc.minutes) ?? "subuh";
  const isFriday = new Date(Date.UTC(wc.y, wc.m - 1, wc.d)).getUTCDay() === 5;
  const nextName = {
    subuh: "Subuh",
    dzuhur: isFriday ? "Jumat" : "Dzuhur",
    ashar: "Ashar",
    maghrib: "Maghrib",
    isya: "Isya",
  }[nextKey];
  const left = (((times[nextKey] - wc.minutes) % 1440) + 1440) % 1440;
  const remaining = left >= 60 ? `${Math.floor(left / 60)} jam ${left % 60} menit lagi` : `${left} menit lagi`;
  const autoPeriod: Period =
    wc.minutes >= times.subuh && wc.minutes < times.terbit
      ? "FAJAR"
      : wc.minutes >= times.terbit && wc.minutes < times.maghrib - 30
        ? "SIANG"
        : wc.minutes >= times.maghrib - 30 && wc.minutes < times.isya
          ? "SENJA"
          : "MALAM";
  const shownPeriod: Period = period === "AUTO" ? autoPeriod : period;
  const contentOn = s.display.content.enabled;
  const tvLayout = contentOn ? s.display.layout : "BAR_BAWAH";
  const layout = layoutView === "AUTO" ? tvLayout : layoutView;
  const dateText = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const hijri = hijriText(s.schedule.hijri, now, tz);
  const theme = TV_THEMES[s.display.colorTheme] ?? TV_THEMES.classic_mosque!;
  const vars = {
    "--tv-accent": theme.accent,
    "--tv-green": theme.green,
    "--tv-label": theme.label,
    "--tv-card": theme.card,
    "--tv-border": theme.border,
    "--tv-text": theme.text,
    "--tv-muted": theme.muted,
  } as React.CSSProperties;
  const bgMain = s.display.media.backgroundMainId;
  const nowMs = now.getTime();
  const announcement = b.announcements.find((a) => Date.parse(a.startsAt) <= nowMs && Date.parse(a.expiresAt) > nowMs) ?? null;
  const running = b.runningTexts.map((t) => t.text).join("   •   ");
  const weather = s.display.showWeather ? b.weather : null;
  const showFullscreen = screen === "PENUH" && item;

  const bottomBar = announcement ? (
    <div className="tv-ann">
      <span>PENGUMUMAN</span>
      <b>{announcement.text}</b>
    </div>
  ) : (
    <div className="tv-running" data-clamp="Teks berjalan">
      {running || " "}
    </div>
  );
  const prayerRow = (
    <div className="tv-cards" style={{ gridTemplateColumns: `repeat(${cards.length}, 1fr)` }}>
      {cards.map(([k, n]) => (
        <div key={k} className={k === nextKey ? "on" : ""}>
          <span>{n}</span>
          {k !== "terbit" && k !== "imsak" && <i>Adzan</i>}
          <b>{fmtMin(times[k], use24h)}</b>
        </div>
      ))}
    </div>
  );
  const header = (
    <div className="tv-name">
      {s.display.media.logoId ? <img src={mediaUrl(s.display.media.logoId)} alt="" /> : <img src="/admin/logo-mark.png" alt="" />}
      {b.mosque.name}
    </div>
  );

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h2>Pratinjau layar TV</h2>
        <Link className="btn btn-small" to={`/m/${mosque.id}/konten`}>
          Atur slide
        </Link>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Gambaran layar TV dengan isi, warna, dan gambar latar yang sama. Jam shalat di sini perkiraan (bisa beda ±1 menit dari TV). Slide diputar lebih cepat, 8
        detik per slide.
      </p>

      <div className="segmented" role="group" aria-label="Layar">
        {(
          [
            ["UTAMA", "Layar utama"],
            ["ADZAN", "Menuju adzan"],
            ["IQAMAH", "Menuju iqamah"],
            ["SHALAT", "Saat shalat"],
            ...(contentOn && s.display.mutiaraHadits.enabled && playlist.length ? ([["PENUH", "Slide layar penuh"]] as const) : []),
          ] as const
        ).map(([v, label]) => (
          <label key={v}>
            <input type="radio" name="screen" checked={screen === v} onChange={() => setScreen(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {screen === "UTAMA" && (
        <div className="segmented" role="group" aria-label="Tata letak">
          {(
            [
              ["AUTO", `Seperti di TV (${tvLayout === "GALERI" ? "slide di samping jam" : "jam & jadwal saja"})`],
              ["BAR_BAWAH", "Jam & jadwal saja"],
              ["GALERI", "Slide di samping jam"],
            ] as const
          ).map(([v, label]) => (
            <label key={v}>
              <input type="radio" name="layoutView" checked={layoutView === v} onChange={() => setLayoutView(v)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
      {screen === "UTAMA" && layout !== tvLayout && (
        <div className="feature-note">
          <span>Ini hanya contoh. TV masih tampil {tvLayout === "GALERI" ? "dengan slide di samping jam" : "jam & jadwal saja"}; ubah di Konten → Slide.</span>
        </div>
      )}
      {(layout === "GALERI" || screen === "PENUH") && (
        <div className="segmented" role="group" aria-label="Suasana langit">
          <label>
            <input type="radio" name="period" checked={period === "AUTO"} onChange={() => setPeriod("AUTO")} />
            <span>Suasana langit: sekarang</span>
          </label>
          {PERIODS.map((p) => (
            <label key={p.id}>
              <input type="radio" name="period" checked={period === p.id} onChange={() => setPeriod(p.id)} />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      )}

      <div className="tv-frame" ref={ref} style={vars}>
        {screen === "ADZAN" || screen === "IQAMAH" ? (
          <div className="tv-count">
            {s.display.media.backgroundIqamahId && <img className="tv-bg" src={mediaUrl(s.display.media.backgroundIqamahId)} alt="" />}
            <div className="tv-count-title">{screen === "ADZAN" ? `Adzan ${nextName}` : `Iqamah ${nextName}`}</div>
            {screen === "ADZAN" && <div className="tv-count-time">{fmtMin(times[nextKey], use24h)}</div>}
            <div className="tv-flip">
              {(screen === "ADZAN"
                ? String(Math.min(s.prayerCycle.fullScreenCountdown.minutes, 99)).padStart(2, "0")
                : String(s.prayerCycle.iqamahGapMinutes[nextKey]).padStart(2, "0")
              )
                .split("")
                .map((d, i) => (
                  <b key={`m${i}`}>{d}</b>
                ))}
              <span>:</span>
              <b>0</b>
              <b>0</b>
            </div>
            {screen === "IQAMAH" && (
              <div className="tv-count-sub dua tv-pray-silent">
                <Icon name="pray" />
                Waktu terbaik untuk berdoa
              </div>
            )}
          </div>
        ) : screen === "SHALAT" ? (
          <div className="tv-count">
            {s.display.media.backgroundPrayerId && <img className="tv-bg" src={mediaUrl(s.display.media.backgroundPrayerId)} alt="" />}
            <Icon name="mosque" className="tv-pray-icon" />
            <div className="tv-count-title">Telah Masuk Waktu Shalat</div>
            <div className="tv-pray-clock">
              {fmtMin(wc.minutes, use24h)}:{String(wc.seconds).padStart(2, "0")}
            </div>
            <div className="tv-pray-silent">
              <Icon name="phoneOff" />
              Mohon matikan / senyapkan (silent) HP Anda
            </div>
            <div className="tv-count-sub">Marilah menunaikan shalat berjamaah</div>
          </div>
        ) : showFullscreen ? (
          <div className="tv-mutiara">
            {item.c.type === "hadith" ? (
              <>
                <TvIllustration period={shownPeriod} silhouette={silhouette} />
                <div className="tv-dim" />
                <div className="tv-mutiara-card">
                  <span className="tv-chip">Mutiara Hadits · {categoryLabel(item.c.category)}</span>
                  <HadithBlock c={item.c} center />
                </div>
              </>
            ) : (
              <SlideView item={item} period={shownPeriod} silhouette={silhouette} />
            )}
            <div className="tv-mutiara-clock">{hhmm}</div>
            <div className={announcement ? "tv-mutiara-next raised" : "tv-mutiara-next"}>
              {nextName} {fmtMin(times[nextKey], use24h)}
            </div>
            {announcement && bottomBar}
          </div>
        ) : layout === "BAR_BAWAH" ? (
          <div className="tv-bar">
            {bgMain && <img className="tv-bg" src={mediaUrl(bgMain)} alt="" />}
            <div className="tv-bar-main">
              {header}
              <div className="tv-box tv-clockbox">
                <div className="tv-clock">{clockText}</div>
                <div className="tv-dates">
                  <span>{hijri}</span>
                  <span>{dateText}</span>
                </div>
              </div>
            </div>
            <div className="tv-bar-side">
              <div className="tv-box tv-next">
                <span>Berikutnya</span>
                <strong>Adzan {nextName}</strong>
                <b>{fmtMin(times[nextKey], use24h)}</b>
              </div>
              {weather && (
                <div className="tv-box tv-weather">
                  <span className="wx-icon">{WX_ICON[weather.iconCode.slice(0, 2)] ?? "☁"}</span>
                  <b>{Math.round(weather.temperatureC)}°C</b>
                  <small>
                    🌡 {Math.round(weather.feelsLikeC)}° · 💧 {weather.humidity}%
                    <br />
                    💨 {Math.round(weather.windKmh)} km/j
                  </small>
                </div>
              )}
            </div>
            {prayerRow}
            {bottomBar}
          </div>
        ) : (
          <div className="tv-gallery">
            {bgMain && <img className="tv-bg" src={mediaUrl(bgMain)} alt="" />}
            <div className="tv-gal-left">
              <div className="tv-slide">
                {item ? (
                  <SlideView item={item} period={shownPeriod} silhouette={silhouette} />
                ) : (
                  <EmptySlide name={b.mosque.name} period={shownPeriod} silhouette={silhouette} />
                )}
                {playlist.length > 1 && (
                  <div className="tv-dots">
                    {playlist.slice(0, 12).map((_, i) => (
                      <i key={i} className={i === index % playlist.length ? "on" : ""} />
                    ))}
                  </div>
                )}
              </div>
              {weather && (
                <div className="tv-wx-strip">
                  <span className="wx-icon">{WX_ICON[weather.iconCode.slice(0, 2)] ?? "☁"}</span>
                  <b>{Math.round(weather.temperatureC)}°C</b>
                  <span className="wx-desc">{weather.description.charAt(0).toUpperCase() + weather.description.slice(1)}</span>
                  <small>
                    🌡 {Math.round(weather.feelsLikeC)}° · 💧 {weather.humidity}% · 💨 {Math.round(weather.windKmh)} km/j
                  </small>
                </div>
              )}
            </div>
            <div className="tv-gal-right">
              {header}
              <div className="tv-box tv-clockbox">
                <div className="tv-clock">{clockText}</div>
                <div className="tv-dates stacked">
                  <span>{hijri}</span>
                  <span>{dateText}</span>
                </div>
              </div>
              <div className="tv-box tv-next-row">
                <div>
                  <span>Berikutnya</span>
                  <strong>Adzan {nextName}</strong>
                  <small>{remaining}</small>
                </div>
                <b>{fmtMin(times[nextKey], use24h)}</b>
              </div>
            </div>
            {prayerRow}
            {bottomBar}
          </div>
        )}
      </div>

      {clipped.filter((c) => c !== "Teks berjalan").length > 0 && (
        <div className="alert alert-warn small">
          Teks terpotong di TV: {clipped.filter((c) => c !== "Teks berjalan").join(", ")}. Persingkat teksnya agar tampil utuh.
        </div>
      )}
      {playlist.length > 0 && ((screen === "UTAMA" && layout === "GALERI") || screen === "PENUH") && (
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="btn btn-small" onClick={() => setIndex((i) => (i - 1 + playlist.length) % playlist.length)}>
            ← Sebelumnya
          </button>
          <button className="btn btn-small" onClick={() => setAuto(!auto)}>
            {auto ? "Jeda" : "Putar"}
          </button>
          <button className="btn btn-small" onClick={() => setIndex((i) => i + 1)}>
            Berikutnya →
          </button>
          <span className="muted small" style={{ alignSelf: "center" }}>
            Slide {(index % playlist.length) + 1} dari {playlist.length}
            {item?.auto ? " · hadits otomatis" : ""} · hari ini {DAYS[(new Date().getDay() + 6) % 7]}
          </span>
        </div>
      )}
      {!contentOn && (
        <div className="feature-note">
          <span>Slide & hadits sedang dimatikan, jadi TV hanya menampilkan jam dan jadwal shalat. Nyalakan di Konten → Slide.</span>
        </div>
      )}
    </div>
  );
}

function HadithBlock({ c, center }: { c: BundleContent; center?: boolean }) {
  return (
    <div className={center ? "tv-hadith center" : "tv-hadith"}>
      {c.arabicText && (
        <div className="tv-arabic" dir="rtl" lang="ar" data-clamp="Teks Arab (maks. 2 baris)">
          {c.arabicText}
        </div>
      )}
      <div className="tv-translation" data-clamp="Terjemah (maks. 4 baris)">
        “{c.translation}”
      </div>
      <div className="tv-source">{c.sourceRef}</div>
    </div>
  );
}

function EmptySlide({ name, period, silhouette }: { name: string; period: Period; silhouette: string }) {
  return (
    <>
      <TvIllustration period={period} silhouette={silhouette} />
      <div className="tv-shade" />
      <div className="tv-empty-name">{name}</div>
    </>
  );
}

function SlideView({ item, period, silhouette }: { item: Item; period: Period; silhouette: string }) {
  const { c } = item;
  const b = (c.body ?? {}) as Record<string, unknown>;
  if (c.type === "hadith") {
    return (
      <>
        <TvIllustration period={period} silhouette={silhouette} />
        <div className="tv-shade" />
        <span className="tv-chip tv-chip-top">{categoryLabel(c.category)}</span>
        <div className="tv-bottom">
          <HadithBlock c={c} />
        </div>
      </>
    );
  }
  if (c.type === "image") {
    return (
      <>
        {c.mediaId ? <img className="tv-image" src={mediaUrl(c.mediaId)} alt="" /> : <TvIllustration period={period} silhouette={silhouette} />}
        {typeof b.caption === "string" && b.caption && (
          <>
            <div className="tv-shade" />
            <div className="tv-bottom tv-caption">{b.caption}</div>
          </>
        )}
      </>
    );
  }
  const rows: [string, string, boolean?][] = [];
  let label = "";
  let title = "";
  if (c.type === "info_kas") {
    label = "Laporan kas";
    title = `Per ${b.reportDate}`;
    const [o, i, e] = [Number(b.openingBalance), Number(b.income), Number(b.expense)];
    rows.push(["Saldo awal", rupiah(o)], ["Pemasukan", rupiah(i)], ["Pengeluaran", rupiah(e)], ["Saldo akhir", rupiah(o + i - e), true]);
  } else if (c.type === "info_jumat") {
    label = "Petugas Jumat";
    title = String(b.date ?? "");
    rows.push(["Khatib", String(b.khatib ?? "")], ["Imam", String(b.imam ?? "")]);
    if (b.muadzin) rows.push(["Muadzin", String(b.muadzin)]);
    if (b.theme) rows.push(["Tema", String(b.theme)]);
  } else if (c.type === "info_agenda") {
    label = "Agenda kegiatan";
    for (const it of (b.items as {
      day: string;
      time: string;
      title: string;
      speaker?: string;
    }[]) ?? []) {
      rows.push([`${it.day} ${it.time}`, [it.title, it.speaker].filter(Boolean).join(" · ")]);
    }
  } else if (c.type === "info_teks") {
    label = "Informasi";
    title = String(b.title ?? "");
  } else if (c.type === "info_hari_besar") {
    label = "Hari besar Islam";
    title = HARI_BESAR.find((h) => h.id === b.event)?.label.replace(/ \(.*\)$/, "") ?? "";
    rows.push(["Sisa hari", "dihitung di TV", true]);
  }
  return (
    <>
      <TvIllustration period={period} silhouette={silhouette} />
      <div className="tv-dim" />
      <div className="tv-panel" data-clamp={`Panel ${label}`}>
        <div className="tv-panel-label">{label}</div>
        {title && <div className="tv-panel-title">{title}</div>}
        {c.type === "info_teks" && <div className="tv-panel-text">{String(b.text ?? "")}</div>}
        {rows.map(([k, v, hl]) => (
          <div key={k + v} className={hl ? "tv-row hl" : "tv-row"}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </>
  );
}
