/**
 * Skema basis data SIWAK (MariaDB 10.11). Sumber kebenaran: dokumen docs/05-BACKEND-SCHEMA.md.
 * Tahap 1: pengguna, masjid, sesi, pengaturan, perangkat, pairing, teks berjalan, cuaca, log.
 * Tahap 2: media, content_items (hadits, panel informasi, gambar), slides. Tahap 3: announcements.
 */
import { sql } from "drizzle-orm";
import {
  type AnyMySqlColumn,
  bigint,
  boolean,
  char,
  check,
  date,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  text,
  time,
  mysqlTable,
  primaryKey,
  smallint,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** DATETIME(3) dalam UTC. */
const ts = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const now = sql`CURRENT_TIMESTAMP(3)`;
const uuid = (name: string) => char(name, { length: 36 });
/** SHA-256 dalam heksadesimal. */
const sha256Hex = (name: string) => char(name, { length: 64 });

// 3.1 Pengguna & akses --------------------------------------------------------------

export const users = mysqlTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    googleSub: varchar("google_sub", { length: 64 }),
    name: varchar("name", { length: 120 }),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
    lastLoginAt: ts("last_login_at"),
    createdAt: ts("created_at").notNull().default(now),
    createdBy: uuid("created_by").references((): AnyMySqlColumn => users.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("uq_users_email").on(t.email), uniqueIndex("uq_users_google_sub").on(t.googleSub)],
);

export const mosques = mysqlTable(
  "mosques",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    regionLabel: varchar("region_label", { length: 120 }),
    latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
    longitude: decimal("longitude", { precision: 9, scale: 6 }).notNull(),
    timezone: varchar("timezone", { length: 40 }).notNull().default("Asia/Jakarta"),
    configVersion: int("config_version", { unsigned: true }).notNull().default(1),
    createdAt: ts("created_at").notNull().default(now),
    archivedAt: ts("archived_at"),
  },
  (t) => [uniqueIndex("uq_mosques_slug").on(t.slug)],
);

export const memberships = mysqlTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mosqueId: uuid("mosque_id")
      .notNull()
      .references(() => mosques.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["admin", "operator"]).notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mosqueId] })],
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: char("id", { length: 43 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    csrfToken: char("csrf_token", { length: 43 }).notNull(),
    createdAt: ts("created_at").notNull().default(now),
    lastSeenAt: ts("last_seen_at").notNull().default(now),
    expiresAt: ts("expires_at").notNull(),
    userAgent: varchar("user_agent", { length: 300 }),
    ip: varchar("ip", { length: 45 }),
  },
  (t) => [index("ix_sessions_user").on(t.userId), index("ix_sessions_expires").on(t.expiresAt)],
);

// 3.2 Pengaturan masjid -------------------------------------------------------------

