import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { config } from "./config.js";
import { verifyBearer, type AuthenticatedRequest } from "./auth.js";
import { transport, transportReady } from "./transport.js";

const app = express();

const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY ?? "0", 10);
if (trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

app.disable("x-powered-by");
app.use(helmet());

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);
console.log(
  `[startup] Rate limiting enabled: ${config.rateLimitMax} requests per ${Math.round(config.rateLimitWindowMs / 1000)}s window`
);

if (config.corsOrigins.length > 0) {
  const corsOptions: CorsOptions = config.corsOrigins.includes("*")
    ? { origin: true, credentials: true }
    : { origin: config.corsOrigins, credentials: true };
  app.use(cors(corsOptions));
  console.log(`[startup] CORS enabled for: ${config.corsOrigins.join(", ")}`);
} else {
  console.log("[startup] CORS disabled (no origins configured).");
}

app.use(morgan(config.isProd ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, mcp: "/mcp" });
});

app.post("/mcp", verifyBearer, async (req: AuthenticatedRequest, res, next) => {
  try {
    await transportReady;
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    next(error);
  }
});

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  const error = err instanceof Error ? err : new Error("Unknown error");
  console.error("[http] Unhandled error", { message: error.message, stack: error.stack });
  res.status(500).json({ error: "Internal Server Error" });
});

const httpServer = app.listen(config.port, () => {
  console.log(`MCP SAP Server listening on http://localhost:${config.port}/mcp`);
});

process.on("unhandledRejection", reason => {
  console.error("[process] Unhandled promise rejection", { reason });
});

const shutdown = (signal: string, exitCode: number): void => {
  console.log(`[process] Received ${signal}, shutting down`);
  transport.close();
  httpServer.close(() => process.exit(exitCode));
};

process.on("uncaughtException", err => {
  console.error("[process] Uncaught exception", err);
  shutdown("uncaughtException", 1);
});

process.on("SIGTERM", () => shutdown("SIGTERM", 0));
process.on("SIGINT", () => shutdown("SIGINT", 0));
