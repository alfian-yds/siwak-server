/**
 * Konten untuk TV (Backend Schema §3.4, §5.3): hadits, panel informasi, dan gambar.
 * Aturan isi per jenis divalidasi di sini; panjang teks dibatasi agar terbaca di TV (TRD §14).
 */
import { z } from "zod";
import type { contentItems } from "../db/schema.js";
import { hadithCategories } from "../settings/schema.js";

const date = z.string().date("format tanggal YYYY-MM-DD");
const shortText = (max: number, label = "wajib diisi") => z.string().trim().min(1, label).max(max, `maksimal ${max} karakter`);
const rupiah = z.number().int("tanpa desimal").min(0, "tidak boleh negatif").max(999_999_999_999);

export const hadithFields = z.object({
  category: z.enum(hadithCategories, { message: "pilih kategori" }),
  arabicText: z.string().trim().max(2000, "maksimal 2000 karakter").nullable().default(null),
  translation: shortText(600),
  sourceRef: shortText(120, "sumber wajib diisi, mis. HR. Muslim"),
  gradeNote: z.string().trim().max(200).nullable().default(null),
});

export const hariBesarEvents = [
  "TAHUN_BARU_HIJRIAH",
  "ASYURA",
  "MAULID_NABI",
  "ISRA_MIRAJ",
  "AWAL_RAMADAN",
  "NUZULUL_QURAN",
  "IDUL_FITRI",
  "IDUL_ADHA",
  "ARAFAH",
] as const;

export const infoBodies = {
  info_kas: z.object({
    reportDate: date,
    openingBalance: rupiah,
    income: rupiah,
    expense: rupiah,
  }),
  info_jumat: z.object({
    date,
    khatib: shortText(80),
    imam: shortText(80),
    muadzin: z.string().trim().max(80).default(""),
    theme: z.string().trim().max(120).default(""),
  }),
  info_agenda: z.object({
    items: z
      .array(
        z.object({
          day: shortText(20),
          time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "format jam HH:MM"),
          title: shortText(80),
          speaker: z.string().trim().max(60).default(""),
        }),
      )
      .min(1, "isi minimal satu kegiatan")
      .max(8, "maksimal 8 kegiatan agar terbaca di TV"),
  }),
  info_hari_besar: z.object({ event: z.enum(hariBesarEvents, { message: "pilih hari besar" }) }),
  /** rc.5: informasi bebas berupa judul dan isi teks. */
  info_teks: z.object({
    title: shortText(80),
    text: z.string().trim().min(1, "isi informasi wajib diisi").max(400, "maksimal 400 karakter agar terbaca di TV"),
  }),
} as const;

export type InfoType = keyof typeof infoBodies;
export const infoTypes = Object.keys(infoBodies) as InfoType[];

type Row = typeof contentItems.$inferSelect;

export function contentDto(c: Row) {
  return {
    id: c.id,
    scope: c.scope,
    mosqueId: c.mosqueId,
    type: c.type,
    category: c.category,
    arabicText: c.arabicText,
    translation: c.translation,
    sourceRef: c.sourceRef,
    gradeNote: c.gradeNote,
    body: c.body,
    mediaId: c.mediaId,
    status: c.status,
    originItemId: c.originItemId,
    reviewNote: c.reviewNote,
    reviewedAt: c.reviewedAt,
    updatedAt: c.updatedAt,
  };
}

/** Bentuk konten di bundle TV (Backend Schema §5.1). */
export function bundleContent(c: Row) {
  return {
    id: c.id,
    type: c.type,
    category: c.category,
    arabicText: c.arabicText,
    translation: c.translation,
    sourceRef: c.sourceRef,
    body: c.body,
    mediaId: c.mediaId,
  };
}
