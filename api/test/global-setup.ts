import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createDb } from "../src/db/client.js";

/**
 * Bila TEST_DATABASE_URL diisi: kosongkan basis data uji lalu jalankan semua migrasi.
 * JANGAN arahkan ke basis data produksi; semua tabelnya akan dihapus.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName)) {
    throw new Error(`TEST_DATABASE_URL harus menunjuk basis data uji (nama mengandung "test"), bukan "${dbName}".`);
  }

  const { db, pool } = createDb(url);
  try {
    await pool.query(`ALTER DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const [rows] = await pool.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?", [dbName]);
    const tables = (rows as { t: string }[]).map((r) => r.t);
    if (tables.length > 0) {
      await pool.query("SET FOREIGN_KEY_CHECKS = 0");
      for (const t of tables) await pool.query(`DROP TABLE \`${t}\``);
      await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    }
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  } finally {
    await pool.end();
  }
}
