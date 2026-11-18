/**
 * Media unggahan (TRD §9). Berkas disimpan di MEDIA_DIR dengan nama = sha256 isinya, sehingga
 * berkas yang sama tidak tersimpan dua kali. Jenis berkas dicek dari isinya, bukan dari namanya.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { parseBuffer } from "music-metadata";
import { and, eq, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { contentItems, media, mosqueSettings } from "../db/schema.js";
import { HttpError } from "../http.js";
import { sha256Hex } from "./device-secrets.js";
import { toWebp } from "./images.js";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
export const AUDIO_MAX_MS = 6 * 60 * 1000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/aac", "video/mp4"]);

export type MediaKind = "image" | "audio";
export type MediaRow = typeof media.$inferSelect;

export const mediaPath = (dir: string, sha256: string) => join(dir, sha256);

export function mediaDto(m: MediaRow) {
  return {
    id: m.id,
    kind: m.kind,
    mime: m.mime,
    bytes: m.bytes,
    sha256: m.sha256,
    width: m.width,
    height: m.height,
    durationMs: m.durationMs,
    originalName: m.originalName,
    global: m.mosqueId === null,
    createdAt: m.createdAt,
  };
}

/**
 * Memeriksa, memproses, menyimpan berkas, lalu mencatatnya di tabel media.
 * Galat ditampilkan apa adanya ke pengurus (App Flow §5).
 */
export async function storeUpload(
  db: Db,
  opts: { dir: string; kind: MediaKind; data: Buffer; originalName: string | null; mosqueId: string | null; userId: string },
): Promise<MediaRow> {
  const { kind, data } = opts;
  const limit = kind === "image" ? IMAGE_MAX_BYTES : AUDIO_MAX_BYTES;
  if (data.length > limit) {
    throw new HttpError(413, "too_large", kind === "image" ? "Berkas lebih dari 5 MB. Perkecil gambar lalu coba lagi." : "Berkas audio lebih dari 10 MB.");
  }
  const detected = await fileTypeFromBuffer(data);
  let out = data;
  let mime: string;
  let width: number | null = null;
  let height: number | null = null;
  let durationMs: number | null = null;

  if (kind === "image") {
    if (!detected || !IMAGE_TYPES.has(detected.mime)) {
      throw new HttpError(415, "unsupported", "Gambar harus berformat JPEG, PNG, atau WebP.");
    }
    try {
      const img = await toWebp(data);
      out = img.data;
      mime = img.mime;
      width = img.width;
      height = img.height;
    } catch {
      throw new HttpError(415, "unsupported", "Gambar tidak bisa dibaca. Coba simpan ulang sebagai JPEG.");
    }
  } else {
    if (!detected || !AUDIO_TYPES.has(detected.mime)) {
      throw new HttpError(415, "unsupported", "Audio harus berformat MP3, OGG, atau M4A.");
    }
    mime = detected.mime === "video/mp4" ? "audio/mp4" : detected.mime;
    try {
      const meta = await parseBuffer(data, { mimeType: mime }, { duration: true, skipCovers: true });
      durationMs = meta.format.duration ? Math.round(meta.format.duration * 1000) : null;
    } catch {
      throw new HttpError(415, "unsupported", "Audio tidak bisa dibaca. Coba simpan ulang sebagai MP3.");
    }
    if (durationMs === null) throw new HttpError(415, "unsupported", "Durasi audio tidak terbaca. Coba simpan ulang sebagai MP3.");
    if (durationMs > AUDIO_MAX_MS) throw new HttpError(413, "too_long", "Audio lebih dari 6 menit. Potong lalu coba lagi.");
  }

  const sha = sha256Hex(out);
  await mkdir(opts.dir, { recursive: true });
  const path = mediaPath(opts.dir, sha);
  if (!existsSync(path)) await writeFile(path, out);

  const id = randomUUID();
  await db.insert(media).values({
    id,
    mosqueId: opts.mosqueId,
    kind,
    mime,
    bytes: out.length,
    sha256: sha,
    width,
    height,
    durationMs,
    originalName: opts.originalName?.slice(0, 200) ?? null,
    uploadedBy: opts.userId,
  });
  return { id, mosqueId: opts.mosqueId, kind, mime, bytes: out.length, sha256: sha, width, height, durationMs, originalName: opts.originalName, uploadedBy: opts.userId, createdAt: new Date() };
}

/** Media dipakai bila dirujuk konten atau pengaturan masjid mana pun. */
export async function isMediaReferenced(db: Db, id: string): Promise<boolean> {
  const [c] = await db.select({ id: contentItems.id }).from(contentItems).where(eq(contentItems.mediaId, id)).limit(1);
  if (c) return true;
  const [s] = await db
    .select({ id: mosqueSettings.mosqueId })
    .from(mosqueSettings)
    .where(sql`CAST(${mosqueSettings.data} AS CHAR) LIKE ${`%${id}%`}`)
    .limit(1);
  return Boolean(s);
}

/** Menghapus catatan media; berkasnya dihapus hanya bila tidak ada catatan lain dengan isi yang sama. */
export async function deleteMedia(db: Db, dir: string, m: Pick<MediaRow, "id" | "sha256">): Promise<void> {
  await db.delete(media).where(eq(media.id, m.id));
  const [same] = await db.select({ id: media.id }).from(media).where(and(eq(media.sha256, m.sha256), ne(media.id, m.id))).limit(1);
  if (!same) await unlink(mediaPath(dir, m.sha256)).catch(() => undefined);
}
