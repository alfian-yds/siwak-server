/**
 * Skema pengaturan masjid (mosque_settings.data), versi skema 1.
 * Sumber kebenaran: docs/05-BACKEND-SCHEMA.md §4. Batas nilai di sini juga diperiksa ulang di TV.
 */
import { z } from "zod";

export const SETTINGS_SCHEMA_VERSION = 1;

const jam = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "format jam HH:MM");
const koreksi = z.number().int().min(-15, "minimal −15 menit").max(15, "maksimal 15 menit");
const jedaIqamah = z.number().int().min(0).max(60, "maksimal 60 menit");
const jamHari = z.number().int().min(0).max(23);
const mediaId = z.string().uuid().nullable();

const waktu = <T extends z.ZodTypeAny>(t: T) =>
  z.object({ imsak: t, subuh: t, terbit: t, dzuhur: t, ashar: t, maghrib: t, isya: t });
const waktuIqamah = <T extends z.ZodTypeAny>(t: T) => z.object({ subuh: t, dzuhur: t, ashar: t, maghrib: t, isya: t });

const suara = z
  .object({ enabled: z.boolean(), type: z.enum(["BEEP", "TICK", "CUSTOM"]), mediaId })
  .refine((s) => s.type !== "CUSTOM" || s.mediaId !== null, { message: "audio kustom wajib memilih berkas", path: ["mediaId"] });

export const hadithCategories = [
  "adab_masjid",
  "shaf_berjamaah",
  "keutamaan",
  "kebersihan",
  "larangan_masjid",
  "jumat",
  "dzikir_doa",
] as const;

export const mosqueSettingsSchema = z.object({
  schedule: z.object({
    source: z.enum(["KEMENAG", "MANUAL"]),
    manualTimes: waktu(jam),
    offsetsEnabled: z.boolean(),
    offsets: waktu(koreksi),
    showImsak: z.boolean(),
    showTerbit: z.boolean(),
    hijri: z.object({
      source: z.enum(["HISAB", "MANUAL"]),
      dayOffset: z.number().int().min(-2).max(2),
      manual: z
        .object({
          day: z.number().int().min(1).max(30),
          month: z.number().int().min(1).max(12),
          year: z.number().int().min(1400).max(1600),
          setOn: z.string().date(),
        })
        .nullable(),
    }),
  }),
  prayerCycle: z.object({
    iqamahGapMinutes: waktuIqamah(jedaIqamah),
    showIqamahCycle: z.boolean(),
    fullScreenCountdown: z.object({ enabled: z.boolean(), minutes: z.number().int().min(1).max(30) }),
    prayerScreenMinutes: z.number().int().min(1).max(15),
    jumat: z.object({ screenEnabled: z.boolean(), durationMinutes: z.number().int().min(30).max(120) }),
    jumatNightBayan: z.object({ enabled: z.boolean(), minutes: z.number().int().min(0).max(120) }),
  }),
  sound: z.object({ enabled: z.boolean(), adzan: suara, iqamah: suara }),
  display: z.object({
    layout: z.enum(["BAR_BAWAH", "GALERI"]),
    colorTheme: z.string().regex(/^[a-z_]{3,40}$/),
    language: z.enum(["id", "en"]),
    clock: z.object({
      type: z.enum(["DIGITAL", "ANALOG"]),
      showSeconds: z.boolean(),
      use24h: z.boolean(),
      sizePercent: z.union([z.literal(100), z.literal(115), z.literal(130)]),
    }),
    nightMode: z.object({
      enabled: z.boolean(),
      startHour: jamHari,
      endHour: jamHari,
      dimPercent: z.number().int().min(0).max(100),
    }),
    media: z.object({ logoId: mediaId, backgroundMainId: mediaId, backgroundPrayerId: mediaId, backgroundIqamahId: mediaId }),
    showWeather: z.boolean(),
    illustration: z.object({ silhouette: z.enum(["KUBAH", "TUMPANG", "MUSHOLLA"]), useMosquePhoto: z.boolean() }),
    /**
     * Layar konten (2.0-rc.3): slide, panel informasi, dan hadits menjadi satu daftar putar.
     * Mati = tampilan seperti v1.x. Cara tampil: panel samping (`layout` GALERI) dan/atau layar
     * penuh berkala (`mutiaraHadits`, nama lama dipertahankan agar TV versi lama tetap paham).
     */
    content: z.object({
      enabled: z.boolean(),
      /** Lama tiap konten di panel samping (detik), bila slide tidak mengatur sendiri. */
      slideSeconds: z.number().int().min(10, "minimal 10 detik").max(60, "maksimal 60 detik"),
      /** rc.4: putar hadits otomatis dari kategori pilihan. Mati = hanya slide yang dibuat pengurus. */
      autoHadith: z.boolean().default(true),
    }),
    /** Layar penuh berkala: satu konten tampil layar penuh tiap N menit selama M detik, bergantian. */
    mutiaraHadits: z.object({
      enabled: z.boolean(),
      everyMinutes: z.number().int().min(1, "minimal 1 menit").max(60, "maksimal 60 menit"),
      showSeconds: z.number().int().min(10, "minimal 10 detik").max(120, "maksimal 120 detik"),
    }),
    hadithCategories: z
      .array(z.enum(hadithCategories))
      .max(hadithCategories.length)
      .refine((a) => new Set(a).size === a.length, "kategori tidak boleh ganda"),
  }),
  kiosk: z.object({
    // F-TV-20: buka SIWAK lagi bila berada di latar belakang lebih dari N menit.
    autoReturn: z.object({ enabled: z.boolean(), minutes: z.number().int().min(1, "minimal 1 menit").max(120, "maksimal 120 menit") }),
  }),
});

