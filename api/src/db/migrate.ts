import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createDb } from "./client.js";

/** Menjalankan semua migrasi di folder api/drizzle. Dipanggil oleh `npm run db:migrate`. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diisi di .env");
  const { db, pool } = createDb(url);
  const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
  try {
    await migrate(db, { migrationsFolder });
    console.log("Migrasi basis data selesai.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  // Drizzle membungkus galat MariaDB; tampilkan penyebab aslinya (mis. ERROR 1901).
  const cause = err instanceof Error ? (err.cause as { message?: string } | undefined) : undefined;
  if (cause?.message) console.error(`Penyebab: ${cause.message}`);
  process.exit(1);
});
