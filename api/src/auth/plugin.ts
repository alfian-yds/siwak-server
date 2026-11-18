import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { memberships, mosques, users } from "../db/schema.js";
import { deniedPage, loginPage, notRegisteredPage } from "../pages.js";
import { audit } from "../services/audit.js";
import type { IdentityProvider } from "./identity.js";
import { type ActiveSession, SESSION_COOKIE, SESSION_DAYS, createSession, deleteSession, findSession } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Sesi pengurus yang sedang masuk, atau null. Diisi di hook onRequest. */
    auth: ActiveSession | null;
  }
}

const OAUTH_COOKIE = "siwak_oauth";
const OAUTH_MAX_AGE_SEC = 10 * 60;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

interface OAuthCookie {
  s: string; // state
  n: string; // nonce
  v: string; // PKCE code verifier
}

function sameToken(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export interface AuthPluginOptions {
  config: Config;
  db: Db;
  identity: IdentityProvider;
}

export async function authPlugin(app: FastifyInstance, { config, db, identity }: AuthPluginOptions): Promise<void> {
  const secure = config.SIWAK_PUBLIC_URL.startsWith("https://");
  const redirectUri = new URL("/auth/google/callback", config.SIWAK_PUBLIC_URL).href;
  const sessionCookieOptions = {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };

  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (req) => {
    const sid = req.cookies[SESSION_COOKIE];
    req.auth = sid ? await findSession(db, sid) : null;
  });

  // ---- Penjaga untuk rute yang butuh login ---------------------------------------

  /** Untuk JSON API: 401 bila belum masuk, 403 bila token CSRF salah pada permintaan yang mengubah data. */
  const requireApiAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      return reply.code(401).send({ error: { code: "unauthenticated", message: "Silakan masuk terlebih dahulu." } });
    }
    if (!SAFE_METHODS.has(req.method) && !csrfOk(req)) {
      return reply.code(403).send({ error: { code: "csrf", message: "Token keamanan tidak cocok. Muat ulang halaman." } });
    }
  };

  /** Untuk halaman HTML: alihkan ke halaman masuk bila belum masuk. */
  const requirePageAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return reply.redirect("/admin/login");
  };

  function csrfOk(req: FastifyRequest): boolean {
    if (!req.auth) return false;
    const header = req.headers["x-csrf-token"];
    const fromBody =
      req.body && typeof req.body === "object" && "_csrf" in req.body ? (req.body as { _csrf?: unknown })._csrf : undefined;
    const token = typeof header === "string" ? header : typeof fromBody === "string" ? fromBody : "";
    return token.length > 0 && sameToken(token, req.auth.csrfToken);
  }

  app.decorate("requireApiAuth", requireApiAuth);
  app.decorate("requirePageAuth", requirePageAuth);

  /** Untuk rute khusus super admin: setelah requireApiAuth, tolak bila bukan super admin. */
  const requireSuperAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    await requireApiAuth(req, reply);
    if (reply.sent) return;
    if (!req.auth?.user.isSuperAdmin) {
      return reply.code(403).send({ error: { code: "forbidden", message: "Hanya super admin yang bisa melakukan ini." } });
    }
  };
  app.decorate("requireSuperAdmin", requireSuperAdmin);

  // ---- Halaman masuk & alur Google ----------------------------------------------

  app.get<{ Querystring: { pesan?: string } }>("/admin/login", async (req, reply) => {
    if (req.auth) return reply.redirect("/admin");
    return reply.type("text/html; charset=utf-8").send(loginPage(req.query.pesan));
  });

  const authRateLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };

  app.get("/auth/google", { config: authRateLimit }, async (req, reply) => {
    let start;
    try {
      start = await identity.start(redirectUri);
    } catch (err) {
      req.log.error({ err }, "gagal memulai login Google");
      return reply.redirect("/admin/login?pesan=gagal");
    }
    const value: OAuthCookie = { s: start.state, n: start.nonce, v: start.codeVerifier };
    reply.setCookie(OAUTH_COOKIE, JSON.stringify(value), {
      path: "/auth",
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: OAUTH_MAX_AGE_SEC,
      signed: true,
    });
    return reply.redirect(start.url);
  });

  app.get<{ Querystring: { state?: string; code?: string; error?: string } }>(
    "/auth/google/callback",
    { config: authRateLimit },
    async (req, reply) => {
      const raw = req.cookies[OAUTH_COOKIE];
      reply.clearCookie(OAUTH_COOKIE, { path: "/auth" });

      if (req.query.error) return reply.redirect("/admin/login?pesan=batal");

      const unsigned = raw ? req.unsignCookie(raw) : null;
      let checks: OAuthCookie | null = null;
      if (unsigned?.valid && unsigned.value) {
        try {
          checks = JSON.parse(unsigned.value) as OAuthCookie;
        } catch {
          checks = null;
        }
      }
      // state harus sama dengan yang disimpan saat memulai (cegah CSRF login)
      if (!checks || !req.query.state || !sameToken(req.query.state, checks.s)) {
        return reply.redirect("/admin/login?pesan=gagal");
      }

      let claims;
      try {
        const callbackUrl = new URL(req.url, config.SIWAK_PUBLIC_URL);
        claims = await identity.finish(callbackUrl, { state: checks.s, nonce: checks.n, codeVerifier: checks.v });
      } catch (err) {
        req.log.warn({ err }, "penukaran kode Google gagal");
        return reply.redirect("/admin/login?pesan=gagal");
      }

      const email = claims.email.trim().toLowerCase();
      if (!email || !claims.emailVerified) {
        return reply
          .code(403)
          .type("text/html; charset=utf-8")
          .send(deniedPage("Email akun Google ini belum terverifikasi oleh Google."));
      }

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || user.status !== "active") {
        req.log.info({ email }, "login ditolak: email tidak terdaftar/aktif");
        return reply.code(403).type("text/html; charset=utf-8").send(notRegisteredPage(email));
      }
      if (user.googleSub && user.googleSub !== claims.sub) {
        req.log.warn({ userId: user.id }, "login ditolak: akun Google berbeda untuk email yang sama");
        return reply
          .code(403)
          .type("text/html; charset=utf-8")
          .send(deniedPage("Email ini sudah tertaut ke akun Google lain. Hubungi super admin."));
      }

      await db
        .update(users)
        .set({
          googleSub: claims.sub,
          name: claims.name?.slice(0, 120) ?? user.name,
          avatarUrl: claims.picture?.slice(0, 500) ?? user.avatarUrl,
          lastLoginAt: new Date(),
        })
        .where(eq(users.id, user.id));

      const session = await createSession(db, user.id, { userAgent: req.headers["user-agent"], ip: req.ip });
      await audit(db, { userId: user.id, action: "auth.login", ip: req.ip });
      reply.setCookie(SESSION_COOKIE, session.id, sessionCookieOptions);
      return reply.redirect("/admin");
    },
  );

  app.post("/auth/logout", async (req, reply) => {
    if (req.auth && csrfOk(req)) {
      await deleteSession(db, req.auth.id);
      await audit(db, { userId: req.auth.user.id, action: "auth.logout", ip: req.ip });
    } else if (req.auth) {
      return reply.code(403).type("text/html; charset=utf-8").send(deniedPage("Token keamanan tidak cocok. Muat ulang halaman."));
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.redirect("/admin/login?pesan=keluar");
  });

  // ---- Identitas pengguna -------------------------------------------------------------

  app.get("/api/admin/me", { preHandler: requireApiAuth }, async (req) => {
    const { user, csrfToken } = req.auth!;
    const roles = await db
      .select({ mosqueId: mosques.id, mosqueName: mosques.name, role: memberships.role })
      .from(memberships)
      .innerJoin(mosques, eq(mosques.id, memberships.mosqueId))
      .where(eq(memberships.userId, user.id));
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isSuperAdmin: user.isSuperAdmin,
      },
      memberships: roles,
      csrfToken,
    };
  });
}

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler untuk rute /api/admin/*: wajib masuk + CSRF untuk permintaan yang mengubah data. */
    requireApiAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    /** preHandler untuk halaman HTML admin: alihkan ke /admin/login bila belum masuk. */
    requirePageAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    /** preHandler untuk rute khusus super admin. */
    requireSuperAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
}
