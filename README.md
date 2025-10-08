
# MCP Demo Server (OAuth 2.0 via Microsoft Entra ID)

A minimal **Model Context Protocol (MCP)** server (TypeScript SDK) that simulates SAP-like actions (order status, service tickets) for illustrative purposes — it is not intended to simulate real SAP calls or present this as an SAP use case. It is secured with **OAuth 2.0 (Authorization Code Flow)** via **Microsoft Entra ID**. For local development, the server is exposed through **Microsoft Dev Tunnels** and can be attached to a **Copilot Studio** agent via the **MCP wizard**.

---

## Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Environment Variables](#environment-variables)
5. [Microsoft Entra ID: Two App Registrations](#microsoft-entra-id-two-app-registrations)
6. [Start a Dev Tunnel](#start-a-dev-tunnel)
7. [Copilot Studio: Add the MCP Server (Wizard)](#copilot-studio-add-the-mcp-server-wizard)
8. [Testing (Inspector / curl)](#testing-inspector--curl)
9. [Troubleshooting](#troubleshooting)
10. [Production Notes](#production-notes)
11. [Appendix: Example Values](#appendix-example-values)

---

## Features

The server registers simulated MCP tools:

* `getOrderStatus(orderId)` – returns `OPEN | IN_DELIVERY | DELIVERED` plus ETA
* `getServiceTicketStatus(ticketId)` – returns `NEW | IN_PROGRESS | RESOLVED`
* `createServiceTicket(orderId, reason)` – creates a dummy ticket

> Implemented with `@modelcontextprotocol/sdk` and a **Streamable HTTP** endpoint at `/mcp`.

---

## Prerequisites

* **Node.js 20 LTS** (recommended; e.g., via `nvm alias default 20`)
* **npm** or **pnpm**
* A **Microsoft Entra** tenant (admin rights to create app registrations)
* A **Copilot Studio** environment with an agent
* **Microsoft Dev Tunnels** CLI (to expose your local port)

---

## Quick Start

```bash
# 1) Install dependencies
npm install

# 2) Create .env (see below)
cp .env.sample .env
# ... fill TENANT_ID / AUDIENCE / PORT

# 3) Start the dev server
npm run dev
# Listens at http://localhost:3000/mcp

# 4) Start a Dev Tunnel (separate terminal)
devtunnel user login
devtunnel host -p 3000 --allow-anonymous
# Note the public HTTPS URL, e.g., https://<id>-3000.<region>.devtunnels.ms/mcp
```

---

## Environment Variables

Values are loaded via `dotenv` (see `src/server.ts`). The **Audience** must match the “Application ID URI” of your API app (or its app ID).

| Variable         | Required | Description                                                    | Example                                              |
| ---------------- | -------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| `TENANT_ID`      | Yes      | Tenant GUID or name (GUID recommended).                        | `ffffffff-ffff-ffff-ffff-ffffffffffff`               |
| `AUDIENCE`       | Yes      | Expected token `aud`: the app ID (GUID).   | `ffffffff-ffff-ffff-ffff-ffffffffffff` |
| `PORT`           | No       | HTTP port (default `3000`).                                    | `4044`                                               |
| `ALLOWED_SCOPES` | No       | Allowed scopes (blank → defaults: `Mcp.Access access_as_mcp`). | `Mcp.Access`                                         |
| 

> **Note:** code accepts a suitable `scp` (scope) e.g for delegated tokens via Copilot Studio, `Mcp.Access` is enough.

---

## Microsoft Entra ID: Two App Registrations

We separate API (resource server) and client (Copilot Studio).

### A) API App “MCP SAP API” (resource)

1. **Register app** → **Expose an API**:

   * Set **Application ID URI**, e.g., `api://<guid>`.
   * Create a **scope**, e.g., `Mcp.Access` (full scope becomes `api://…/Mcp.Access`).

3. **Manifest**: If needed, set `requestedAccessTokenVersion: 2`.
   *(In some setups this is required so `scp`/`roles` are issued as expected.)*

### B) Client App “MCP SAP Client (Copilot Studio)”

1. **Register app** → **Authentication** → **Add a platform** → **Web**.

   * You’ll add the **Redirect URI** from the **Copilot Studio MCP wizard** later (exact match). **Do not** use SPA/Public Client for this scenario.
2. **Certificates & secrets** → create a **client secret**.
3. **API permissions** → **My APIs** → your **API app** → **Delegated permissions** → check **`Mcp.Access`** → **Grant admin consent**.

**Endpoints (v2.0):**

* Authorization URL: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`
* Token URL: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
* **Refresh URL** = **Token URL** (refresh token grant uses the same endpoint; include `offline_access` in scopes if you want refresh tokens).

---

## Start a Dev Tunnel

```bash
devtunnel user login
devtunnel host -p 3000 --allow-anonymous
# The output contains a public HTTPS URL; append "/mcp" for the Server URL in the wizard
```

---

## Copilot Studio: Add the MCP Server (Wizard)

> Important: **Add the MCP server from within an agent**: **Agent → Tools → Add tool → Model Context Protocol**.
> The global “Tools” page also lists tools, but the “Add MCP server” entry there primarily links to docs—use the agent’s tools tab instead.

1. **Server details**

   * **Name**: e.g., `SAP (simulated)`
   * **Server URL**: `https://<devtunnel-host>/mcp`
   * Transport: **Streamable HTTP** (default/implicit).
2. **Authentication: OAuth 2.0 (Manual)**

   * **Client ID**: from your client app
   * **Client Secret**: from your client app
   * **Authorization URL**: `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/authorize`
   * **Token URL** **and** **Refresh URL**: `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token`
   * **Scopes**: `api://<ApplicationIDURI>/Mcp.Access offline_access`
3. The wizard shows a **Redirect URL** → **copy it** → in your **client app** add it under **Authentication → Web Redirect URIs** (exact match) → **Save**.
4. **Create** / **Save**, then **Create connection** → sign in/consent → done.

**Example (do not commit these values):**

```
Server URL: https://abcdefg-3000.euw.devtunnels.ms/mcp
Authorization URL: https://login.microsoftonline.com/ffffffff-ffff-ffff-ffff-ffffffffffff/oauth2/v2.0/authorize
Token/Refresh URL: https://login.microsoftonline.com/ffffffff-ffff-ffff-ffff-ffffffffffff/oauth2/v2.0/token
Scopes: api://ffffffff-ffff-ffff-ffff-ffffffffffff/Mcp.Access offline_access
Redirect URL (from wizard): https://global.consent.azure-apim.net/redirect/...
```

---

## Testing (Inspector / curl)

### 1) Health check

```bash
curl http://localhost:3000/health
# -> { "ok": true, "mcp": "/mcp" }
```

### 2) MCP Inspector (CLI)

> Works reliably with Node 20. If the latest Inspector version has an ESM packaging hiccup, pin a known-good version (e.g., `@0.16.x`).

```bash
# List tools (example invocation style)
npx @modelcontextprotocol/inspector@0.16.2 --cli \
  curl http://localhost:3000/mcp --method tools/list
```

### 3) Raw POST (expect 401 without a token)

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list"}'
```

### 4) With an access token

Delegated tokens come via Copilot Studio’s connection flow.
If you want **client credentials** locally, add an **app role** (e.g., `McpServer.Invoke`) in the **API app** and grant **application permissions** to the **client app** (admin consent). Then:

```bash
# Get token (client credentials) – produces a roles claim
curl -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=<CLIENT_ID>" \
  -d "client_secret=<CLIENT_SECRET>" \
  -d "grant_type=client_credentials" \
  -d "scope=api://<ApplicationIDURI>/.default" \
  "https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token"
```

```bash
# MCP call with Bearer
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"getOrderStatus","arguments":{"orderId":"4711"}}}'
```

---

## Troubleshooting

**`AADSTS650053` – scope doesn’t exist / wrong resource (`00000003-...`)**

* You entered `Mcp.Access` **without** a resource prefix, so Entra treated it as **Microsoft Graph** (app id `00000003-...`).
* **Fix:** Use the **fully qualified** scope in Copilot Studio:
  `api://<ApplicationIDURI>/Mcp.Access` (plus optional `offline_access`).

**`AADSTS50011` – Redirect URI mismatch**

* Add the wizard’s **exact** Redirect URL as a **Web redirect** in the **client app** (HTTPS, case-sensitive).

**No refresh token**

* Add `offline_access` to scopes. Refresh uses the same **/token** endpoint (Refresh URL = Token URL).

**Inspector CLI fails to launch (ESM / `ERR_MODULE_NOT_FOUND`)**

* Use Node 20 and pin a stable Inspector version (e.g., `@0.16.x`).

**Dev Tunnel isn’t public**

* Run `devtunnel user login` and then `devtunnel host -p <port>` again.

**Server rejects token (`aud` / `iss` / `scp`)**

* Check tenant; ensure `aud` matches your API app’s Application ID URI; confirm `scp` includes `Mcp.Access` (delegated) **or** `roles` contains a permitted app role (client credentials).

---

## Production Notes

* **Dev Tunnels are for development only**; in production use a proper domain/TLS, reverse proxy, logging/auditing, and rate limits.
* Keep CORS tight; never commit secrets; plan secret rotation.
* Consider PKCE/Conditional Access as needed via Entra policies.
* Add monitoring/alerting (e.g., App Insights/APIM) and structured logs.

---

