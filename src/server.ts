import "dotenv/config";
import express from "express";
import cors from "cors";
import { z, type ZodRawShape } from "zod";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/* ---------- ENV ---------- */
const EnvSchema = z.object({
  TENANT_ID: z.string().min(1), // GUID empfohlen
  // Erlaube GUID, api://..., oder URL
  AUDIENCE: z.union([
    z.string().uuid(),
    z.string().startsWith("api://"),
    z.string().url()
  ]),
  AUDIENCE_ALT: z
    .union([z.string().uuid(), z.string().startsWith("api://"), z.string().url()])
    .optional(),
  PORT: z.string().optional(),
});
const env = EnvSchema.parse(process.env);

/* ---------- OAuth/JWT Settings (Entra) ---------- */
const TENANT_ID = env.TENANT_ID;
const ISSUERS = [
  // v2 (bevorzugt)
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  // optional v1 fallback: auskommentieren, wenn du strikt v2 willst
  // `https://sts.windows.net/${TENANT_ID}/`,
];

// JWKS: v2 keys
const JWKS_URI_V2 = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;
const jwksV2 = jwksClient({ jwksUri: JWKS_URI_V2 });

// Falls du auch v1 zulassen willst, aktiviere die 2 Zeilen:
const JWKS_URI_V1 = `https://login.microsoftonline.com/${TENANT_ID}/discovery/keys`;
const jwksV1 = jwksClient({ jwksUri: JWKS_URI_V1 });

function getKey(header: any, cb: any) {
  jwksV2.getSigningKey(header.kid, (err, key: any) => {
    if (!err && key) return cb(null, key.getPublicKey());
    // Fallback auf v1-JWKS (nur wenn oben aktiviert)
    jwksV1.getSigningKey(header.kid, (err2, key2: any) => {
      if (err2) return cb(err2);
      cb(null, key2.getPublicKey());
    });
  });
}

// Audience: GUID und api://… akzeptieren
const audiences = Array.from(
  new Set(
    [env.AUDIENCE, env.AUDIENCE_ALT]
      .filter(Boolean)
      .map(String)
  )
);

/* ---------- Rollen/Scopes ---------- */
function authorize(decoded: any) {
  const roles: string[] = Array.isArray(decoded?.roles) ? decoded.roles : [];
  const scopes: string[] = typeof decoded?.scp === "string" ? decoded.scp.split(" ") : [];

  // Deine finalen Werte:
  const allowedRoles = new Set(["McpServer.Invoke", "McpServer.Read", "McpServer.Write"]);
  const allowedScopes = new Set(["access_as_mcp"]); // falls du Delegated-Flow nutzt

  const roleOk = roles.some(r => allowedRoles.has(r));
  const scopeOk = scopes.some(s => allowedScopes.has(s));
  return roleOk || scopeOk;
}

async function verifyBearer(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.substring(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  jwt.verify(
    token,
    getKey,
    {
      algorithms: ["RS256"],
      issuer: ISSUERS,          // akzeptiere v2 (und optional v1)
      audience: audiences,      // ← GUID und/oder api://… erlaubt
    } as any,
    (err, decoded: any) => {
      if (err) {
        console.error("[auth] jwt.verify failed:", err?.message, {
          expectedIssuers: ISSUERS,
          expectedAudiences: audiences,
        });
        return res.status(401).json({ error: "Invalid token", detail: err.message });
      }
      if (!authorize(decoded)) {
        console.warn("[auth] authorization failed. claims:", { roles: decoded?.roles, scp: decoded?.scp });
        return res.status(403).json({ error: "Insufficient permissions", detail: { roles: decoded?.roles, scp: decoded?.scp } });
      }
      (req as any).user = decoded;
      next();
    }
  );
}


/** ======= MCP Server (simuliert SAP) ======= */
const server = new McpServer({
  name: "mcp-sap",
  version: "1.0.0",
});

const randomChoice = <T,>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)]!;

type OrderStatus = {
  orderId: string;
  status: string;
  eta: string | null;
};

const ORDER_STATUSES = ["OPEN", "IN_DELIVERY", "DELIVERED"] as const;

const getOrderStatusInputSchema = {
  orderId: z.string().min(1),
} satisfies ZodRawShape;

const getOrderStatusOutputSchema = {
  orderId: z.string(),
  status: z.string(),
  eta: z.string().nullable(),
} satisfies ZodRawShape;

// Tool: getOrderStatus
server.registerTool(
  "getOrderStatus",
  {
    title: "Get Order Status",
    description: "Liefert Bestellstatus und ETA.",
    inputSchema: getOrderStatusInputSchema,
    outputSchema: getOrderStatusOutputSchema
  },
  async ({ orderId }) => {
    const output: OrderStatus = {
      orderId,
      status: randomChoice(ORDER_STATUSES),
      eta: "2025-10-12",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);

type ServiceTicketStatus = {
  ticketId: string;
  status: string;
};

const SERVICE_TICKET_STATUSES = ["NEW", "IN_PROGRESS", "RESOLVED"] as const;

const getServiceTicketStatusInputSchema = {
  ticketId: z.string().min(1),
} satisfies ZodRawShape;

const getServiceTicketStatusOutputSchema = {
  ticketId: z.string(),
  status: z.string(),
} satisfies ZodRawShape;

// Tool: getServiceTicketStatus
server.registerTool(
  "getServiceTicketStatus",
  {
    title: "Get Service Ticket Status",
    description: "Liefert Service-Ticket-Status.",
    inputSchema: getServiceTicketStatusInputSchema,
    outputSchema: getServiceTicketStatusOutputSchema
  },
  async ({ ticketId }) => {
    const output: ServiceTicketStatus = { ticketId, status: randomChoice(SERVICE_TICKET_STATUSES) };
    return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
  }
);

type ServiceTicketCreateResult = {
  ticketId: string;
  orderId: string;
  createdAt: string;
};

const createServiceTicketInputSchema = {
  orderId: z.string().min(1),
  reason: z.string().min(3),
} satisfies ZodRawShape;

const createServiceTicketOutputSchema = {
  ticketId: z.string(),
  orderId: z.string(),
  createdAt: z.string(),
} satisfies ZodRawShape;

// Tool: createServiceTicket
server.registerTool(
  "createServiceTicket",
  {
    title: "Create Service Ticket",
    description: "Erzeugt ein Service-Ticket (simuliert).",
    inputSchema: createServiceTicketInputSchema,
    outputSchema: createServiceTicketOutputSchema
  },
  async ({ orderId, reason }) => {
    const output: ServiceTicketCreateResult = { ticketId: `T-${Math.floor(Math.random()*1e6)}`, orderId, createdAt: new Date().toISOString() };
    return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
  }
);

// etc. (listOpenOrders, updateDeliveryDate) – analog ergänzen

/** ======= HTTP Transport + Express ======= */
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, mcp: "/mcp" });
});

// MCP endpoint – **geschützt** via OAuth2 Bearer
app.post("/mcp", verifyBearer, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = Number.parseInt(env.PORT ?? "3000", 10);
app.listen(port, () => {
  console.log(`MCP SAP Server listening on http://localhost:${port}/mcp`);
});
