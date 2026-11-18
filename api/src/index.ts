import { buildApp } from "./app.js";
import { bootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { startJobs } from "./jobs.js";
import { createWeatherService } from "./services/weather.js";

async function main() {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  await bootstrap(db, config);
  const app = await buildApp({ config, db });
  const weather = createWeatherService(db, config.OPENWEATHER_API_KEY, app.log);
  const stopJobs = startJobs(db, weather, app.log, config.MEDIA_DIR);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "menghentikan server");
    stopJobs();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
