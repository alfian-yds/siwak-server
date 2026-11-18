/**
 * Ringkasan masjid untuk beranda admin web: apa yang sedang tayang di TV, langkah awal yang belum
 * dikerjakan, dan masalah yang membuat fitur tidak tampil beserta cara memperbaikinya.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMosqueRole } from "../auth/access.js";
import type { Db } from "../db/client.js";
import { activityLogs, contentItems, devices } from "../db/schema.js";
import { parse } from "../http.js";
import { buildBundle } from "../services/bundle.js";
import { loadSettings } from "./admin-settings.js";
import { deviceStatus } from "./admin-devices.js";
import { CLOCK_DRIFT_WARN_SEC } from "./device-api.js";

const mosqueParam = z.object({ id: z.string().uuid("id masjid tidak sah") });

/** Masalah yang ditampilkan di web; `action` menunjuk tombol perbaikan di admin web. */
export interface Issue {
  code: string;
  level: "error" | "warn" | "info";
  message: string;
  action?: "connect_tv" | "enable_content" | "open_schedule" | "open_hadith" | "open_content" | "open_display" | "open_library" | "open_tv" | "open_app";
  /** TV yang dimaksud, untuk aksi per TV (mis. Buka SIWAK di TV). */
  deviceId?: string;
  adminOnly?: boolean;
}

