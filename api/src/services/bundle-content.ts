/** Bagian konten bundle TV (Backend Schema §5.1): slide, konten, dan daftar media. */
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { contentItems, media, slides } from "../db/schema.js";
import type { MosqueSettings } from "../settings/schema.js";
import { bundleContent } from "./content.js";

export const HADITH_POOL_MAX = 200;

/** Semua id media yang dirujuk pengaturan masjid. */
export function settingsMediaIds(s: MosqueSettings): string[] {
  const m = s.display.media;
  return [m.logoId, m.backgroundMainId, m.backgroundPrayerId, m.backgroundIqamahId, s.sound.adzan.mediaId, s.sound.iqamah.mediaId].filter(
    (x): x is string => typeof x === "string",
  );
}

export async function buildBundleContent(db: Db, mosqueId: string, settings: MosqueSettings) {
  const slideRows = await db
    .select()
    .from(slides)
    .where(and(eq(slides.mosqueId, mosqueId), eq(slides.enabled, true)))
    .orderBy(asc(slides.sortOrder), asc(slides.createdAt));

  const slideContentIds = [...new Set(slideRows.map((s) => s.contentItemId))];
  const slideContent = slideContentIds.length ? await db.select().from(contentItems).where(inArray(contentItems.id, slideContentIds)) : [];
  // Konten slide yang ditarik (draf/ditolak) tidak ikut; slide-nya juga dilewati.
  const usable = slideContent.filter(
    (c) => (c.scope === "mosque" && c.status === "published") || (c.scope === "global" && c.status === "verified"),
  );
  const usableIds = new Set(usable.map((c) => c.id));

  // Kumpulan hadits untuk Mutiara Hadits sesuai kategori pilihan masjid.
  // Hadits otomatis bisa dimatikan: hanya hadits yang dijadikan slide oleh pengurus yang tayang.
  const categories = settings.display.content.autoHadith ? settings.display.hadithCategories : [];
  const pool = categories.length
    ? await db
        .select()
        .from(contentItems)
        .where(
          and(
            eq(contentItems.type, "hadith"),
            inArray(contentItems.category, categories),
            or(
              and(eq(contentItems.scope, "mosque"), eq(contentItems.mosqueId, mosqueId), eq(contentItems.status, "published")),
              and(eq(contentItems.scope, "global"), eq(contentItems.status, "verified")),
            ),
          ),
        )
        .orderBy(asc(contentItems.createdAt))
        .limit(HADITH_POOL_MAX)
    : [];

  const content = new Map<string, (typeof usable)[number]>();
  for (const c of [...usable, ...pool]) content.set(c.id, c);

  const mediaIds = new Set<string>(settingsMediaIds(settings));
  for (const c of content.values()) if (c.mediaId) mediaIds.add(c.mediaId);
  const mediaRows = mediaIds.size ? await db.select().from(media).where(inArray(media.id, [...mediaIds])) : [];

  return {
    slides: slideRows
      .filter((s) => usableIds.has(s.contentItemId))
      .map((s) => ({
        id: s.id,
        contentId: s.contentItemId,
        durationSec: s.durationSec,
        daysMask: s.daysMask,
        timeFrom: s.timeFrom?.slice(0, 5) ?? null,
        timeTo: s.timeTo?.slice(0, 5) ?? null,
      })),
    content: [...content.values()].map(bundleContent),
    media: mediaRows.map((m) => ({ id: m.id, kind: m.kind, mime: m.mime, sha256: m.sha256, bytes: m.bytes })),
  };
}
