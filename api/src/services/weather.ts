import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/client.js";
import { devices, mosques, weatherCache } from "../db/schema.js";

/** Cuaca untuk TV (Backend Schema §5.4). */
export interface WeatherPayload {
  cellKey: string;
  fetchedAt: string;
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windKmh: number;
  iconCode: string;
  description: string;
  /** Untuk estimasi UV di TV (logika v1.1): detik epoch UTC. */
  observedAt: number;
  sunrise: number;
  sunset: number;
  cloudsPercent: number;
  visibilityKm: number | null;
}

/** Lokasi dibulatkan ke 2 desimal (± 1,1 km) agar satu permintaan melayani banyak TV (TRD §8). */
export const cellKeyOf = (lat: number | string, lon: number | string) => `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface WeatherService {
  /** Ambil dan simpan cuaca satu sel. Galat dicatat, tidak dilempar. */
  refreshCell(cellKey: string): Promise<boolean>;
  /** Pekerjaan 30 menit: semua sel yang punya TV aktif dalam 24 jam terakhir. */
  refreshActive(): Promise<number>;
  /** Untuk TV baru: ambil sekarang bila sel belum pernah diambil. */
  ensure(cellKey: string): void;
}

export function createWeatherService(db: Db, apiKey: string, log: FastifyBaseLogger, fetchImpl: FetchLike = fetch): WeatherService {
  const inFlight = new Set<string>();

  async function refreshCell(cellKey: string): Promise<boolean> {
    const [lat, lon] = cellKey.split(",");
    const url =
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=id&appid=` + encodeURIComponent(apiKey);
    try {
      const res = await fetchImpl(url);
      // Jangan pernah mencatat URL: berisi kunci API.
      if (!res.ok) {
        log.warn({ cellKey, status: res.status }, "OpenWeather menolak permintaan");
        return false;
      }
      const j = (await res.json()) as {
        main?: { temp?: number; feels_like?: number; humidity?: number };
        wind?: { speed?: number };
        weather?: { icon?: string; description?: string }[];
        dt?: number;
        sys?: { sunrise?: number; sunset?: number };
        clouds?: { all?: number };
        visibility?: number;
      };
      if (typeof j.main?.temp !== "number") {
        log.warn({ cellKey }, "jawaban OpenWeather tidak lengkap");
        return false;
      }
      const now = new Date();
      const payload: WeatherPayload = {
        cellKey,
        fetchedAt: now.toISOString(),
        temperatureC: Math.round(j.main.temp * 10) / 10,
        feelsLikeC: Math.round((j.main.feels_like ?? j.main.temp) * 10) / 10,
        humidity: Math.round(j.main.humidity ?? 0),
        windKmh: Math.round((j.wind?.speed ?? 0) * 3.6 * 10) / 10,
        iconCode: j.weather?.[0]?.icon ?? "",
        description: j.weather?.[0]?.description ?? "",
        observedAt: j.dt ?? Math.floor(now.getTime() / 1000),
        sunrise: j.sys?.sunrise ?? 0,
        sunset: j.sys?.sunset ?? 0,
        cloudsPercent: Math.round(j.clouds?.all ?? 0),
        visibilityKm: typeof j.visibility === "number" ? Math.round(j.visibility / 100) / 10 : null,
      };
      await db
        .insert(weatherCache)
        .values({ cellKey, payload, fetchedAt: now, lastRequestedAt: now })
        .onDuplicateKeyUpdate({ set: { payload, fetchedAt: now } });
      return true;
    } catch (err) {
      log.warn({ cellKey, err: err instanceof Error ? err.message : String(err) }, "gagal mengambil cuaca");
      return false;
    }
  }

  async function refreshActive(): Promise<number> {
    const rows = await db
      .selectDistinct({ lat: mosques.latitude, lon: mosques.longitude })
      .from(devices)
      .innerJoin(mosques, eq(mosques.id, devices.mosqueId))
      .where(and(isNull(devices.revokedAt), gt(devices.lastSeenAt, new Date(Date.now() - 24 * 3600_000))));
    const cells = [...new Set(rows.map((r) => cellKeyOf(r.lat, r.lon)))];
    let ok = 0;
    for (const c of cells) if (await refreshCell(c)) ok++;
    return ok;
  }

  function ensure(cellKey: string): void {
    if (inFlight.has(cellKey)) return;
    inFlight.add(cellKey);
    void (async () => {
      try {
        const [row] = await db.select({ k: weatherCache.cellKey }).from(weatherCache).where(eq(weatherCache.cellKey, cellKey)).limit(1);
        if (!row) await refreshCell(cellKey);
      } finally {
        inFlight.delete(cellKey);
      }
    })();
  }

  return { refreshCell, refreshActive, ensure };
}
