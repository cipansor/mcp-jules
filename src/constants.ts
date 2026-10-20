/**
 * Jules MCP Server Constants
 */

// API Configuration
export const JULES_API_BASE_URL = "https://jules.googleapis.com/v1alpha";
export const API_KEY_ENV_VAR = "JULES_API_KEY";

// HTTP Transport Configuration
export const DEFAULT_HTTP_HOST = "127.0.0.1";
export const DEFAULT_HTTP_PORT = 3000;
export const HTTP_HOST_ENV_VAR = "HOST";
export const HTTP_PORT_ENV_VAR = "PORT";
export const HTTP_ALLOWED_HOSTS_ENV_VAR = "ALLOWED_HOSTS";
export const HTTP_ALLOWED_ORIGINS_ENV_VAR = "ALLOWED_ORIGINS";
export const HTTP_AUTH_TOKEN_ENV_VAR = "MCP_AUTH_TOKEN";
export const HTTP_ALLOW_INSECURE_ENV_VAR = "ALLOW_INSECURE_HTTP";

// Hostnames accepted in the Host header when the server listens on loopback.
export const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

// Pagination Defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Character Limits
export const CHARACTER_LIMIT = 50000;

// Session States (for filtering)
export const ACTIVE_STATES = [
  "QUEUED",
  "PLANNING",
  "AWAITING_PLAN_APPROVAL",
  "AWAITING_USER_FEEDBACK",
  "IN_PROGRESS",
  "PAUSED",
];

export const COMPLETED_STATES = ["COMPLETED", "FAILED"];
