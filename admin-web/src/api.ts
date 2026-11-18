/** Klien JSON untuk /api/admin/*. Token CSRF diambil dari /api/admin/me dan dikirim di header. */

export type Role = "admin" | "operator";

export interface Me {
  user: { id: string; email: string; name: string | null; avatarUrl: string | null; isSuperAdmin: boolean };
  memberships: { mosqueId: string; mosqueName: string; role: Role }[];
  csrfToken: string;
}

export interface Mosque {
  id: string;
  name: string;
  slug: string;
  regionLabel: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  archivedAt: string | null;
  deviceCount: number;
  memberCount: number;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  status: "active" | "disabled";
  lastLoginAt: string | null;
  createdAt: string;
  memberships: { mosqueId: string; mosqueName: string; role: Role }[];
}

/** Galat dari server dengan pesan siap tampil dan pesan per isian. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

let csrfToken = "";
export const setCsrfToken = (t: string) => {
  csrfToken = t;
};

export async function api<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(method !== "GET" && { "X-CSRF-Token": csrfToken }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "Tidak bisa menghubungi server. Periksa koneksi internet lalu coba lagi.");
  }

  if (res.status === 401) {
    window.location.assign("/admin/login?pesan=sesi");
    throw new ApiError(401, "unauthenticated", "Sesi berakhir. Silakan masuk lagi.");
  }
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string; fields?: Record<string, string> } } | null;
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? "unknown", e?.message ?? `Permintaan gagal (${res.status}).`, e?.fields ?? {});
  }
  return data as T;
}

export const getMe = () => api<Me>("GET", "/api/admin/me");

// ---- Per masjid ---------------------------------------------------------------------

export type MosqueRole = "operator" | "admin" | "super";

export type PrayerKey = "imsak" | "subuh" | "terbit" | "dzuhur" | "ashar" | "maghrib" | "isya";
export type IqamahKey = "subuh" | "dzuhur" | "ashar" | "maghrib" | "isya";
export type SoundType = "BEEP" | "TICK" | "CUSTOM";

/** Cermin dari api/src/settings/schema.ts (Backend Schema §4). */
export interface Settings {
  schedule: {
    source: "KEMENAG" | "MANUAL";
    manualTimes: Record<PrayerKey, string>;
    offsetsEnabled: boolean;
    offsets: Record<PrayerKey, number>;
    showImsak: boolean;
    showTerbit: boolean;
    hijri: {
      source: "HISAB" | "MANUAL";
      dayOffset: number;
      manual: { day: number; month: number; year: number; setOn: string } | null;
    };
  };
  prayerCycle: {
    iqamahGapMinutes: Record<IqamahKey, number>;
    showIqamahCycle: boolean;
    fullScreenCountdown: { enabled: boolean; minutes: number };
    prayerScreenMinutes: number;
    jumat: { screenEnabled: boolean; durationMinutes: number };
    jumatNightBayan: { enabled: boolean; minutes: number };
  };
  sound: {
    enabled: boolean;
    adzan: { enabled: boolean; type: SoundType; mediaId: string | null };
    iqamah: { enabled: boolean; type: SoundType; mediaId: string | null };
  };
  display: {
    layout: "BAR_BAWAH" | "GALERI";
    colorTheme: string;
    language: "id" | "en";
    clock: { type: "DIGITAL" | "ANALOG"; showSeconds: boolean; use24h: boolean; sizePercent: 100 | 115 | 130 };
    nightMode: { enabled: boolean; startHour: number; endHour: number; dimPercent: number };
    media: { logoId: string | null; backgroundMainId: string | null; backgroundPrayerId: string | null; backgroundIqamahId: string | null };
    showWeather: boolean;
    illustration: { silhouette: "KUBAH" | "TUMPANG" | "MUSHOLLA"; useMosquePhoto: boolean };
    content: { enabled: boolean; slideSeconds: number; autoHadith: boolean };
    /** Layar penuh berkala (nama lama dipertahankan). */
    mutiaraHadits: { enabled: boolean; everyMinutes: number; showSeconds: number };
    hadithCategories: string[];
  };
  kiosk: { autoReturn: { enabled: boolean; minutes: number } };
}

export type CommandType = "open_app" | "sync_now" | "restart_app" | "show_mutiara";
export interface DeviceCommand {
  id: string;
  type: CommandType;
  status: "pending" | "delivered" | "done" | "failed" | "expired";
  createdAt: string;
  deliveredAt: string | null;
  finishedAt: string | null;
  result: string | null;
}

