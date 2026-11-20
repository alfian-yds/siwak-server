/**
 * Data contoh untuk halaman demo publik (/demo): masjid fiktif "Masjid Al-Ikhlas" dengan bentuk data yang sama
 * seperti pratinjau pengurus. Hadits hanya diambil dari kumpulan hadits yang sudah terverifikasi.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import { contentItems } from "../db/schema.js";
import { defaultSettings } from "../settings/schema.js";

const DAY = 86_400_000;

/** Tanggal (YYYY-MM-DD) di zona WIB, digeser sejumlah hari. */
function wibDate(offsetDays = 0, from = new Date()): string {
  return new Date(from.getTime() + 7 * 3_600_000 + offsetDays * DAY).toISOString().slice(0, 10);
}

/** Jumat terdekat (hari ini bila hari ini Jumat) dalam WIB. */
function nextFriday(now = new Date()): string {
  const day = new Date(now.getTime() + 7 * 3_600_000).getUTCDay();
  return wibDate((5 - day + 7) % 7, now);
}

export function demoBundleBase(now = new Date()) {
  const settings = defaultSettings();
  settings.display.layout = "GALERI";
  settings.display.content = { enabled: true, slideSeconds: 20, autoHadith: true };
  settings.display.mutiaraHadits = { enabled: true, everyMinutes: 5, showSeconds: 20 };
  settings.schedule.showImsak = true;

  const info = (id: string, type: string, body: Record<string, unknown>) => ({
    id,
    type,
    category: null,
    arabicText: null,
    translation: null,
    sourceRef: null,
    body,
    mediaId: null,
  });
  const content = [
    info("demo-teks", "info_teks", {
      title: "Kerja bakti Ahad pagi",
      text: "Ahad pukul 07.00 kita kerja bakti membersihkan halaman dan tempat wudhu. Jamaah diharap membawa alat kebersihan.",
    }),
    info("demo-jumat", "info_jumat", {
      date: nextFriday(now),
      khatib: "Ust. Ahmad Fauzi",
      imam: "Ust. Rahmat Hidayat",
      muadzin: "Bpk. Slamet",
      theme: "Menjaga amanah",
    }),
    info("demo-kas", "info_kas", { reportDate: wibDate(-1, now), openingBalance: 12_450_000, income: 3_275_000, expense: 1_180_000 }),
    info("demo-agenda", "info_agenda", {
      items: [
        { day: "Senin", time: "18:30", title: "Tahsin Al-Qur'an", speaker: "Ust. Hasan" },
        { day: "Rabu", time: "19:30", title: "Kajian kitab", speaker: "Ust. Ahmad Fauzi" },
        { day: "Sabtu", time: "16:00", title: "TPA anak-anak", speaker: "" },
        { day: "Ahad", time: "05:00", title: "Kajian Ahad pagi", speaker: "Ust. Rahmat Hidayat" },
      ],
    }),
    info("demo-hari-besar", "info_hari_besar", { event: "MAULID_NABI" }),
  ];
  return {
    mosque: { name: "Masjid Al-Ikhlas", regionLabel: "Kota Yogyakarta", latitude: -7.7971, longitude: 110.3688, timezone: "Asia/Jakarta" },
    settings,
    runningTexts: [
      { id: "demo-rt1", text: "Mohon luruskan dan rapatkan shaf", startsOn: null, endsOn: null },
      { id: "demo-rt2", text: "Matikan atau senyapkan HP selama shalat", startsOn: null, endsOn: null },
      { id: "demo-rt3", text: "Infaq dapat disalurkan melalui kotak amal di serambi masjid", startsOn: null, endsOn: null },
    ],
    slides: content.map((c) => ({ id: `slide-${c.id}`, contentId: c.id, durationSec: 20, daysMask: 127, timeFrom: null, timeTo: null })),
    content,
    announcements: [] as { id: string; text: string; startsAt: string; expiresAt: string }[],
    weather: { temperatureC: 29, feelsLikeC: 33, humidity: 74, windKmh: 9, iconCode: "02d", description: "cerah berawan" },
  };
}

export async function publicDemoRoutes(app: FastifyInstance, { db }: { db: Db }): Promise<void> {
  app.get("/api/public/demo", async (_req, reply) => {
    const base = demoBundleBase();
    const hadiths = await db
      .select({
        id: contentItems.id,
        category: contentItems.category,
        arabicText: contentItems.arabicText,
        translation: contentItems.translation,
        sourceRef: contentItems.sourceRef,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.type, "hadith"),
          eq(contentItems.scope, "global"),
          eq(contentItems.status, "verified"),
          inArray(contentItems.category, base.settings.display.hadithCategories),
        ),
      )
      .limit(12);
    const content = [...base.content, ...hadiths.map((h) => ({ ...h, type: "hadith", body: null, mediaId: null }))];
    return reply.header("Cache-Control", "public, max-age=300").send({ ...base, content });
  });
}
