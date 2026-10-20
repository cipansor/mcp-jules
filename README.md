# Jules MCP Server

[![Status](https://img.shields.io/badge/status-GitHub%20Actions-2088FF?style=flat-square)](.github/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.1.1-0ea5e9?style=flat-square)](package.json)

MCP (Model Context Protocol) server for [Google Jules](https://jules.google) - the AI coding agent. This server enables LLMs like Claude to interact with Jules API, creating and managing coding sessions programmatically.

## Architecture

The Jules MCP Server acts as a bridge between MCP-compatible clients and the Jules REST API.

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  MCP Client  │      │ Jules MCP Server │      │  Jules REST API  │
│ (Claude, etc)│ ◄──► │ (stdio/HTTP)     │ ◄──► │ (googleapis.com) │
└──────────────┘      └──────────────────┘      └──────────────────┘
```

1.  **MCP Client**: An application like Claude Desktop that supports the Model Context Protocol.
2.  **Jules MCP Server**: This project, which exposes Jules's capabilities as MCP tools and translates them to Jules API calls.
3.  **Jules REST API**: The underlying Google API that powers Jules's coding capabilities.

## Features

- **Session Management**: Create, list, get, and delete coding sessions
- **Interactive Communication**: Send messages to active sessions and approve plans
- **Activity Monitoring**: Track progress through session activities
- **Source Management**: List and inspect connected GitHub repositories
- **Dual Transport**: Supports both stdio and HTTP transports
- **Hardened HTTP Transport**: Loopback-by-default bind, Host/Origin validation (DNS-rebinding protection), and optional bearer-token authentication

## Prerequisites

- Node.js 18+
- Jules API Key (get from [jules.google.com/settings](https://jules.google.com/settings))
- Connected GitHub repositories in Jules

## Installation

```bash
# Clone or download the server
cd jules-mcp-server

# Install dependencies
npm install

# Build the TypeScript
npm run build
```

## Configuration

Set your Jules API key as an environment variable:

```bash
export JULES_API_KEY="your-api-key-here"
```

## Security

**Manage your `JULES_API_KEY` with care:**

- **Environment Variables**: Always use environment variables to provide the API key. Avoid hardcoding it in source code or configuration files.
- **No Commits**: Never commit your API key or `.env` files containing keys to version control. The `.gitignore` file is configured to ignore `.env` files.
- **Least Privilege**: The Jules API key provides full access to your Jules sessions and connected repositories. Keep it secure and rotate it if you suspect it has been compromised.
- **CI/CD**: When using in CI/CD environments (like GitHub Actions), use Secrets to store and inject the API key.

### HTTP transport hardening

The HTTP transport can drive mutating Jules tools with your API key, so it is locked down by default:

- **Loopback by default**: the server binds `127.0.0.1`. It refuses to bind a
  non-loopback address unless `MCP_AUTH_TOKEN` is set and `ALLOWED_HOSTS` lists
  the hostnames clients will use. `ALLOW_INSECURE_HTTP=true` overrides this
  refusal and is not recommended.
- **DNS-rebinding protection**: the `Host` header is validated against the
  allowed hostnames, and the MCP transport rejects requests from origins
  outside `ALLOWED_ORIGINS`.
- **Optional authentication**: set `MCP_AUTH_TOKEN` to require
  `Authorization: Bearer <token>` on `/mcp`. `/health` stays unauthenticated.

For example, to expose the server on a trusted LAN:

```bash
JULES_API_KEY=your-key \
  HOST=0.0.0.0 \
  MCP_AUTH_TOKEN=a-long-random-token \
  ALLOWED_HOSTS=mcp.internal \
  ALLOWED_ORIGINS=https://mcp.internal \
  node dist/index.js --http
```

`ALLOWED_ORIGINS` must include the origin each browser client sends. If your
clients run on `https://app.example.com`, add it to the comma-separated list;
requests from origins that are not listed receive `403`.

If you deploy behind a reverse proxy, terminate TLS at the proxy and keep
`ALLOWED_ORIGINS` restricted to the exact origins of your MCP clients.

Do not set `ALLOWED_HOSTS` to a name that resolves elsewhere while binding
loopback without a token: a tokenless listener only accepts hostnames that
resolve to the local machine.

See [GHSA-rgh8-8cv7-4rj9](https://github.com/cipansor/mcp-jules/security/advisories/GHSA-rgh8-8cv7-4rj9)
for the advisory that prompted these controls.

## Usage

### With Claude Desktop (stdio transport)

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "jules": {
      "command": "node",
      "args": ["/path/to/jules-mcp-server/dist/index.js"],
      "env": {
        "JULES_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### With Claude Code (CLI)

You can add this server to [Claude Code](https://claude.ai/code) by running:

```bash
claude mcp add jules --env JULES_API_KEY=your-api-key-here -- node /path/to/jules-mcp-server/dist/index.js
```

### Command Line

```bash
# Run with stdio transport
JULES_API_KEY=your-key node dist/index.js

# Run with HTTP transport (binds 127.0.0.1 by default)
JULES_API_KEY=your-key node dist/index.js --http

# Custom port for HTTP
JULES_API_KEY=your-key PORT=8080 node dist/index.js --http

# Expose on a trusted LAN (token + explicit host allowlist required)
JULES_API_KEY=your-key HOST=0.0.0.0 MCP_AUTH_TOKEN=your-token \
  ALLOWED_HOSTS=mcp.internal ALLOWED_ORIGINS=https://mcp.internal \
  node dist/index.js --http

# Show help
node dist/index.js --help
```

See [HTTP transport hardening](#http-transport-hardening) for the full list of
security-related environment variables.

## Tool Reference

The server provides a suite of tools to interact with Jules. Some tools support a `response_format` parameter (`markdown` or `json`); refer to each tool's documented arguments to see whether it is accepted.

### Session Tools

#### `jules_create_session`

Creates a new coding session where Jules executes a task on a repository.

- **Arguments**:
  - `prompt` (string, required): Task description.
  - `sourceContext` (object, required): Repository info (e.g., `{ "source": "sources/github-owner-repo", "githubRepoContext": { "startingBranch": "main" } }`).
  - `title` (string, optional): Session title.
  - `requirePlanApproval` (boolean, optional): If Jules should wait for plan approval.
  - `automationMode` (string, optional): Use `AUTO_CREATE_PR` to automatically create a PR on completion.
  - `response_format` (string, optional): Response format, either `markdown` or `json`.

- **Example Response (Markdown)**:

  ```markdown
  ## Session: Add auth tests

  **ID:** 1234567
  **State:** ⏳ QUEUED
  **Prompt:** Add unit tests for the authentication module
  **URL:** https://jules.google/session/1234567
  ```

#### `jules_list_sessions`

Lists all your coding sessions.

- **Arguments**:
  - `pageSize` (number, optional): Max results per page (1-100, default: 20).
  - `pageToken` (string, optional): Token for the next page.
  - `response_format` (string, optional): Format for the response output.

- **Example Response (JSON)**:
  ```json
  {
    "sessions": [
      {
        "id": "1234567",
        "title": "Add auth tests",
        "state": "IN_PROGRESS",
        "createTime": "2023-10-27T10:00:00Z"
      }
    ],
    "total": 1,
    "hasMore": false
  }
  ```

#### `jules_get_session`

Retrieves full details for a specific session, including current state, URL, and outputs (like PR links) if completed.

- **Arguments**:
  - `sessionId` (string, required): The ID of the session.
  - `response_format` (string, optional): 'markdown' (default) or 'json'.

- **Example Response (Markdown)**:

  ```markdown
  ## Session: Add auth tests

  **ID:** 1234567
  **State:** ✅ COMPLETED
  **Prompt:** Add unit tests for the authentication module
  **URL:** https://jules.google/session/1234567

  **Created:** Oct 27, 2023, 10:00 AM
  **Updated:** Oct 27, 2023, 10:45 AM

  ### Outputs

  **Pull Request:** [Add auth unit tests](https://github.com/myorg/myrepo/pull/42)

  > This PR adds comprehensive unit tests for the auth module.
  ```

- **Example Response (JSON)**:
  ```json
  {
    "id": "1234567",
    "title": "Add auth tests",
    "prompt": "Add unit tests for the authentication module",
    "state": "COMPLETED",
    "url": "https://jules.google/session/1234567",
    "outputs": [
      {
        "pullRequest": {
          "title": "Add auth unit tests",
          "url": "https://github.com/myorg/myrepo/pull/42",
          "description": "This PR adds comprehensive unit tests for the auth module."
        }
      }
    ],
    "createTime": "2023-10-27T10:00:00Z",
    "updateTime": "2023-10-27T10:45:00Z"
  }
  ```

#### `jules_delete_session`

Deletes a coding session. This cannot be undone.

- **Arguments**:
  - `sessionId` (string, required): The ID of the session.

#### `jules_send_message`

Sends a message to an active session. Use this to provide feedback, answer Jules's questions, or change instructions mid-session.

- **Arguments**:
  - `sessionId` (string, required): The ID of the session.
  - `prompt` (string, required): Your message.

#### `jules_approve_plan`

Approves a pending plan. Required if `requirePlanApproval` was set to `true` during session creation. Once approved, Jules begins execution.

- **Arguments**:
  - `sessionId` (string, required): The ID of the session.

### Activity Tools

#### `jules_list_activities`

Lists all activities (events, plan generation, code changes, messages) for a session.

- **Arguments**:
  - `sessionId` (string, required): The ID of the session.
  - `pageSize` (number, optional): Results per page. Must be between `1` and `100`. Defaults to the schema-defined default when omitted.
  - `pageToken` (string, optional): Pagination token.
  - `response_format` (string, optional): Response format for the returned activities.

#### `jules_get_activity`

Gets detailed information about a specific activity. This is how you view code diffs (`changeSet`), bash outputs, or full plan details.

- **Arguments**:
  - `sessionId` (string, required): The ID of the session.
  - `activityId` (string, required): The activity ID.
  - `response_format` (string, optional): Controls the format of the returned activity details.

### Source Tools

#### `jules_list_sources`

Lists GitHub repositories connected to your Jules account via the Jules web UI.

- **Arguments**:
  - `filter` (string, optional): Filter by name (e.g., `name=sources/github-owner-repo`).
  - `pageSize` (number, optional): Results per page.
  - `pageToken` (string, optional): Pagination token.
  - `response_format` (string, optional): Response format for the returned data.

#### `jules_get_source`

Gets details about a specific connected repository, including all available branches.

- **Arguments**:
  - `sourceId` (string, required): The source ID (e.g., `github-owner-repo`). This is not the `sources/...` resource name used by `sourceContext.source`.
  - `response_format` (string, optional): Controls the response format returned by the tool.

## Real-World Examples

### Complete Workflow: Implementing a Feature

1.  **Find the repository ID**:
    `jules_list_sources()` -> returns `sources/github-acme-webapp`.

2.  **Start the session**:
    `jules_create_session(prompt="Add a search bar to the header", sourceContext={"source": "sources/github-acme-webapp"}, requirePlanApproval=true)`
    -> returns sessionId `7890`.

3.  **Check for a plan**:
    `jules_list_activities(sessionId="7890")`. Look for an activity with "Plan Generated".

4.  **Review and approve**:
    `jules_get_activity(sessionId="7890", activityId="plan_activity_id")`.
    If the plan looks good: `jules_approve_plan(sessionId="7890")`.

5.  **Monitor progress**:
    Periodically call `jules_get_session(sessionId="7890")` to check `state` or `jules_list_activities` to see recent actions.

6.  **Review the result**:
    Once state is `COMPLETED`, check `jules_get_session` for the Pull Request URL.

## Session States

| State                    | Description                                          |
| :----------------------- | :--------------------------------------------------- |
| `QUEUED`                 | Session created, waiting for processing.             |
| `PLANNING`               | Jules is analyzing the codebase and creating a plan. |
| `AWAITING_PLAN_APPROVAL` | Plan is ready and requires your approval to proceed. |
| `AWAITING_USER_FEEDBACK` | Jules has a question or needs more information.      |
| `IN_PROGRESS`            | Jules is executing the task/plan.                    |
| `PAUSED`                 | Execution has been temporarily halted.               |
| `COMPLETED`              | Task finished successfully (check for PR link).      |
| `FAILED`                 | Task failed. Check activities for error details.     |

## Troubleshooting

| Error                     | Meaning           | Resolution                                                                                               |
| :------------------------ | :---------------- | :------------------------------------------------------------------------------------------------------- |
| **401 Unauthorized**      | Invalid API Key   | Check your `JULES_API_KEY` environment variable and ensure it's valid.                                   |
| **403 Forbidden**         | Permission Denied | Ensure your API key has access to the requested resource or repository.                                  |
| **404 Not Found**         | Resource Missing  | Verify the `sessionId`, `activityId`, or `sourceId` is correct.                                          |
| **429 Too Many Requests** | Rate Limited      | You've exceeded the API rate limit. Wait a few minutes before retrying.                                  |
| **500 / 503**             | Jules API Error   | The Jules service is experiencing issues. Try again later or check [Jules Status](https://jules.google). |
| **ECONNREFUSED**          | Network Error     | Check your internet connection or firewall settings.                                                     |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Type-check without emitting files
npm run check

# Lint source files
npm run lint

# Check formatting
npm run format:check

# Run the test suite
npm test

# Development mode (watch)
npm run dev
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

1.  **Check Issues**: Look for existing issues or open a new one to discuss your proposed change.
2.  **Local Setup**: Follow the [Installation](#installation) steps.
3.  **Topic Branches**: Always work on a new branch (`git checkout -b feature/my-feature`).
4.  **Testing**: If adding a tool, ensure it's tested. Run `npm run check` and `npm run lint`.
5.  **Documentation**: Update the README if you change tool behavior or add new features.
6.  **Pull Requests**: Submit a PR with a clear description of the changes.

Project hygiene and community documents:

- [CHANGELOG.md](CHANGELOG.md)
- [SECURITY.md](SECURITY.md)
- [LICENSE](LICENSE)

## API Reference

Based on [Jules REST API](https://jules.google/docs/api/reference/):

- Base URL: `https://jules.googleapis.com/v1alpha`
- Authentication: `x-goog-api-key` header
- Full documentation: [jules.google/docs/api/reference](https://jules.google/docs/api/reference/)

## License

MIT
