import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.js";

export function createDb(databaseUrl: string) {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    timezone: "Z", // semua waktu UTC (Backend Schema §1)
    charset: "utf8mb4_unicode_ci",
  });
  // Pastikan sesi MariaDB juga UTC, agar CURRENT_TIMESTAMP konsisten dengan nilai dari aplikasi.
  pool.on("connection", (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  const db = drizzle(pool, { schema, mode: "default" });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>["db"];
