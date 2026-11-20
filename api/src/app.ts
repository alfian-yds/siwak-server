import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { type IdentityProvider, createGoogleProvider } from "./auth/identity.js";
import { adminWebRoutes } from "./admin-web.js";
import { authPlugin } from "./auth/plugin.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { registerErrorHandler } from "./http.js";
import { adminAnnouncementRoutes } from "./routes/admin-announcements.js";
import { adminContentRoutes } from "./routes/admin-content.js";
import { adminDeviceRoutes } from "./routes/admin-devices.js";
import { adminMediaRoutes } from "./routes/admin-media.js";
import { adminMonitorRoutes } from "./routes/admin-monitor.js";
import { adminOverviewRoutes } from "./routes/admin-overview.js";
import { adminMosqueRoutes } from "./routes/admin-mosques.js";
import { adminRunningTextRoutes } from "./routes/admin-running-texts.js";
import { adminSettingsRoutes } from "./routes/admin-settings.js";
import { adminSlideRoutes } from "./routes/admin-slides.js";
import { adminUserRoutes } from "./routes/admin-users.js";
import { deviceApiRoutes } from "./routes/device-api.js";
import { publicDemoRoutes } from "./routes/public-demo.js";
import { siteRoutes } from "./site.js";
import { type WeatherService, createWeatherService } from "./services/weather.js";

export interface AppDeps {
  config: Config;
  /** Kosong saat pengujian yang tidak membutuhkan basis data. */
  db?: Db;
  /** Penyedia login; bawaan Google. Pengujian memakai penyedia tiruan. */
  identity?: IdentityProvider;
  /** Folder hasil build admin web; bawaan admin-web/dist. */
  adminWebDir?: string;
  /** Layanan cuaca; pengujian memakai versi tanpa jaringan. */
  weather?: WeatherService;
}

export async function buildApp({ config, db, identity, adminWebDir, weather }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === "test" ? false : { level: config.NODE_ENV === "production" ? "info" : "debug" },
    trustProxy: true, // di belakang Nginx
  });

  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(formbody);
  // Unggahan: satu berkas per permintaan, batas audio 10 MB (gambar 5 MB dicek di layanan media).
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 } });
  await app.register(rateLimit, { global: false });
  // Header keamanan (TRD §14). Admin web hanya memuat skrip dari server sendiri; foto profil Google
  // diizinkan sebagai gambar. Kamera (Scan QR) hanya untuk halaman ini sendiri.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://*.googleusercontent.com"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        // Demo layar TV (halaman sendiri) dan video promosi; YouTube baru dimuat setelah tombol putar ditekan.
        frameSrc: ["'self'", "https://www.youtube-nocookie.com"],
        frameAncestors: ["'none'"],
        formAction: ["'self'", "https://accounts.google.com"],
        upgradeInsecureRequests: config.SIWAK_PUBLIC_URL.startsWith("https://") ? [] : null,
      },
    },
    // HSTS dipasang di Nginx (lihat deploy/nginx.conf.example) agar tidak bentrok saat uji lokal tanpa HTTPS.
    strictTransportSecurity: false,
    crossOriginEmbedderPolicy: false,
  });
  app.addHook("onSend", async (_req, reply) => {
    reply.header("Permissions-Policy", "camera=(self), microphone=(), geolocation=(self)");
  });
  registerErrorHandler(app);

  app.get("/healthz", async (_req, reply) => {
    if (!db) return { status: "ok", db: "skipped" };
    try {
      await db.execute(sql`SELECT 1`);
      return { status: "ok", db: "ok" };
    } catch (err) {
      app.log.error({ err }, "basis data tidak terjangkau");
      return reply.code(503).send({ status: "error", db: "unreachable" });
    }
  });

  await siteRoutes(app, config);

  if (db) {
    // Dipanggil langsung (bukan app.register) agar hook sesi berlaku untuk semua rute.
    await authPlugin(app, {
      config,
      db,
      identity: identity ?? createGoogleProvider(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET),
    });
    await adminUserRoutes(app, { db });
    await adminMosqueRoutes(app, { db });
    await adminSettingsRoutes(app, { db });
    await adminDeviceRoutes(app, { db, config });
    await adminRunningTextRoutes(app, { db });
    await adminContentRoutes(app, { db });
    await adminSlideRoutes(app, { db });
    await adminMediaRoutes(app, { db, config });
    await adminAnnouncementRoutes(app, { db });
    await adminMonitorRoutes(app, { db });
    await adminOverviewRoutes(app, { db });
    await publicDemoRoutes(app, { db });
    await deviceApiRoutes(app, { db, config, weather: weather ?? createWeatherService(db, config.OPENWEATHER_API_KEY, app.log) });
    await adminWebRoutes(app, adminWebDir);
  }

  return app;
}
