import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { appState, contentItems, users } from "./db/schema.js";
import { hadithFields } from "./services/content.js";

/** Draf hadits awal pustaka pusat (tugas 2.3), dari content/hadits-draf.json di akar repo. */
export const defaultHadithDraftFile = fileURLToPath(new URL("../../content/hadits-draf.json", import.meta.url));

/**
 * Data awal yang wajib ada setiap server mulai:
 * - satu baris app_state;
 * - super admin pertama dari SUPERADMIN_EMAIL (aktif dan berstatus super admin);
 * - draf hadits awal bila pustaka pusat masih kosong (berstatus draf, tidak tayang sebelum diverifikasi).
 */
export async function bootstrap(
  db: Db,
  config: Pick<Config, "SUPERADMIN_EMAIL">,
  hadithDraftFile: string | null = defaultHadithDraftFile,
): Promise<void> {
  await db
    .insert(appState)
    .values({ id: 1 })
    .onDuplicateKeyUpdate({ set: { id: sql`id` } });

  const email = config.SUPERADMIN_EMAIL.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!existing) {
    await db.insert(users).values({ id: randomUUID(), email, isSuperAdmin: true, status: "active" });
  } else if (!existing.isSuperAdmin || existing.status !== "active") {
    await db.update(users).set({ isSuperAdmin: true, status: "active" }).where(eq(users.id, existing.id));
  }

  if (hadithDraftFile && existsSync(hadithDraftFile)) await seedHadithDrafts(db, hadithDraftFile);
}

async function seedHadithDrafts(db: Db, file: string): Promise<void> {
  const [any] = await db.select({ id: contentItems.id }).from(contentItems).where(eq(contentItems.scope, "global")).limit(1);
  if (any) return;
  const doc = JSON.parse(readFileSync(file, "utf8")) as { hadits?: unknown[] };
  const rows = (doc.hadits ?? []).map((h) => ({
    id: randomUUID(),
    scope: "global" as const,
    mosqueId: null,
    type: "hadith" as const,
    status: "draft" as const,
    ...hadithFields.parse(h),
  }));
  if (rows.length) await db.insert(contentItems).values(rows);
}