export async function adminOverviewRoutes(app: FastifyInstance, { db }: { db: Db }): Promise<void> {
  app.get("/api/admin/mosques/:id/overview", { preHandler: app.requireApiAuth }, async (req) => {
    const { id } = parse(mosqueParam, req.params);
    const { mosque, role } = await requireMosqueRole(db, req, id, "operator");
    const bundle = await buildBundle(db, id, null);
    // Pengaturan asli (bukan versi TV) agar status sakelar layar konten terbaca apa adanya.
    const { settings: s } = await loadSettings(db, id);
    // Jadwal dianggap sudah diperiksa bila pengaturan pernah disimpan dari admin web (tercatat di log).
    const [checked] = await db
      .select({ id: activityLogs.id })
      .from(activityLogs)
      .where(and(eq(activityLogs.mosqueId, id), eq(activityLogs.action, "settings.update")))
      .limit(1);
    const scheduleChecked = Boolean(checked);
    const tvs = await db.select().from(devices).where(and(eq(devices.mosqueId, id), isNull(devices.revokedAt)));
    const now = Date.now();
    const status = tvs.map((d) => ({ d, st: deviceStatus(d, now) }));
    const connected = status.filter(({ d }) => d.tokenHash !== null);
    const online = connected.filter(({ st }) => st.online);
    const pendingApply = online.filter(({ d }) => d.lastConfigVersion !== mosque.configVersion);
    // Galat koneksi tidak dihitung masalah: TV mencoba lagi sendiri, dan status online/offline sudah menjelaskannya.
    const failing = connected.filter(({ d }) => d.lastError && !isNetworkError(d.lastError));

    const hadiths = bundle.content.filter((c) => c.type === "hadith" && c.translation);
    const byCategory: Record<string, number> = {};
    for (const h of hadiths) byCategory[h.category ?? "lainnya"] = (byCategory[h.category ?? "lainnya"] ?? 0) + 1;
    const contentOn = s.display.content.enabled;
    const panel = contentOn && s.display.layout === "GALERI";
    const interstitial = s.display.mutiaraHadits;
    const fullscreen = contentOn && interstitial.enabled;
    const items = bundle.slides.length + hadiths.length;

    let libraryPending = 0;
    if (role === "super") {
      const [r] = await db
        .select({ n: sql<number>`count(*)` })
        .from(contentItems)
        .where(and(eq(contentItems.scope, "global"), inArray(contentItems.status, ["draft", "submitted"])));
      libraryPending = Number(r?.n ?? 0);
    }

    const issues: Issue[] = [];
    if (connected.length === 0) issues.push({ code: "no_tv", level: "info", message: "Belum ada TV yang terhubung ke masjid ini.", action: "connect_tv", adminOnly: true });
    for (const { d, st } of connected) {
      if (!st.online) issues.push({ code: "tv_offline", level: "error", message: `TV ${d.name} offline. Periksa listrik dan internet di masjid.`, action: "open_tv" });
      else if (st.app.foreground === false)
        issues.push({ code: "tv_background", level: "warn", message: `Di TV ${d.name}, SIWAK sedang tertutup aplikasi lain.`, action: "open_app", deviceId: d.id });
      if (st.online && Math.abs(d.clockDriftSec ?? 0) > CLOCK_DRIFT_WARN_SEC)
        issues.push({ code: "tv_clock", level: "warn", message: `Jam TV ${d.name} selisih ${Math.round(Math.abs(d.clockDriftSec ?? 0) / 60) || 1} menit. Aktifkan waktu otomatis di setelan TV.` });
    }
    for (const { d } of failing) issues.push({ code: "tv_error", level: "error", message: `TV ${d.name} melaporkan masalah: ${d.lastError}`, action: "open_tv" });
    if (!contentOn && bundle.slides.length > 0)
      issues.push({
        code: "content_off",
        level: "info",
        message: `Ada ${bundle.slides.length} slide, tetapi slide & hadits sedang dimatikan sehingga tidak tampil di TV.`,
        action: "enable_content",
        adminOnly: true,
      });
    if (contentOn && !panel && !fullscreen)
      issues.push({
        code: "content_no_mode",
        level: "warn",
        message: "Slide & hadits sudah dinyalakan, tetapi belum dipilih cara tampilnya (di samping jam atau sesekali layar penuh).",
        action: "open_content",
        adminOnly: true,
      });
    if (contentOn && items === 0)
      issues.push({
        code: "content_empty",
        level: "warn",
        message: "Slide & hadits sudah dinyalakan, tetapi belum ada slide atau hadits yang bisa tayang.",
        action: "open_content",
        adminOnly: true,
      });
    if (!scheduleChecked)
      issues.push({
        code: "schedule_unchecked",
        level: "info",
        message: "Jadwal belum pernah diperiksa. Cocokkan dengan jadwal Kemenag setempat dan atur koreksi menit bila perlu.",
        action: "open_schedule",
        adminOnly: true,
      });
    if (libraryPending > 0)
      issues.push({ code: "library_pending", level: "info", message: `${libraryPending} hadits di kumpulan hadits SIWAK menunggu diperiksa dan belum tayang di masjid mana pun.`, action: "open_library" });

    const visible = role === "operator" ? issues.filter((i) => !i.adminOnly) : issues;
    return {
      role,
      configVersion: mosque.configVersion,
      layout: s.display.layout,
      tvs: { total: connected.length, online: online.length, pendingApply: pendingApply.length, failing: failing.length },
      showing: {
        runningTexts: bundle.runningTexts.length,
        announcements: bundle.announcements.length,
        slides: bundle.slides.length,
        slidesVisible: contentOn && (panel || fullscreen) ? bundle.slides.length : 0,
        content: {
          enabled: contentOn,
          panel,
          fullscreen: { enabled: fullscreen, everyMinutes: interstitial.everyMinutes, showSeconds: interstitial.showSeconds },
          slideSeconds: s.display.content.slideSeconds,
          items,
          hadiths: hadiths.length,
          byCategory,
        },
        weather: s.display.showWeather,
      },
      checklist: {
        scheduleChecked,
        tvConnected: connected.length > 0,
        runningText: bundle.runningTexts.length > 0,
        slides: bundle.slides.length > 0,
      },
      issues: visible,
    };
  });
}

/** Galat jaringan dari TV (tidak bisa menghubungi server) yang tidak perlu ditampilkan sebagai masalah. */
export function isNetworkError(message: string | null | undefined): boolean {
  return /failed to connect|timeout|timed out|unable to resolve|unknownhost|connection (refused|reset)|network|socket/i.test(message ?? "");
}
