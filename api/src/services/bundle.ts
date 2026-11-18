/** Bundle untuk TV (Backend Schema §5.1); dipakai juga oleh pratinjau admin web agar hasilnya sama. */
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { appState, mosques, runningTexts } from "../db/schema.js";
import { bundleAnnouncements } from "../routes/admin-announcements.js";
import { loadSettings } from "../routes/admin-settings.js";
import type { MosqueSettings } from "../settings/schema.js";
import { buildBundleContent } from "./bundle-content.js";

export const BUNDLE_SCHEMA = 1;

/**
 * Pengaturan yang dikirim ke TV. Bila layar konten mati, TV memakai tampilan seperti v1.x
 * (Bar bawah, tanpa layar penuh berkala), termasuk TV versi lama yang belum mengenal `content`.
 * Jam analog tidak lagi didukung (rc.3): selalu digital.
 */
export function settingsForTv(s: MosqueSettings): MosqueSettings {
  const off = !s.display.content.enabled;
  return {
    ...s,
    display: {
      ...s.display,
      layout: off ? "BAR_BAWAH" : s.display.layout,
      mutiaraHadits: { ...s.display.mutiaraHadits, enabled: off ? false : s.display.mutiaraHadits.enabled },
      clock: { ...s.display.clock, type: "DIGITAL" },
    },
  };
}

/** Hari ini menurut zona waktu masjid, format YYYY-MM-DD. */
const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

export async function buildBundle(
  db: Db,
  mosqueId: string,
  device: { id: string; name: string; pinSalt: string; pinHash: string } | null,
) {
  const [mosque] = await db.select().from(mosques).where(eq(mosques.id, mosqueId));
  const [state] = await db.select().from(appState).limit(1);
  const { settings: stored } = await loadSettings(db, mosqueId);
  const settings = settingsForTv(stored);
  const today = todayIn(mosque!.timezone);
  const texts = await db
    .select({ id: runningTexts.id, text: runningTexts.text, startsOn: runningTexts.startsOn, endsOn: runningTexts.endsOn })
    .from(runningTexts)
    .where(
      and(
        eq(runningTexts.mosqueId, mosqueId),
        eq(runningTexts.enabled, true),
        // Yang sudah lewat tidak dikirim; tanggal mulai diperiksa TV (bundle bisa dipakai berhari-hari saat offline).
        sql`(${runningTexts.endsOn} IS NULL OR ${runningTexts.endsOn} >= ${today})`,
      ),
    )
    .orderBy(asc(runningTexts.sortOrder), asc(runningTexts.updatedAt));
  const extra = await buildBundleContent(db, mosqueId, settings);
  const anns = await bundleAnnouncements(db, mosqueId, device?.id ?? null);
  return {
    bundleSchema: BUNDLE_SCHEMA,
    generatedAt: new Date().toISOString(),
    configVersion: mosque!.configVersion,
    contentVersion: state?.contentVersion ?? 1,
    mosque: {
      id: mosque!.id,
      name: mosque!.name,
      regionLabel: mosque!.regionLabel,
      latitude: Number(mosque!.latitude),
      longitude: Number(mosque!.longitude),
      timezone: mosque!.timezone,
    },
    device,
    settings,
    runningTexts: texts,
    slides: extra.slides,
    content: extra.content,
    announcements: anns,
    media: extra.media,
  };
}
