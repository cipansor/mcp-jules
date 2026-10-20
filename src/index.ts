#!/usr/bin/env node
/**
 * Jules MCP Server
 *
 * MCP Server for Google Jules AI Coding Agent API
 * Enables LLMs to create and manage coding sessions, monitor progress,
 * and interact with Jules through natural language.
 *
 * @see https://jules.google/docs/api/reference/
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerSessionsTools } from "./tools/sessions.js";
import { registerActivitiesTools } from "./tools/activities.js";
import { registerSourcesTools } from "./tools/sources.js";
import { API_KEY_ENV_VAR } from "./constants.js";
import { runHTTP } from "./http-server.js";

// ============================================================================
// Server Initialization
// ============================================================================

const server = new McpServer({
  name: "mcp-jules",
  version: "0.1.1",
});

// ============================================================================
// Register All Tools
// ============================================================================

/**
 * Register all MCP tools with the server
 */
function registerAllTools(): void {
  // Sessions: Create, list, get, delete, send message, approve plan
  registerSessionsTools(server);

  // Activities: List and get session activities
  registerActivitiesTools(server);

  // Sources: List and get connected repositories
  registerSourcesTools(server);
}

// ============================================================================
// Transport Setup
// ============================================================================

/**
 * Validate that the Jules API key is present before starting any transport
 */
function validateApiKey(): void {
  if (!process.env[API_KEY_ENV_VAR]) {
    console.error(
      `Error: ${API_KEY_ENV_VAR} environment variable is required.`
    );
    console.error("Get your API key from https://jules.google.com/settings");
    process.exit(1);
  }
}

/**
 * Run server with stdio transport (for local/CLI use)
 */
async function runStdio(): Promise<void> {
  validateApiKey();
  registerAllTools();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Jules MCP Server running on stdio");
}

/**
 * Run server with HTTP transport (for remote/web use)
 */
async function runHttpTransport(): Promise<void> {
  validateApiKey();
  registerAllTools();
  await runHTTP(server);
}

// ============================================================================
// CLI Interface
// ============================================================================

function printHelp(): void {
  console.log(`
Jules MCP Server - Google Jules AI Coding Agent API

USAGE:
  npx mcp-jules [OPTIONS]

OPTIONS:
  --help, -h      Show this help message
  --http          Run with HTTP transport (default: stdio)

ENVIRONMENT:
  JULES_API_KEY   Required. Get from https://jules.google.com/settings
  PORT            HTTP port (default: 3000, only for --http)
  HOST            HTTP bind address (default: 127.0.0.1, only for --http)
  TRANSPORT       Alternative to --http: set to 'http' for HTTP transport

HTTP SECURITY:
  MCP_AUTH_TOKEN       Bearer token required on /mcp. Mandatory when HOST is
                       not a loopback address.
  ALLOWED_HOSTS        Comma-separated Host header allowlist. Required when
                       HOST is 0.0.0.0 or ::.
  ALLOWED_ORIGINS      Comma-separated Origin allowlist (default: localhost).
  ALLOW_INSECURE_HTTP  Set to 'true' to allow an unauthenticated non-loopback
                       bind. Not recommended.

EXAMPLES:
  # Run with stdio (for MCP clients like Claude Desktop)
  JULES_API_KEY=your-key npx mcp-jules

  # Run with HTTP on loopback (default, protected by Host/Origin checks)
  JULES_API_KEY=your-key npx mcp-jules --http

  # Run with HTTP on custom port
  JULES_API_KEY=your-key PORT=8080 npx mcp-jules --http

  # Expose on the LAN (requires a token and an explicit host allowlist)
  JULES_API_KEY=your-key HOST=0.0.0.0 MCP_AUTH_TOKEN=secret \\
    ALLOWED_HOSTS=mcp.internal ALLOWED_ORIGINS=https://mcp.internal \\
    npx mcp-jules --http

AVAILABLE TOOLS:
  jules_create_session    Create a new coding session
  jules_list_sessions     List all sessions
  jules_get_session       Get session details
  jules_delete_session    Delete a session
  jules_send_message      Send message to active session
  jules_approve_plan      Approve a pending plan
  jules_list_activities   List session activities
  jules_get_activity      Get activity details
  jules_list_sources      List connected repositories
  jules_get_source        Get source details

For more information, see: https://jules.google/docs/api/reference/
`);
}

// ============================================================================
// Main Entry Point
// ============================================================================

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const useHttp = args.includes("--http") || process.env.TRANSPORT === "http";

if (useHttp) {
  runHttpTransport().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
