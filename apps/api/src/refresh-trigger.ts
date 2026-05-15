import { createRemoteJWKSet, errors, jwtVerify } from "jose";
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
  const { payload } = await jwtVerify(idToken, googleOidcJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience
  });

  const principal = [payload.email, payload.sub].find(
    (value): value is string => typeof value === "string" && allowedInvokers.includes(value)
  );

  if (!principal) {
    throw new errors.JWTInvalid("OIDC principal is not allowed to invoke the refresh trigger.");
  }

  return { principal };
}
