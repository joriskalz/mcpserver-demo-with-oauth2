import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { v4 as uuidv4 } from "uuid";
import { mcpServer } from "./tools.js";

export const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => uuidv4(),
  enableJsonResponse: true,
});

export const transportReady = mcpServer.connect(transport).then(() => {
  console.log("[startup] MCP transport ready");
});

transportReady.catch(error => {
  console.error("[startup] Failed to initialize MCP transport", error);
  process.exitCode = 1;
});
