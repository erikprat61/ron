import { createRemoteJWKSet, decodeJwt, errors, jwtVerify, type JWTPayload } from "jose";
import type { RefreshTriggerConfig } from "@ron/contract";

const googleOidcJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface RefreshTriggerAuthorizationSuccess {
  ok: true;
  principal: string;
  method: "auth-token" | "oidc";
}

export interface RefreshTriggerAuthorizationFailure {
  ok: false;
  status: 401 | 503;
  detail: string;
}

export type RefreshTriggerAuthorization = RefreshTriggerAuthorizationSuccess | RefreshTriggerAuthorizationFailure;

export type RefreshOidcVerifier = (
  idToken: string,
  audience: string,
  allowedInvokers: string[]
) => Promise<{ principal: string }>;

export async function authorizeRefreshTriggerRequest(
  request: Request,
  config: RefreshTriggerConfig,
  verifyOidcToken: RefreshOidcVerifier = verifyGoogleOidcToken
): Promise<RefreshTriggerAuthorization> {
  const hasTokenAuth = Boolean(config.authToken);
  const hasOidcAuth = config.allowedInvokerEmails.length > 0;

  if (!hasTokenAuth && !hasOidcAuth) {
    return {
      ok: false,
      status: 503,
      detail: "Refresh trigger authentication is not configured."
    };
  }

  const authorizationHeader = request.headers.get("authorization");
  const bearerToken = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice(7).trim() : undefined;

  if (!bearerToken) {
    return {
      ok: false,
      status: 401,
      detail: "Missing bearer token."
    };
  }

  if (config.authToken && bearerToken === config.authToken) {
    return {
      ok: true,
      principal: "shared-token",
      method: "auth-token"
    };
  }

  if (!hasOidcAuth) {
    return {
      ok: false,
      status: 401,
      detail: "Refresh trigger credentials were rejected."
    };
  }

  try {
    const verification = await verifyOidcToken(bearerToken, request.url, config.allowedInvokerEmails);
    return {
      ok: true,
      principal: verification.principal,
      method: "oidc"
    };
  } catch (error) {
    if (error instanceof errors.JOSEError) {
      return {
        ok: false,
        status: 401,
        detail: "Refresh trigger credentials were rejected."
      };
    }

    throw error;
  }
}

export async function verifyGoogleOidcToken(
  idToken: string,
  audience: string,
  allowedInvokers: string[]
): Promise<{ principal: string }> {
  let payload: JWTPayload | undefined;
  let lastJoseError: errors.JOSEError | undefined;

  for (const acceptedAudience of getAllowedGoogleOidcAudiences(audience)) {
    try {
      const verification = await jwtVerify(idToken, googleOidcJwks, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: acceptedAudience
      });
      payload = verification.payload;
      break;
    } catch (error) {
      if (!(error instanceof errors.JOSEError)) {
        throw error;
      }

      lastJoseError = error;
    }
  }

  if (!payload) {
    logRefreshOidcFailure("audience-or-signature", idToken, audience, allowedInvokers, lastJoseError);
    throw lastJoseError ?? new errors.JWTInvalid("Refresh trigger token verification failed.");
  }

  const principal = getAllowedGooglePrincipal(payload, allowedInvokers);

  if (!principal) {
    logRefreshOidcFailure("principal-not-allowed", idToken, audience, allowedInvokers, undefined, payload);
    throw new errors.JWTInvalid("OIDC principal is not allowed to invoke the refresh trigger.");
  }

  return { principal };
}

export function getAllowedGoogleOidcAudiences(audience: string): string[] {
  const normalized = audience.trim();
  const audiences = new Set<string>([normalized]);

  try {
    const url = new URL(normalized);
    audiences.add(url.origin);
    audiences.add(`${url.origin}/`);
  } catch {
    // Preserve the explicit configured audience when it is not a URL.
  }

  return [...audiences];
}

export function getAllowedGooglePrincipal(payload: JWTPayload, allowedInvokers: string[]): string | undefined {
  return [payload.email, payload.sub, payload.azp].find(
    (value): value is string => typeof value === "string" && allowedInvokers.includes(value)
  );
}

function logRefreshOidcFailure(
  reason: "audience-or-signature" | "principal-not-allowed",
  idToken: string,
  requestAudience: string,
  allowedInvokers: string[],
  error?: errors.JOSEError,
  payload = safeDecodeJwt(idToken)
) {
  console.warn("Refresh trigger OIDC verification failed", {
    reason,
    requestAudience,
    acceptedAudiences: getAllowedGoogleOidcAudiences(requestAudience),
    allowedInvokers,
    issuer: payload?.iss,
    tokenAudience: payload?.aud,
    subject: payload?.sub,
    authorizedParty: payload?.azp,
    email: payload?.email,
    error: error?.message
  });
}

function safeDecodeJwt(idToken: string): JWTPayload | undefined {
  try {
    return decodeJwt(idToken);
  } catch {
    return undefined;
  }
}
