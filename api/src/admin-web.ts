import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { adminHomePage } from "./pages.js";

/** Lokasi hasil build admin web (admin-web/dist), sama dari api/src maupun api/dist. */
export const defaultAdminWebDir = fileURLToPath(new URL("../../admin-web/dist/", import.meta.url));

/**
 * Menyajikan admin web (SPA React) di /admin/*.
 * - Berkas statis (/admin/assets/*, favicon) terbuka tanpa login; isinya kode publik.
 * - Halaman lain mewajibkan sesi dan mengembalikan index.html agar routing berjalan di browser.
 * - /admin/login tetap halaman server (rute eksak menang atas wildcard).
 */
export async function adminWebRoutes(app: FastifyInstance, dir: string = defaultAdminWebDir): Promise<void> {
  const indexFile = join(dir, "index.html");

  if (!existsSync(indexFile)) {
    app.log.warn(`Admin web belum dibangun (${indexFile} tidak ada). Jalankan "npm run build -w admin-web".`);
    const fallback = async (req: FastifyRequest, reply: FastifyReply) => {
      const auth = req.auth!;
      return reply.type("text/html; charset=utf-8").send(adminHomePage(auth.user, auth.csrfToken));
    };
    app.get("/admin", { preHandler: app.requirePageAuth }, fallback);
    app.get("/admin/*", { preHandler: app.requirePageAuth }, fallback);
    return;
  }

  // index.html dibaca ulang bila berkasnya berubah (build baru), agar tidak menyajikan versi lama yang
  // merujuk aset yang sudah tidak ada.
  let indexHtml = readFileSync(indexFile, "utf8");
  let indexMtime = statSync(indexFile).mtimeMs;
  const currentIndex = () => {
    try {
      const m = statSync(indexFile).mtimeMs;
      if (m !== indexMtime) {
        indexHtml = readFileSync(indexFile, "utf8");
        indexMtime = m;
      }
    } catch {
      // build sedang berjalan: pakai versi terakhir yang terbaca
    }
    return indexHtml;
  };

  await app.register(fastifyStatic, {
    root: dir,
    prefix: "/admin/",
    wildcard: false, // daftarkan rute per berkas saat mulai, sisanya ditangani fallback SPA di bawah
    index: false,
    allowedPath: (path) => path !== "/index.html",
    setHeaders(reply, path) {
      // Nama berkas di assets/ memuat hash isi, jadi aman disimpan lama di cache browser.
      reply.header("Cache-Control", /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    },
  });

  const spa = async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.type("text/html; charset=utf-8").header("Cache-Control", "no-store").send(currentIndex());

  app.get("/admin", { preHandler: app.requirePageAuth }, spa);
  app.get<{ Params: { "*": string } }>("/admin/*", { preHandler: app.requirePageAuth }, async (req, reply) => {
    // Aset yang tidak ada harus 404, bukan halaman HTML (agar galat build terlihat jelas).
    if (req.params["*"].startsWith("assets/")) {
      // Aset dari build yang lebih baru dari proses ini (belum terdaftar saat mulai) tetap disajikan.
      const rel = req.params["*"];
      if (/^assets\/[\w.-]+$/.test(rel) && existsSync(join(dir, rel))) {
        return reply.header("Cache-Control", "public, max-age=31536000, immutable").sendFile(rel);
      }
      return reply.code(404).send({ error: { code: "not_found", message: "Berkas tidak ditemukan." } });
    }
    return spa(req, reply);
  });
}
