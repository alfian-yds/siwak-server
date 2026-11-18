import { loadConfig } from "../src/config.js";

const secret = Buffer.alloc(32, 7).toString("base64");

export const testEnv = {
  NODE_ENV: "test",
  SIWAK_PUBLIC_URL: "http://localhost:8080",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "mysql://siwak:x@127.0.0.1:3306/siwak_test",
  MEDIA_DIR: "./media",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  OPENWEATHER_API_KEY: "test-key",
  SESSION_SECRET: secret,
  PIN_ENCRYPTION_KEY: secret,
  SUPERADMIN_EMAIL: "admin@example.com",
  GITHUB_REPO: "alfian-yds/siwak",
};

export const testConfig = () => loadConfig(testEnv);

/** Mengambil nilai cookie dari header set-cookie hasil app.inject. */
export function cookieFrom(setCookie: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of list) {
    const [pair] = c.split(";");
    const [k, ...v] = (pair ?? "").split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}
