import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtHeader, type JwtPayload, type SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { config } from "./config.js";

const ISSUERS = [
  `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
  // Add v1 issuer if required:
  // `https://sts.windows.net/${config.tenantId}/`,
];

const JWKS_URI_V2 = `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`;
const JWKS_URI_V1 = `https://login.microsoftonline.com/${config.tenantId}/discovery/keys`;

const jwksV2 = jwksClient({ jwksUri: JWKS_URI_V2 });
const jwksV1 = jwksClient({ jwksUri: JWKS_URI_V1 });

export type VerifiedClaims = JwtPayload & {
  roles?: string[];
  scp?: string;
};

export type AuthenticatedRequest = Request & { user?: VerifiedClaims };

function getKey(header: JwtHeader, cb: SigningKeyCallback): void {
  jwksV2.getSigningKey(header.kid, (err, key: any) => {
    if (!err && key) return cb(null, key.getPublicKey());
    jwksV1.getSigningKey(header.kid, (err2, key2: any) => {
      if (err2) return cb(err2);
      cb(null, key2.getPublicKey());
    });
  });
}

function authorize(claims: VerifiedClaims): boolean {
  const roles: string[] = Array.isArray(claims?.roles) ? claims.roles : [];
  const scopes: string[] = typeof claims?.scp === "string" ? claims.scp.split(/\s+/) : [];

  const roleOk = roles.some(r => config.allowedRoles.has(String(r).toLowerCase()));
  const scopeOk = scopes.some(s => config.allowedScopes.has(String(s).toLowerCase()));

  return roleOk || scopeOk;
}

export function verifyBearer(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.substring(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  jwt.verify(
    token,
    getKey,
    {
      algorithms: ["RS256"],
      issuer: ISSUERS,
      audience: config.audience,
    } as any,
    (err, decoded) => {
      if (err) {
        console.error("[auth] jwt.verify failed", {
          message: err?.message,
          expectedIssuers: ISSUERS,
          expectedAudience: config.audience,
        });
        res.status(401).json({ error: "Invalid token", detail: err.message });
        return;
      }
      const claims = (typeof decoded === "object" ? decoded : {}) as VerifiedClaims;
      if (!authorize(claims)) {
        const scopeList = typeof claims?.scp === "string" ? claims.scp.split(/\s+/).filter(Boolean) : [];
        const roleList = Array.isArray(claims?.roles) ? claims.roles : [];
        console.warn("[auth] authorization failed", {
          roles: roleList,
          scopes: scopeList,
          required: {
            anyRoleIn: Array.from(config.allowedRoles),
            anyScopeIn: Array.from(config.allowedScopes),
          },
        });
        res.status(403).json({
          error: "Insufficient permissions",
          detail: {
            roles: roleList,
            scopes: scopeList,
            expected: {
              anyRoleIn: Array.from(config.allowedRoles),
              anyScopeIn: Array.from(config.allowedScopes),
            },
          },
        });
        return;
      }
      (req as AuthenticatedRequest).user = claims;
      next();
    }
  );
}
