import { z } from "zod";

const EnvSchema = z.object({
  TENANT_ID: z.string().min(1),
  AUDIENCE: z.union([z.string().uuid(), z.string().startsWith("api://"), z.string().url()]),
  PORT: z.string().optional(),
  ALLOWED_SCOPES: z.string().optional(),
  ALLOWED_ROLES: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),
});

const env = EnvSchema.parse(process.env);

const NODE_ENV = process.env.NODE_ENV ?? "development";
const IS_PROD = NODE_ENV === "production";

const defaultScopes = ["Mcp.Access", "access_as_mcp"];
const defaultRoles = ["McpServer.Invoke", "McpServer.Read", "McpServer.Write"];

const toConfiguredSet = (raw: string | undefined, fallback: string[]): Set<string> =>
  new Set(
    (raw ? raw.split(/[,\s]+/) : fallback)
      .filter(Boolean)
      .map(item => item.toLowerCase())
  );

const allowedScopes = toConfiguredSet(env.ALLOWED_SCOPES, defaultScopes);
const allowedRoles = toConfiguredSet(env.ALLOWED_ROLES, defaultRoles);

const port = Number.parseInt(env.PORT ?? "3000", 10);
const rateLimitWindowMs = env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000;
const rateLimitMax = env.RATE_LIMIT_MAX ?? 100;

const configuredOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(/[,\s]+/).map(origin => origin.trim()).filter(Boolean)
  : undefined;

const corsOrigins =
  configuredOrigins ?? (IS_PROD ? [] : ["http://localhost:3000", "http://127.0.0.1:3000"]);

export const config = {
  nodeEnv: NODE_ENV,
  isProd: IS_PROD,
  tenantId: env.TENANT_ID,
  audience: String(env.AUDIENCE),
  port,
  allowedScopes,
  allowedRoles,
  rateLimitWindowMs,
  rateLimitMax,
  corsOrigins,
};

export type Config = typeof config;