export type MosqueSettings = z.infer<typeof mosqueSettingsSchema>;

/** Pengaturan bawaan untuk masjid baru (selaras dengan bawaan aplikasi TV v1.3). */
export function defaultSettings(): MosqueSettings {
  return {
    schedule: {
      source: "KEMENAG",
      manualTimes: { imsak: "04:20", subuh: "04:30", terbit: "05:45", dzuhur: "11:45", ashar: "15:00", maghrib: "17:50", isya: "19:00" },
      offsetsEnabled: false,
      offsets: { imsak: 0, subuh: 0, terbit: 0, dzuhur: 0, ashar: 0, maghrib: 0, isya: 0 },
      showImsak: false,
      showTerbit: true,
      hijri: { source: "HISAB", dayOffset: 0, manual: null },
    },
    prayerCycle: {
      iqamahGapMinutes: { subuh: 20, dzuhur: 10, ashar: 10, maghrib: 10, isya: 10 },
      showIqamahCycle: true,
      fullScreenCountdown: { enabled: true, minutes: 10 },
      prayerScreenMinutes: 5,
      jumat: { screenEnabled: true, durationMinutes: 60 },
      jumatNightBayan: { enabled: false, minutes: 30 },
    },
    sound: {
      enabled: true,
      adzan: { enabled: true, type: "BEEP", mediaId: null },
      iqamah: { enabled: true, type: "BEEP", mediaId: null },
    },
    display: {
      // Masjid baru mulai seperti v1.x: tanpa layar konten; pengurus menyalakannya bila perlu.
      layout: "BAR_BAWAH",
      colorTheme: "classic_mosque",
      language: "id",
      clock: { type: "DIGITAL", showSeconds: true, use24h: true, sizePercent: 100 },
      nightMode: { enabled: false, startHour: 22, endHour: 4, dimPercent: 85 },
      media: { logoId: null, backgroundMainId: null, backgroundPrayerId: null, backgroundIqamahId: null },
      showWeather: true,
      illustration: { silhouette: "KUBAH", useMosquePhoto: false },
      content: { enabled: false, slideSeconds: 20, autoHadith: true },
      mutiaraHadits: { enabled: false, everyMinutes: 5, showSeconds: 20 },
      hadithCategories: ["adab_masjid", "shaf_berjamaah", "keutamaan", "jumat"],
    },
    kiosk: { autoReturn: { enabled: false, minutes: 10 } },
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Isi field yang belum ada (mis. data lama sebelum field baru ditambahkan) dengan nilai bawaan. */
function fillDefaults(base: unknown, stored: unknown): unknown {
  if (!isObject(base) || !isObject(stored)) return stored === undefined ? base : stored;
  const out: Record<string, unknown> = { ...stored };
  for (const [k, v] of Object.entries(base)) out[k] = k in stored ? fillDefaults(v, stored[k]) : v;
  return out;
}

/**
 * Membaca pengaturan dari basis data. Field yang hilang diisi bawaan; bila data rusak,
 * kembali ke bawaan agar TV dan admin web tetap bisa bekerja.
 */
export function readSettings(stored: unknown): MosqueSettings {
  // Data sebelum rc.3 belum punya display.content: anggap layar konten aktif bila Galeri atau
  // Mutiara Hadits sudah dipakai, agar tampilan TV yang sudah berjalan tidak berubah sendiri.
  if (isObject(stored) && isObject(stored.display) && !("content" in stored.display)) {
    const d = stored.display;
    const used = d.layout === "GALERI" || (isObject(d.mutiaraHadits) && d.mutiaraHadits.enabled === true);
    stored = { ...stored, display: { ...d, content: { enabled: used, slideSeconds: 20, autoHadith: true } } };
  }
  const result = mosqueSettingsSchema.safeParse(fillDefaults(defaultSettings(), stored));
  return result.success ? result.data : defaultSettings();
}

/** Daftar jalur field yang berubah, untuk log aktivitas. */
export function changedPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => changedPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix];
}

/** Mengambil nilai pada jalur "a.b.c". */
export function valueAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (isObject(o) ? o[k] : undefined), obj);
}