export const mosqueSettings = mysqlTable("mosque_settings", {
  mosqueId: uuid("mosque_id")
    .primaryKey()
    .references(() => mosques.id, { onDelete: "cascade" }),
  schemaVersion: smallint("schema_version", { unsigned: true }).notNull().default(1),
  data: json("data").$type<Record<string, unknown>>().notNull(),
  updatedAt: ts("updated_at").notNull().default(now),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

// 3.3 Perangkat TV -------------------------------------------------------------------

export const devices = mysqlTable(
  "devices",
  {
    id: uuid("id").primaryKey(),
    mosqueId: uuid("mosque_id")
      .notNull()
      .references(() => mosques.id),
    name: varchar("name", { length: 60 }).notNull(),
    tokenHash: sha256Hex("token_hash"), // NULL = dicabut
    pinCiphertext: varchar("pin_ciphertext", { length: 128 }).notNull(), // base64: iv + tag + data
    pinSalt: char("pin_salt", { length: 32 }).notNull(), // 16 byte, hex
    pinHash: sha256Hex("pin_hash").notNull(), // SHA-256(salt || pin), dikirim ke TV
    pinUpdatedAt: ts("pin_updated_at").notNull().default(now),
    appVersion: varchar("app_version", { length: 20 }),
    model: varchar("model", { length: 80 }),
    lastSeenAt: ts("last_seen_at"),
    lastConfigVersion: int("last_config_version", { unsigned: true }),
    lastContentVersion: int("last_content_version", { unsigned: true }),
    /** Kapan TV terakhir melaporkan versi pengaturan baru, yaitu saat bundle selesai diterapkan. */
    configAppliedAt: ts("config_applied_at"),
    /** Galat terakhir yang dilaporkan TV (mis. gagal menerapkan bundle); NULL bila tidak ada. */
    lastError: varchar("last_error", { length: 300 }),
    lastErrorAt: ts("last_error_at"),
    clockDriftSec: int("clock_drift_sec"),
    isOnline: boolean("is_online").notNull().default(false),
    appForeground: boolean("app_foreground"), // SIWAK sedang tampil di layar (TRD §7.4)
    appStateSince: ts("app_state_since"),
    canOpenApp: boolean("can_open_app"), // TV boleh membuka SIWAK dari latar belakang
    pairedAt: ts("paired_at").notNull().default(now),
    pairedBy: uuid("paired_by").references(() => users.id, { onDelete: "set null" }),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    uniqueIndex("uq_devices_token").on(t.tokenHash),
    index("ix_devices_mosque").on(t.mosqueId),
    index("ix_devices_seen").on(t.lastSeenAt),
  ],
);

export const pairingCodes = mysqlTable(
  "pairing_codes",
  {
    id: uuid("id").primaryKey(),
    code: char("code", { length: 8 }).notNull(),
    nonceHash: sha256Hex("nonce_hash").notNull(),
    appVersion: varchar("app_version", { length: 20 }),
    model: varchar("model", { length: 80 }),
    expiresAt: ts("expires_at").notNull(),
    claimedAt: ts("claimed_at"),
    claimedBy: uuid("claimed_by").references(() => users.id, { onDelete: "set null" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    tokenDeliveredAt: ts("token_delivered_at"),
    createdIp: varchar("created_ip", { length: 45 }),
    createdAt: ts("created_at").notNull().default(now),
    // Pengganti partial unique index: diisi = code saat dibuat, dikosongkan (NULL) saat diklaim atau
    // kedaluwarsa, sehingga kode hanya wajib unik selama masih aktif. Diisi oleh aplikasi karena
    // MariaDB menolak kolom hitung (GENERATED) dengan ekspresi bersyarat ini.
    activeCode: char("active_code", { length: 8 }),
  },
  (t) => [uniqueIndex("uq_pairing_active_code").on(t.activeCode), index("ix_pairing_expires").on(t.expiresAt)],
);

export const deviceEvents = mysqlTable(
  "device_events",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", [
      "paired",
      "online",
      "offline",
      "clock_drift",
      "error",
      "updated",
      "unpaired",
      "app_foreground",
      "app_background",
      "command",
    ]).notNull(),
    detail: json("detail"),
    at: ts("at").notNull().default(now),
  },
  (t) => [index("ix_device_events").on(t.deviceId, t.at)],
);

export const commandTypes = ["open_app", "sync_now", "restart_app", "show_mutiara"] as const;
export type CommandType = (typeof commandTypes)[number];

/** Perintah jarak jauh dari admin web ke TV (TRD §7.4). */
export const deviceCommands = mysqlTable(
  "device_commands",
  {
    id: uuid("id").primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", commandTypes).notNull(),
    status: mysqlEnum("status", ["pending", "delivered", "done", "failed", "expired"]).notNull().default("pending"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().default(now),
    deliveredAt: ts("delivered_at"),
    finishedAt: ts("finished_at"),
    result: varchar("result", { length: 200 }),
  },
  (t) => [index("ix_cmd_device").on(t.deviceId, t.status), index("ix_cmd_created").on(t.createdAt)],
);

// 3.4 Konten (Tahap 1: teks berjalan) -----------------------------------------------

export const runningTexts = mysqlTable(
  "running_texts",
  {
    id: uuid("id").primaryKey(),
    mosqueId: uuid("mosque_id")
      .notNull()
      .references(() => mosques.id, { onDelete: "cascade" }),
    text: varchar("text", { length: 300 }).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    startsOn: date("starts_on", { mode: "string" }),
    endsOn: date("ends_on", { mode: "string" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: ts("updated_at")
      .notNull()
      .default(now)
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ix_rt_mosque").on(t.mosqueId, t.sortOrder)],
);

// 3.4 Konten (Tahap 2: media, hadits, panel informasi, slide) ------------------------

export const media = mysqlTable(
  "media",
  {
    id: uuid("id").primaryKey(),
    mosqueId: uuid("mosque_id").references(() => mosques.id), // NULL = milik pustaka pusat
    kind: mysqlEnum("kind", ["image", "audio"]).notNull(),
    mime: varchar("mime", { length: 60 }).notNull(),
    bytes: int("bytes", { unsigned: true }).notNull(),
    sha256: sha256Hex("sha256").notNull(), // juga nama berkas di MEDIA_DIR
    width: smallint("width", { unsigned: true }),
    height: smallint("height", { unsigned: true }),
    durationMs: int("duration_ms", { unsigned: true }),
    originalName: varchar("original_name", { length: 200 }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("ix_media_sha").on(t.sha256), index("ix_media_mosque").on(t.mosqueId)],
);

export const contentTypes = ["hadith", "info_kas", "info_jumat", "info_agenda", "info_hari_besar", "image", "info_teks"] as const;
export type ContentType = (typeof contentTypes)[number];
export const contentStatuses = ["draft", "published", "submitted", "verified", "rejected"] as const;

export const contentItems = mysqlTable(
  "content_items",
  {
    id: uuid("id").primaryKey(),
    scope: mysqlEnum("scope", ["global", "mosque"]).notNull(),
    mosqueId: uuid("mosque_id").references(() => mosques.id),
    type: mysqlEnum("type", contentTypes).notNull(),
    category: varchar("category", { length: 40 }),
    arabicText: text("arabic_text"),
    translation: varchar("translation", { length: 600 }),
    sourceRef: varchar("source_ref", { length: 120 }),
    gradeNote: varchar("grade_note", { length: 200 }),
    body: json("body"),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    status: mysqlEnum("status", contentStatuses).notNull(),
    originItemId: uuid("origin_item_id").references((): AnyMySqlColumn => contentItems.id, { onDelete: "set null" }),
    reviewNote: varchar("review_note", { length: 500 }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at")
      .notNull()
      .default(now)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("ix_content_scope_status").on(t.scope, t.status),
    index("ix_content_mosque_type").on(t.mosqueId, t.type),
    // Tanpa awalan nama tabel (batasan MariaDB).
    check(
      "ck_content_scope",
      sql`(scope = 'global' AND mosque_id IS NULL AND status IN ('draft','submitted','verified','rejected')) OR (scope = 'mosque' AND mosque_id IS NOT NULL AND status IN ('draft','published'))`,
    ),
  ],
);

export const slides = mysqlTable(
  "slides",
  {
    id: uuid("id").primaryKey(),
    mosqueId: uuid("mosque_id")
      .notNull()
      .references(() => mosques.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id),
    durationSec: tinyint("duration_sec", { unsigned: true }).notNull().default(20),
    sortOrder: int("sort_order").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    daysMask: tinyint("days_mask", { unsigned: true }).notNull().default(127), // bit 0 = Senin … bit 6 = Minggu
    timeFrom: time("time_from"),
    timeTo: time("time_to"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at")
      .notNull()
      .default(now)
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ix_slides_mosque").on(t.mosqueId, t.sortOrder), check("ck_slides_duration", sql`duration_sec BETWEEN 10 AND 60`)],
);

// 3.5 Lain-lain -----------------------------------------------------------------------

export const weatherCache = mysqlTable("weather_cache", {
  cellKey: varchar("cell_key", { length: 24 }).primaryKey(),
  payload: json("payload").notNull(),
  fetchedAt: ts("fetched_at").notNull(),
  lastRequestedAt: ts("last_requested_at").notNull(),
});

export const appState = mysqlTable(
  "app_state",
  {
    id: tinyint("id", { unsigned: true }).primaryKey(),
    contentVersion: int("content_version", { unsigned: true }).notNull().default(1),
  },
  // Ditulis polos (bukan ${t.id}) karena MariaDB tidak menerima nama kolom berawalan tabel di CHECK.
  () => [check("ck_app_state_single", sql`id = 1`)],
);

export const activityLogs = mysqlTable(
  "activity_logs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    mosqueId: uuid("mosque_id").references(() => mosques.id, { onDelete: "set null" }),
    action: varchar("action", { length: 60 }).notNull(),
    entity: varchar("entity", { length: 40 }),
    entityId: varchar("entity_id", { length: 64 }),
    diff: json("diff"),
    ip: varchar("ip", { length: 45 }),
    at: ts("at").notNull().default(now),
  },
  (t) => [index("ix_activity_mosque").on(t.mosqueId, t.at)],
);

// 3.4 Pengumuman segera (Tahap 3) ---------------------------------------------------

export const ANNOUNCEMENT_MAX_CHARS = 200;

export const announcements = mysqlTable(
  "announcements",
  {
    id: uuid("id").primaryKey(),
    mosqueId: uuid("mosque_id")
      .notNull()
      .references(() => mosques.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "cascade" }), // NULL = semua TV masjid
    text: varchar("text", { length: ANNOUNCEMENT_MAX_CHARS }).notNull(),
    startsAt: ts("starts_at").notNull().default(now),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().default(now),
  },
  // Tanpa awalan nama tabel (batasan MariaDB).
  (t) => [index("ix_ann_mosque").on(t.mosqueId, t.expiresAt), check("ck_ann_window", sql`expires_at > starts_at`)],
);
