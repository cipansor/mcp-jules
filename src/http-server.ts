/**
 * Jules MCP Server - HTTP transport
 *
 * Security model (see GHSA-rgh8-8cv7-4rj9):
 * - binds loopback by default and refuses to expose a non-loopback interface
 *   without an auth token;
 * - validates the Host header to block DNS-rebinding;
 * - rejects requests whose Origin is not an allowed local origin;
 * - supports optional bearer-token authentication on /mcp.
 */

import { timingSafeEqual, webcrypto } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandler } from "express";

import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  HTTP_ALLOWED_HOSTS_ENV_VAR,
  HTTP_ALLOWED_ORIGINS_ENV_VAR,
  HTTP_ALLOW_INSECURE_ENV_VAR,
  HTTP_AUTH_TOKEN_ENV_VAR,
  HTTP_HOST_ENV_VAR,
  HTTP_PORT_ENV_VAR,
  LOOPBACK_HOSTNAMES,
} from "./constants.js";

// The MCP SDK calls the `crypto` global (Node 20+), but package.json supports
// Node 18, where WebCrypto only exists on `node:crypto`. Without this, every
// /mcp request fails with "crypto is not defined" on Node 18.
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

const WILDCARD_HOSTS = ["0.0.0.0", "::"];

export interface HttpSecurityConfig {
  host: string;
  port: number;
  /** Hostnames accepted in the Host header; empty disables Host validation. */
  allowedHostnames: string[];
  /** Origins accepted in the Origin header; empty disables Origin validation. */
  allowedOrigins: string[];
  authToken?: string;
}

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTNAMES.includes(host);
}

/**
 * Resolve the HTTP transport configuration from the environment, applying
 * secure defaults and refusing unsafe combinations.
 */
export function resolveHttpSecurityConfig(
  env: NodeJS.ProcessEnv = process.env
): HttpSecurityConfig {
  const host = env[HTTP_HOST_ENV_VAR]?.trim() || DEFAULT_HTTP_HOST;

  const port = parseInt(
    env[HTTP_PORT_ENV_VAR] || String(DEFAULT_HTTP_PORT),
    10
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `${HTTP_PORT_ENV_VAR} must be an integer between 1 and 65535.`
    );
  }

  const authToken = env[HTTP_AUTH_TOKEN_ENV_VAR]?.trim() || undefined;
  const allowInsecure = env[HTTP_ALLOW_INSECURE_ENV_VAR] === "true";

  const configuredHostnames = parseList(env[HTTP_ALLOWED_HOSTS_ENV_VAR]);
  const configuredOrigins = parseList(env[HTTP_ALLOWED_ORIGINS_ENV_VAR]);

  let allowedHostnames: string[];
  if (configuredHostnames.length > 0) {
    allowedHostnames = configuredHostnames;
  } else if (isLoopbackHost(host)) {
    allowedHostnames = [...LOOPBACK_HOSTNAMES];
  } else if (WILDCARD_HOSTS.includes(host)) {
    // A wildcard bind accepts any Host header, so an explicit list is required.
    allowedHostnames = [];
  } else {
    allowedHostnames = [host, ...LOOPBACK_HOSTNAMES];
  }

  const allowedOrigins =
    configuredOrigins.length > 0
      ? configuredOrigins
      : [
          `http://localhost:${port}`,
          `http://127.0.0.1:${port}`,
          `http://[::1]:${port}`,
          ...(WILDCARD_HOSTS.includes(host) || isLoopbackHost(host)
            ? []
            : [`http://${host}:${port}`]),
        ];

  if (!isLoopbackHost(host)) {
    const missing: string[] = [];
    if (!authToken) {
      missing.push(
        `${HTTP_AUTH_TOKEN_ENV_VAR} must be set when binding to ${host}`
      );
    }
    if (allowedHostnames.length === 0) {
      missing.push(
        `${HTTP_ALLOWED_HOSTS_ENV_VAR} must list the hostnames clients use when binding to ${host}`
      );
    }
    if (missing.length > 0) {
      const message =
        `Refusing to expose an insecure MCP endpoint on ${host}: ` +
        `${missing.join("; ")}. ` +
        `Set ${HTTP_ALLOW_INSECURE_ENV_VAR}=true only if the network is trusted.`;
      if (!allowInsecure) {
        throw new Error(message);
      }
      console.error(`Warning: ${message}`);
    }
  }

  return { host, port, allowedHostnames, allowedOrigins, authToken };
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function bearerAuthMiddleware(expectedToken: string): RequestHandler {
  const expected = `Bearer ${expectedToken}`;
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (
      typeof header !== "string" ||
      !timingSafeEqualStrings(header, expected)
    ) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      });
      return;
    }
    next();
  };
}

function registerMcpRoute(
  app: ReturnType<typeof createMcpExpressApp>,
  server: McpServer,
  config: HttpSecurityConfig
): void {
  const handlers: RequestHandler[] = [];
  if (config.authToken) {
    handlers.push(bearerAuthMiddleware(config.authToken));
  }
  handlers.push(async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedOrigins: config.allowedOrigins,
    });
    res.on("close", () => transport.close());
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.post("/mcp", ...handlers);
}

/**
 * Run the server with the HTTP transport.
 */
export async function runHTTP(server: McpServer): Promise<void> {
  const config = resolveHttpSecurityConfig();

  const app = createMcpExpressApp({
    host: config.host,
    allowedHosts:
      config.allowedHostnames.length > 0 ? config.allowedHostnames : undefined,
  });

  app.get("/health", (_, res) => {
    res.json({ status: "ok", server: "jules-mcp-server", version: "1.0.0" });
  });

  registerMcpRoute(app, server, config);

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(config.port, config.host, () => {
      const displayHost = config.host.includes(":")
        ? `[${config.host}]`
        : config.host;
      console.error(
        `Jules MCP Server running on http://${displayHost}:${config.port}/mcp`
      );
      console.error(
        `Health check: http://${displayHost}:${config.port}/health`
      );
      console.error(
        `Allowed hosts: ${config.allowedHostnames.join(", ") || "(disabled)"}`
      );
      console.error(`Allowed origins: ${config.allowedOrigins.join(", ")}`);
      console.error(
        `Authentication: ${config.authToken ? "bearer token required" : "disabled (loopback only)"}`
      );
      resolve();
    });
    httpServer.on("error", reject);
  });
}
