import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";

export const mcpServer = new McpServer({
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

const randomEta = (): string | null => {
  if (Math.random() < 0.4) {
    return null;
  }
  const daysAhead = Math.floor(Math.random() * 5) + 1;
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
};

const getOrderStatusInputSchema = {
  orderId: z.string().min(1),
} satisfies ZodRawShape;

const getOrderStatusOutputSchema = {
  orderId: z.string(),
  status: z.string(),
  eta: z.string().nullable(),
} satisfies ZodRawShape;

mcpServer.registerTool(
  "getOrderStatus",
  {
    title: "Get Order Status",
    description: "Returns the simulated order status plus an estimated delivery timestamp when available.",
    inputSchema: getOrderStatusInputSchema,
    outputSchema: getOrderStatusOutputSchema,
  },
  async ({ orderId }) => {
    const output: OrderStatus = {
      orderId,
      status: randomChoice(ORDER_STATUSES),
      eta: randomEta(),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
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

mcpServer.registerTool(
  "getServiceTicketStatus",
  {
    title: "Get Service Ticket Status",
    description: "Returns the current simulated status for a service ticket.",
    inputSchema: getServiceTicketStatusInputSchema,
    outputSchema: getServiceTicketStatusOutputSchema,
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
  reason: string;
};

const createServiceTicketInputSchema = {
  orderId: z.string().min(1),
  reason: z.string().min(3),
} satisfies ZodRawShape;

const createServiceTicketOutputSchema = {
  ticketId: z.string(),
  orderId: z.string(),
  createdAt: z.string(),
  reason: z.string(),
} satisfies ZodRawShape;

mcpServer.registerTool(
  "createServiceTicket",
  {
    title: "Create Service Ticket",
    description: "Creates a simulated service ticket for the provided order and returns the new identifier.",
    inputSchema: createServiceTicketInputSchema,
    outputSchema: createServiceTicketOutputSchema,
  },
  async ({ orderId, reason }) => {
    const output: ServiceTicketCreateResult = {
      ticketId: `T-${Math.floor(Math.random() * 1e6)}`,
      orderId,
      createdAt: new Date().toISOString(),
      reason,
    };
    return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
  }
);

// Additional tools (listOpenOrders, updateDeliveryDate, etc.) would be registered here.
