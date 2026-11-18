/**
 * Perkiraan jadwal shalat untuk pratinjau admin web. Metode Kemenag RI (Subuh 20°, Isya 18°, Ashar
 * mazhab Syafi'i), sama dengan parameter AlAdhan method 20 yang dipakai TV; hasil bisa berbeda
 * ±1 menit karena pembulatan. Pengaturan jadwal manual dan koreksi menit masjid ikut diterapkan.
 */
import type { PrayerKey, Settings } from "./api";

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => {
  const v = a - b * Math.floor(a / b);
  return v < 0 ? v + b : v;
};
const sin = (d: number) => Math.sin(rad(d));
const cos = (d: number) => Math.cos(rad(d));
const tan = (d: number) => Math.tan(rad(d));
const asin = (x: number) => deg(Math.asin(x));
const acos = (x: number) => deg(Math.acos(Math.max(-1, Math.min(1, x))));
const atan2 = (y: number, x: number) => deg(Math.atan2(y, x));
const acot = (x: number) => deg(Math.atan(1 / x));

function julian(y: number, m: number, d: number): number {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function sunPosition(jd: number) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = atan2(cos(e) * sin(L), cos(L)) / 15;
  const eqt = q / 15 - fix(RA, 24);
  const decl = asin(sin(e) * sin(L));
  return { decl, eqt };
}

/** Selisih zona waktu (jam) untuk tanggal itu, mis. Asia/Jakarta = 7. */
export function tzOffsetHours(tz: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const wall = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!);
  return Math.round((wall - Math.floor(at.getTime() / 60000) * 60000) / 60000) / 60;
}

/** Tanggal (tahun, bulan, hari) dan menit sejak tengah malam menurut zona waktu masjid. */
export function wallClock(tz: string, at: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<string, number>;
  return { y: p.year!, m: p.month!, d: p.day!, minutes: p.hour! * 60 + p.minute!, seconds: p.second! };
}

export type Times = Record<PrayerKey, number>; // menit sejak tengah malam

/** Jadwal hasil hitungan (sebelum pengaturan masjid). */
export function computeTimes(lat: number, lng: number, tz: string, y: number, m: number, d: number): Times {
  const offset = tzOffsetHours(tz, new Date(Date.UTC(y, m - 1, d, 12)));
  const jDate = julian(y, m, d) - lng / (15 * 24);
  const midDay = (t: number) => fix(12 - sunPosition(jDate + t).eqt, 24);
  const angleTime = (angle: number, t: number, ccw: boolean) => {
    const decl = sunPosition(jDate + t).decl;
    const noon = midDay(t);
    const T = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
    return noon + (ccw ? -T : T);
  };
  const asrTime = (factor: number, t: number) => {
    const decl = sunPosition(jDate + t).decl;
    return angleTime(-acot(factor + tan(Math.abs(lat - decl))), t, false);
  };
  // Dua putaran agar posisi matahari dihitung pada perkiraan jam masing-masing waktu.
  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 };
  for (let i = 0; i < 2; i++) {
    const p = (h: number) => h / 24;
    t = {
      fajr: angleTime(20, p(t.fajr), true),
      sunrise: angleTime(0.833, p(t.sunrise), true),
      dhuhr: midDay(p(t.dhuhr)),
      asr: asrTime(1, p(t.asr)),
      sunset: angleTime(0.833, p(t.sunset), false),
      isha: angleTime(18, p(t.isha), false),
    };
  }
  const toMin = (h: number) => Math.round((h + offset - lng / 15) * 60);
  const subuh = toMin(t.fajr);
  return {
    imsak: subuh - 10,
    subuh,
    terbit: toMin(t.sunrise),
    dzuhur: toMin(t.dhuhr),
    ashar: toMin(t.asr),
    maghrib: toMin(t.sunset),
    isya: toMin(t.isha),
  };
}

const hhmm = (v: string) => {
  const [h, mm] = v.split(":").map(Number);
  return (h ?? 0) * 60 + (mm ?? 0);
};

/** Jadwal yang akan tampil di TV: hitungan atau manual, ditambah koreksi menit bila aktif. */
export function scheduleFor(s: Settings["schedule"], lat: number, lng: number, tz: string, y: number, m: number, d: number): Times {
  const keys: PrayerKey[] = ["imsak", "subuh", "terbit", "dzuhur", "ashar", "maghrib", "isya"];
  const base = s.source === "MANUAL" ? (Object.fromEntries(keys.map((k) => [k, hhmm(s.manualTimes[k])])) as Times) : computeTimes(lat, lng, tz, y, m, d);
  const out = {} as Times;
  for (const k of keys) out[k] = base[k] + (s.offsetsEnabled ? (s.offsets[k] ?? 0) : 0);
  return out;
}

export const fmtMin = (v: number, use24h = true) => {
  const n = ((v % 1440) + 1440) % 1440;
  const h = Math.floor(n / 60);
  const mm = String(n % 60).padStart(2, "0");
  if (use24h) return `${String(h).padStart(2, "0")}:${mm}`;
  return `${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
};

const HIJRI_MONTHS = ["Muharram", "Safar", "Rabiul Awal", "Rabiul Akhir", "Jumadil Awal", "Jumadil Akhir", "Rajab", "Sya'ban", "Ramadhan", "Syawal", "Dzulqa'dah", "Dzulhijjah"];

/** Perkiraan tanggal Hijriah (kalender Umm al-Qura peramban) dengan penyesuaian hari dari pengaturan. */
export function hijriText(s: Settings["schedule"]["hijri"], at: Date, tz: string): string {
  if (s.source === "MANUAL" && s.manual) return `${s.manual.day} ${HIJRI_MONTHS[s.manual.month - 1]} ${s.manual.year} H`;
  try {
    const shifted = new Date(at.getTime() + s.dayOffset * 86400000);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { timeZone: tz, day: "numeric", month: "numeric", year: "numeric" })
        .formatToParts(shifted)
        .map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const month = Number(parts.month);
    return `${parts.day} ${HIJRI_MONTHS[month - 1] ?? ""} ${String(parts.year).replace(/\D/g, "")} H`;
  } catch {
    return "";
  }
}