export interface Device {
  id: string;
  name: string;
  model: string | null;
  appVersion: string | null;
  pairedAt: string;
  synced: boolean;
  tokenDelivered: boolean;
  online: boolean;
  lastSeenAt: string | null;
  app: { foreground: boolean | null; since: string | null; canOpenApp: boolean | null };
  clockDriftSec: number | null;
  /** Versi pengaturan yang sudah diterapkan TV, kapan, dan galat terakhir dari TV. */
  lastConfigVersion: number | null;
  configAppliedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  commands: DeviceCommand[];
}

export interface RunningText {
  id: string;
  text: string;
  enabled: boolean;
  startsOn: string | null;
  endsOn: string | null;
  sortOrder: number;
  updatedAt: string;
}

// ---- Tahap 2: konten, slide, media ----------------------------------------------------

export type ContentType = "hadith" | "info_kas" | "info_jumat" | "info_agenda" | "info_hari_besar" | "image" | "info_teks";
export type ContentStatus = "draft" | "published" | "submitted" | "verified" | "rejected";

export interface ContentItem {
  id: string;
  scope: "global" | "mosque";
  mosqueId: string | null;
  type: ContentType;
  category: string | null;
  arabicText: string | null;
  translation: string | null;
  sourceRef: string | null;
  gradeNote: string | null;
  body: Record<string, unknown> | null;
  mediaId: string | null;
  status: ContentStatus;
  originItemId: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  updatedAt: string;
  submission?: { id: string; status: ContentStatus; reviewNote: string | null; reviewedAt: string | null } | null;
}

export interface Slide {
  id: string;
  contentItemId: string;
  durationSec: number;
  sortOrder: number;
  enabled: boolean;
  daysMask: number;
  timeFrom: string | null;
  timeTo: string | null;
  content: ContentItem | null;
}

export interface MediaItem {
  id: string;
  kind: "image" | "audio";
  mime: string;
  bytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  originalName: string | null;
  global: boolean;
  createdAt: string;
}

export const mediaUrl = (id: string) => `/api/admin/media/${id}/file`;

/** Unggah satu berkas (multipart). */
export async function upload<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": csrfToken }, body: form });
  } catch {
    throw new ApiError(0, "network", "Tidak bisa menghubungi server. Periksa koneksi internet lalu coba lagi.");
  }
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string; fields?: Record<string, string> } } | null;
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? "unknown", e?.message ?? `Unggahan gagal (${res.status}).`, e?.fields ?? {});
  }
  return data as T;
}

// ---- Tahap 3: pemantauan, log, pengumuman ---------------------------------------------

export interface DashboardDevice extends Omit<Device, "commands"> {
  mosque: { id: string; name: string };
}
export interface DashboardSummary {
  total: number;
  online: number;
  offline: number;
  background: number;
  clockDrift: number;
}

export type DeviceEventType =
  | "paired"
  | "online"
  | "offline"
  | "clock_drift"
  | "error"
  | "updated"
  | "unpaired"
  | "app_foreground"
  | "app_background"
  | "command";
export interface DeviceEvent {
  id: number;
  type: DeviceEventType;
  detail: Record<string, unknown> | null;
  at: string;
}

export interface ActivityItem {
  id: number;
  at: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  diff: unknown;
  user: { id: string; name: string | null; email: string | null } | null;
  mosque: { id: string; name: string | null } | null;
  ip?: string | null;
}

export interface Page<T> {
  items: T[];
  nextBefore: number | null;
}

export interface Announcement {
  id: string;
  text: string;
  deviceId: string | null;
  deviceName: string | null;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  active: boolean;
}

export interface OverviewIssue {
  code: string;
  level: "error" | "warn" | "info";
  message: string;
  action?: "connect_tv" | "enable_content" | "open_schedule" | "open_hadith" | "open_content" | "open_display" | "open_library" | "open_tv" | "open_app";
  deviceId?: string;
}
export interface Overview {
  role: MosqueRole;
  configVersion: number;
  layout: "BAR_BAWAH" | "GALERI";
  tvs: { total: number; online: number; pendingApply: number; failing: number };
  showing: {
    runningTexts: number;
    announcements: number;
    slides: number;
    slidesVisible: number;
    content: {
      enabled: boolean;
      panel: boolean;
      fullscreen: { enabled: boolean; everyMinutes: number; showSeconds: number };
      slideSeconds: number;
      items: number;
      hadiths: number;
      byCategory: Record<string, number>;
    };
    weather: boolean;
  };
  checklist: { scheduleChecked: boolean; tvConnected: boolean; runningText: boolean; slides: boolean };
  issues: OverviewIssue[];
}
