import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";

/** Galat yang sengaja dikirim ke klien. Bentuk respons: { error: { code, message, fields? } } (TRD §12). */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan.`);
export const forbidden = (message = "Anda tidak punya akses untuk tindakan ini.") => new HttpError(403, "forbidden", message);

/** Memvalidasi data dengan Zod; bila gagal melempar 400 berisi pesan per isian. */
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  throw new HttpError(400, "validation", "Ada isian yang belum benar.", fields);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | HttpError, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, fields: err.fields } });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: { code: err.code ?? "bad_request", message: err.message } });
    }
    req.log.error({ err }, "galat tak terduga");
    return reply.code(500).send({ error: { code: "internal", message: "Terjadi kesalahan di server. Coba lagi sebentar." } });
  });
}
