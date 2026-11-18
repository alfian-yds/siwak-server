import * as oidc from "openid-client";

/** Data identitas yang dipakai SIWAK dari penyedia login. */
export interface IdentityClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface AuthStart {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface AuthChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * Penyedia login. Diabstraksikan agar pengujian bisa memakai penyedia tiruan
 * tanpa menghubungi Google.
 */
export interface IdentityProvider {
  start(redirectUri: string): Promise<AuthStart>;
  finish(callbackUrl: URL, checks: AuthChecks): Promise<IdentityClaims>;
}

/** Login Google: OpenID Connect, Authorization Code + PKCE (TRD §5.1). */
export function createGoogleProvider(clientId: string, clientSecret: string): IdentityProvider {
  let configuration: Promise<oidc.Configuration> | undefined;

  // Discovery dilakukan saat login pertama, bukan saat server mulai, agar server tetap
  // bisa berjalan walau Google sesaat tidak terjangkau. Bila gagal, dicoba lagi berikutnya.
  const getConfiguration = () =>
    (configuration ??= oidc
      .discovery(new URL("https://accounts.google.com"), clientId, clientSecret)
      .catch((err: unknown) => {
        configuration = undefined;
        throw err;
      }));

  return {
    async start(redirectUri) {
      const config = await getConfiguration();
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const url = oidc.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: "openid email profile",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        nonce,
        prompt: "select_account",
      });
      return { url: url.href, state, nonce, codeVerifier };
    },

    async finish(callbackUrl, checks) {
      const config = await getConfiguration();
      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: checks.codeVerifier,
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error("Google tidak mengirim ID token");
      return {
        sub: claims.sub,
        email: typeof claims.email === "string" ? claims.email : "",
        emailVerified: claims.email_verified === true,
        name: typeof claims.name === "string" ? claims.name : undefined,
        picture: typeof claims.picture === "string" ? claims.picture : undefined,
      };
    },
  };
}
