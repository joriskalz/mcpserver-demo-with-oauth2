import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";

/**
 * Sample MCP server with:
 *  - Simulated SAP-style tools (order & service ticket).
 *  - A **resource section** providing customer email templates by status
 *    + a tool to fetch the right email template for a given status.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "mcp-sap",
    version: "1.0.0",
  });

  // -----------------------------
  // Utilities
  // -----------------------------
  const randomChoice = <T,>(values: readonly T[]): T =>
    values[Math.floor(Math.random() * values.length)]!;

  const formatDate = (iso?: string | null, locale = "en-US"): string | null => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(d);
    } catch {
      return null;
    }
  };

  // -----------------------------
  // Domain Types
  // -----------------------------
  type OrderStatus = "OPEN" | "IN_DELIVERY" | "DELIVERED";
  type ServiceTicketStatus = "NEW" | "IN_PROGRESS" | "RESOLVED";

  const ORDER_STATUSES = ["OPEN", "IN_DELIVERY", "DELIVERED"] as const;
  const SERVICE_TICKET_STATUSES = ["NEW", "IN_PROGRESS", "RESOLVED"] as const;

  // -----------------------------
  // Simulated Data Generators
  // -----------------------------
  const randomEta = (): string | null => {
    if (Math.random() < 0.4) {
      return null;
    }
    const daysAhead = Math.floor(Math.random() * 5) + 1;
    return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
  };

  // -----------------------------
  // Tool: getOrderStatus
  // -----------------------------
  const getOrderStatusInputSchema = {
    orderId: z.string().min(1),
  } satisfies ZodRawShape;

  const getOrderStatusOutputSchema = {
    orderId: z.string(),
    status: z.string(),
    eta: z.string().nullable(),
  } satisfies ZodRawShape;

  server.registerTool(
    "getOrderStatus",
    {
      title: "Get Order Status",
      description:
        "Returns the simulated order status plus an estimated delivery timestamp when available.",
      inputSchema: getOrderStatusInputSchema,
      outputSchema: getOrderStatusOutputSchema,
    },
    async ({ orderId }) => {
      const output: { orderId: string; status: OrderStatus; eta: string | null } = {
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

  // -----------------------------
  // Tool: getServiceTicketStatus
  // -----------------------------
  const getServiceTicketStatusInputSchema = {
    ticketId: z.string().min(1),
  } satisfies ZodRawShape;

  const getServiceTicketStatusOutputSchema = {
    ticketId: z.string(),
    status: z.string(),
  } satisfies ZodRawShape;

  server.registerTool(
    "getServiceTicketStatus",
    {
      title: "Get Service Ticket Status",
      description: "Returns the current simulated status for a service ticket.",
      inputSchema: getServiceTicketStatusInputSchema,
      outputSchema: getServiceTicketStatusOutputSchema,
    },
    async ({ ticketId }) => {
      const output: { ticketId: string; status: ServiceTicketStatus } = {
        ticketId,
        status: randomChoice(SERVICE_TICKET_STATUSES),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  // -----------------------------
  // Tool: createServiceTicket
  // -----------------------------
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

  server.registerTool(
    "createServiceTicket",
    {
      title: "Create Service Ticket",
      description:
        "Creates a simulated service ticket for the provided order and returns the new identifier.",
      inputSchema: createServiceTicketInputSchema,
      outputSchema: createServiceTicketOutputSchema,
    },
    async ({ orderId, reason }) => {
      const output = {
        ticketId: `T-${Math.floor(Math.random() * 1e6)}`,
        orderId,
        createdAt: new Date().toISOString(),
        reason,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  // ============================================================
  // RESOURCE SECTION — Email templates by status & type
  // ============================================================
  // This section provides reusable customer communication templates
  // depending on domain (ORDER or TICKET) and current status.
  //
  // Exposed via:
  //   - Tool: listEmailTemplates  → discover supported templates
  //   - Tool: getEmailTemplate    → retrieve a rendered subject & body
  // ============================================================

  // Supported categories for templates
  const EmailCategorySchema = z.enum(["ORDER", "TICKET"]);
  type EmailCategory = z.infer<typeof EmailCategorySchema>;

  // Base shape for a rendered email
  type RenderedEmail = {
    subject: string;
    body: string; // plain text (you can switch to markdown/html as desired)
    guidance: string[]; // tips for the agent on how to handle this scenario
  };

  // Helper: validation (keeps runtime checks strict)
  const isOrderStatus = (s: string): s is OrderStatus =>
    (ORDER_STATUSES as readonly string[]).includes(s);
  const isTicketStatus = (s: string): s is ServiceTicketStatus =>
    (SERVICE_TICKET_STATUSES as readonly string[]).includes(s);

  // Rendering helpers to produce high-quality emails with optional context
  const renderOrderEmail = (status: OrderStatus, ctx: {
    customerName?: string;
    orderId?: string;
    eta?: string | null;
    locale?: string;
  }): RenderedEmail => {
    const name = ctx.customerName ?? "there";
    const niceEta = formatDate(ctx.eta, ctx.locale);
    const idFragment = ctx.orderId ? ` (Order ${ctx.orderId})` : "";

    switch (status) {
      case "OPEN": {
        return {
          subject: `We've received your order${ctx.orderId ? ` ${ctx.orderId}` : ""}`,
          body: [
            `Hi ${name},`,
            ``,
            `Thanks for your purchase${idFragment}! Your order is currently **OPEN** and being prepared.`,
            `We’ll send another update as soon as it ships.`,
            ``,
            `Best regards,`,
            `Customer Care`,
          ].join("\n"),
          guidance: [
            "Confirm the order was successfully created.",
            "Set expectations on next updates and provide any self-service tracking links if available.",
            "Avoid promising specific delivery dates unless known.",
          ],
        };
      }
      case "IN_DELIVERY": {
        const etaLine = niceEta
          ? `Estimated delivery date: ${niceEta}.`
          : `We’ll notify you once a delivery date is confirmed.`;
        return {
          subject: `Good news — your order is on its way${ctx.orderId ? ` (${ctx.orderId})` : ""}`,
          body: [
            `Hi ${name},`,
            ``,
            `Your order${idFragment} is **IN DELIVERY**.`,
            etaLine,
            ``,
            `If you need to make changes to the delivery or have any questions, just reply to this email.`,
            ``,
            `Best regards,`,
            `Customer Care`,
          ].join("\n"),
          guidance: [
            "Include tracking info or carrier link if available.",
            "Avoid overcommitting when ETA is not confirmed.",
            "Offer a clear escalation path if delivery is urgent.",
          ],
        };
      }
      case "DELIVERED": {
        return {
          subject: `Delivered — thank you for your order${ctx.orderId ? ` ${ctx.orderId}` : ""}`,
          body: [
            `Hi ${name},`,
            ``,
            `We’re happy to let you know your order${idFragment} has been **DELIVERED**.`,
            `We hope everything arrived as expected. If there’s anything we can help with, please reply to this message.`,
            ``,
            `Best regards,`,
            `Customer Care`,
          ].join("\n"),
          guidance: [
            "Invite feedback or confirm successful delivery.",
            "If delivery confirmation is automated, provide support paths for issues.",
            "Offer return/exchange information where applicable.",
          ],
        };
      }
    }
  };

  const renderTicketEmail = (status: ServiceTicketStatus, ctx: {
    customerName?: string;
    ticketId?: string;
    locale?: string;
  }): RenderedEmail => {
    const name = ctx.customerName ?? "there";
    const idFragment = ctx.ticketId ? ` (Ticket ${ctx.ticketId})` : "";

    switch (status) {
      case "NEW": {
        return {
          subject: `Support ticket received${ctx.ticketId ? ` — ${ctx.ticketId}` : ""}`,
          body: [
            `Hi ${name},`,
            ``,
            `Thanks for contacting us. Your support request${idFragment} is now **NEW** in our system.`,
            `A specialist will review it shortly and follow up if we need more details.`,
            ``,
            `Best regards,`,
            `Support Team`,
          ].join("\n"),
          guidance: [
            "Acknowledge receipt and set initial expectations on response time.",
            "Advise the customer to reply with any additional details/logs if needed.",
          ],
        };
      }
      case "IN_PROGRESS": {
        return {
          subject: `Update on your support ticket${ctx.ticketId ? ` — ${ctx.ticketId}` : ""}`,
          body: [
            `Hi ${name},`,
            ``,
            `We’re actively working on your support request${idFragment} (**IN PROGRESS**).`,
            `We will update you as soon as we have the next steps or a resolution.`,
            ``,
            `Best regards,`,
            `Support Team`,
          ].join("\n"),
          guidance: [
            "Summarize any findings if available and next steps (ETA if safe).",
            "Avoid technical deep-dives unless the customer is technical.",
          ],
        };
      }
      case "RESOLVED": {
        return {
          subject: `Your support ticket has been resolved${ctx.ticketId ? ` — ${ctx.ticketId}` : ""}`,
          body: [
            `Hi ${name},`,
            ``,
            `Good news — your support request${idFragment} is **RESOLVED**.`,
            `If the issue persists or you have further questions, just reply to this email and we’ll reopen the case.`,
            ``,
            `Best regards,`,
            `Support Team`,
          ].join("\n"),
          guidance: [
            "Summarize the resolution briefly and provide any relevant KB links.",
            "Explain how to reopen or follow up if the issue recurs.",
          ],
        };
      }
    }
  };

  // -----------------------------
  // Tool: listEmailTemplates
  // -----------------------------
  const listEmailTemplatesOutputSchema = {
    categories: z.array(
      z.object({
        category: z.enum(["ORDER", "TICKET"]),
        statuses: z.array(z.string()),
      })
    ),
  } satisfies ZodRawShape;

  server.registerTool(
    "listEmailTemplates",
    {
      title: "List Email Templates",
      description:
        "Lists supported email template categories and statuses that can be used with getEmailTemplate.",
      inputSchema: {}, // no inputs
      outputSchema: listEmailTemplatesOutputSchema,
    },
    async () => {
      const output = {
        categories: [
          { category: "ORDER" as const, statuses: [...ORDER_STATUSES] as string[] },
          { category: "TICKET" as const, statuses: [...SERVICE_TICKET_STATUSES] as string[] },
        ],
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  // -----------------------------
  // Tool: getEmailTemplate
  // -----------------------------
  const getEmailTemplateInputSchema = {
    category: EmailCategorySchema, // "ORDER" | "TICKET"
    status: z.string().min(1),     // validated at runtime against allowed set
    customerName: z.string().optional(),
    orderId: z.string().optional(),
    ticketId: z.string().optional(),
    eta: z.string().nullable().optional(),
    locale: z.string().optional().describe("BCP47 locale code, e.g., 'en-US'"),
  } satisfies ZodRawShape;

  const getEmailTemplateOutputSchema = {
    subject: z.string(),
    body: z.string(),
    guidance: z.array(z.string()),
  } satisfies ZodRawShape;

  server.registerTool(
    "getEmailTemplate",
    {
      title: "Get Email Template",
      description:
        "Returns a ready-to-send customer email (subject & body) and guidance based on category and status.",
      inputSchema: getEmailTemplateInputSchema,
      outputSchema: getEmailTemplateOutputSchema,
    },
    async (input) => {
      const category = input.category as EmailCategory;
      const locale = input.locale ?? "en-US";

      let rendered: RenderedEmail;

      if (category === "ORDER") {
        if (!isOrderStatus(input.status)) {
          throw new Error(
            `Unsupported ORDER status "${input.status}". Allowed: ${ORDER_STATUSES.join(", ")}`
          );
        }
        rendered = renderOrderEmail(
          input.status,
          {
            ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
            ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
            ...(input.eta !== undefined ? { eta: input.eta } : { eta: null }),
            ...(input.locale !== undefined ? { locale: input.locale } : {}),
          }
        );
      } else {
        if (!isTicketStatus(input.status)) {
          throw new Error(
            `Unsupported TICKET status "${input.status}". Allowed: ${SERVICE_TICKET_STATUSES.join(", ")}`
          );
        }
        rendered = renderTicketEmail(
          input.status,
          {
            ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
            ...(input.ticketId !== undefined ? { ticketId: input.ticketId } : {}),
            ...(input.locale !== undefined ? { locale: input.locale } : {}),
          }
        );
      }

      return {
        content: [{ type: "text", text: JSON.stringify(rendered) }],
        structuredContent: rendered,
      };
    }
  );

  // Additional tools (listOpenOrders, updateDeliveryDate, etc.) would be registered here.

    return server;
  }
