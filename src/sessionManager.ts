import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { v4 as uuidv4 } from "uuid";
import { createMcpServer } from "./tools.js";

type SessionContext = {
  id?: string;
  transport: StreamableHTTPServerTransport;
  ready: Promise<void>;
};

const sessions = new Map<string, SessionContext>();

function normalizeSessionId(headerValue: string | string[] | undefined): string | undefined {
  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }
  return headerValue ?? undefined;
}

function createSession(): SessionContext {
  const server = createMcpServer();
  const context: SessionContext = {
    transport: new StreamableHTTPServerTransport({
      sessionIdGenerator: () => uuidv4(),
      enableJsonResponse: true,
      onsessioninitialized: sessionId => {
        context.id = sessionId;
        if (sessionId) {
          sessions.set(sessionId, context);
          console.log(`[mcp] Session initialized: ${sessionId}`);
        }
      },
      onsessionclosed: sessionId => {
        if (sessionId) {
          sessions.delete(sessionId);
          console.log(`[mcp] Session closed: ${sessionId}`);
        }
      },
    }),
    ready: Promise.resolve(),
  };

  context.transport.onclose = () => {
    if (context.id) {
      sessions.delete(context.id);
      console.log(`[mcp] Session transport closed: ${context.id}`);
    }
  };

  context.ready = server.connect(context.transport).catch(error => {
    console.error("[mcp] Failed to connect server to transport", { error });
    if (context.id) {
      sessions.delete(context.id);
    }
    throw error;
  });

  return context;
}

function sessionNotFound(res: Response): void {
  res
    .status(404)
    .json({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null });
}

export async function handleMcpRequest(req: Request, res: Response, body: unknown): Promise<void> {
  const incomingSessionId = normalizeSessionId(req.headers["mcp-session-id"]);
  let session = incomingSessionId ? sessions.get(incomingSessionId) : undefined;

  if (incomingSessionId && !session) {
    sessionNotFound(res);
    return;
  }

  if (!session) {
    session = createSession();
  }

  await session.ready;
  await session.transport.handleRequest(req as any, res as any, body as any);
}

export async function shutdownSessions(): Promise<void> {
  const activeSessions = Array.from(sessions.values());
  sessions.clear();
  await Promise.allSettled(
    activeSessions.map(async session => {
      await session.transport.close();
    })
  );
}
