# MCP Demo Server

Model Context Protocol (MCP) server that simulates simple order and service ticket APIs.
Use it as a local demo backend to exercise Copilot Studio MCP tooling with OAuth 2.0 protection.

## Features
- OAuth 2.0 (Azure Entra ID) protected MCP endpoint served over HTTP.
- Tools for order status lookup, service ticket status lookup, and service ticket creation.
- Built with Express, Zod validation, and the official `@modelcontextprotocol/sdk`.

## Prerequisites
- Node.js 20 or newer (tested with 20.x).
- npm (ships with Node).
- Azure Entra ID app registration with client credentials flow enabled.

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the sample environment file and fill in your tenant- and audience-specific values:
   ```bash
   cp .env.sample .env
   # then edit .env
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   The MCP endpoint will be available at `http://localhost:3000/mcp` and protected by bearer token verification.

## Configuration
Environment variables are loaded via `dotenv` and validated with Zod.

| Variable      | Required | Description                                                                                 | Example                          |
|---------------|----------|---------------------------------------------------------------------------------------------|----------------------------------|
| `TENANT_ID`   | Yes      | Azure Entra ID tenant GUID.                                                                 | `ffffffff-ffff-ffff-ffff-ffffffffffff` |
| `AUDIENCE`    | Yes      | OAuth resource identifier (GUID, `api://...`, or URL). Must match the `aud` claim expected. | `api://mcp-demo`                 |
| `PORT`        | No       | HTTP port for Express (defaults to `3000`).                                                 | `4000`                           |

## Authentication
All requests to `/mcp` require a bearer token issued by Azure Entra ID. Configure an application registration with:
- Exposed API scope (for delegated tokens) and/or an application role for client credentials.
- JWKS available at the standard discovery endpoint (`/.well-known/openid-configuration`).
- Client secret for the app you are using to mint tokens locally.

### Getting a token for local testing
Replace the placeholders with your real values:

```bash
curl -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=<CLIENT_ID>" \
  -d "client_secret=<CLIENT_SECRET>" \
  -d "grant_type=client_credentials" \
  -d "scope=api://<AUDIENCE>/.default" \
  "https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token"
```

### Testing the MCP server
After you obtain a token, you can use the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector http://localhost:3000/mcp --token "<ACCESS_TOKEN>"
```

Endpoints exposed by the Express server:
- `/health` returns a simple JSON object and does not require authentication.
- `/mcp` hosts the MCP transport (requires an access token).

## Available tools
Registered MCP tools and their purpose:
- `getOrderStatus` – returns simulated order status plus ETA.
- `getServiceTicketStatus` – returns the status of a support ticket.
- `createServiceTicket` – generates a new ticket id tied to an order.

Each tool returns both plain-text and structured JSON content, which helps clients test structured tool responses.

## Production build
The project currently runs directly with `tsx` during development. For deployment, build the TypeScript ahead of time and start Node on the compiled output:

```bash
npx tsc
node dist/server.js
```
