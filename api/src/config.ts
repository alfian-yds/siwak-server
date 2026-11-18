import { z } from "zod";

const secret = z
  .string()
  .min(1, "wajib diisi")
  .refine((v) => Buffer.from(v, "base64").length >= 32, "minimal 32 byte (base64)");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SIWAK_PUBLIC_URL: z.string().url(),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().startsWith("mysql://", "harus diawali mysql://"),
  MEDIA_DIR: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1, "wajib diisi"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "wajib diisi"),
  OPENWEATHER_API_KEY: z.string().min(1, "wajib diisi"),
  SESSION_SECRET: secret,
  PIN_ENCRYPTION_KEY: secret,
  SUPERADMIN_EMAIL: z.string().email(),
  GITHUB_REPO: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "format pemilik/repo"),
});

export type Config = z.infer<typeof schema>;

/**
 * Membaca konfigurasi dari variabel lingkungan. Server menolak berjalan bila ada isian
 * yang kosong atau salah (TRD §14), dan pesan galatnya menyebut nama variabelnya.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Konfigurasi .env tidak lengkap atau salah:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
