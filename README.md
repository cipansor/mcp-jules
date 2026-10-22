# mcp-jules

[![CI](https://github.com/cipansor/mcp-jules/actions/workflows/ci.yml/badge.svg)](https://github.com/cipansor/mcp-jules/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mcp-jules?style=flat-square)](https://www.npmjs.com/package/mcp-jules)
[![npm downloads](https://img.shields.io/npm/dm/mcp-jules?style=flat-square)](https://www.npmjs.com/package/mcp-jules)
[![node](https://img.shields.io/node/v/mcp-jules?style=flat-square)](https://www.npmjs.com/package/mcp-jules)
[![license](https://img.shields.io/npm/l/mcp-jules?style=flat-square)](LICENSE)

MCP (Model Context Protocol) server for [Google Jules](https://jules.google) - the AI coding agent. This server enables LLMs like Claude to interact with Jules API, creating and managing coding sessions programmatically.

> **Unofficial project.** This is an independent, community-built client for the
> Jules API. It is not affiliated with, sponsored by, or endorsed by Google LLC.
> "Google" and "Jules" are trademarks of Google LLC. The Jules API is an alpha
> release and its specifications may change without notice.

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Environment variables](#environment-variables)
  - [HTTP security variables](#http-security-variables)
- [Security](#security)
  - [HTTP transport hardening](#http-transport-hardening)
- [Usage](#usage)
  - [With Claude Desktop (stdio transport)](#with-claude-desktop-stdio-transport)
  - [With Claude Code (CLI)](#with-claude-code-cli)
  - [Command Line](#command-line)
  - [HTTP Endpoints](#http-endpoints)
- [Tool Reference](#tool-reference)
  - [Session Tools](#session-tools)
  - [Activity Tools](#activity-tools)
  - [Source Tools](#source-tools)
- [Real-World Examples](#real-world-examples)
- [Session States](#session-states)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [Releasing](#releasing)
- [API Reference](#api-reference)
- [License](#license)

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

`mcp-jules` is published on npm as [`mcp-jules`](https://www.npmjs.com/package/mcp-jules)
and installs a `mcp-jules` command.

```bash
# Install globally
npm install -g mcp-jules

# Or run it without installing (recommended for MCP clients)
npx -y mcp-jules --help
```

The package requires **Node.js 18 or newer** and declares no post-install
scripts. `npx -y` is the most common way to run it, because MCP clients start the
server as a child process.

### From source

```bash
git clone https://github.com/cipansor/mcp-jules
cd mcp-jules
npm install
npm run build
node dist/index.js --help
```

## Quick Start

Three steps from zero to a working server:

1.  **Get an API key.** Create one at
    [jules.google.com/settings](https://jules.google.com/settings) and make sure
    at least one GitHub repository is connected to Jules in the Jules web UI.
2.  **Export the key.** The server refuses to start without it:
    ```bash
    export JULES_API_KEY="your-api-key-here"
    ```
3.  **Register the server with your MCP client.** For Claude Desktop, add the
    `mcpServers` entry shown in [Usage](#with-claude-desktop-stdio-transport).

Then ask your client to call `jules_list_sources` - if it returns your
repositories, the wiring works.

## Configuration

### Environment variables

| Variable        | Required | Default     | Description                                                                  |
| :-------------- | :------- | :---------- | :--------------------------------------------------------------------------- |
| `JULES_API_KEY` | Yes      | -           | Jules API key. The server exits with an error when it is missing.            |
| `TRANSPORT`     | No       | stdio       | Set to `http` to use the HTTP transport instead of stdio (same as `--http`). |
| `HOST`          | No       | `127.0.0.1` | HTTP bind address. Only used by the HTTP transport.                          |
| `PORT`          | No       | `3000`      | HTTP port. Only used by the HTTP transport. Invalid values are rejected.     |

Set the key as an environment variable:

```bash
export JULES_API_KEY="your-api-key-here"
```

The key is sent to the Jules API in the `x-goog-api-key` header and is never
written to disk by this server.

### HTTP security variables

These apply only to the HTTP transport. See
[HTTP transport hardening](#http-transport-hardening) for how they interact.

| Variable              | Default          | Description                                                                                     |
| :-------------------- | :--------------- | :---------------------------------------------------------------------------------------------- |
| `MCP_AUTH_TOKEN`      | unset            | When set, `/mcp` requires `Authorization: Bearer <token>`. Mandatory for any non-loopback bind. |
| `ALLOWED_HOSTS`       | unset            | Comma-separated `Host` header allowlist. Required when binding `0.0.0.0` or `::`.               |
| `ALLOWED_ORIGINS`     | loopback origins | Comma-separated `Origin` allowlist. Requests from unlisted origins get `403`.                   |
| `ALLOW_INSECURE_HTTP` | unset            | Set to `true` to permit an unauthenticated non-loopback bind. Not recommended.                  |

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
  npx mcp-jules --http
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
      "command": "npx",
      "args": ["-y", "mcp-jules"],
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
claude mcp add jules --env JULES_API_KEY=your-api-key-here -- npx -y mcp-jules
```

### Command Line

```bash
# Run with stdio transport
JULES_API_KEY=your-key npx mcp-jules

# Run with HTTP transport (binds 127.0.0.1 by default)
JULES_API_KEY=your-key npx mcp-jules --http

# Custom port for HTTP
JULES_API_KEY=your-key PORT=8080 npx mcp-jules --http

# Expose on a trusted LAN (token + explicit host allowlist required)
JULES_API_KEY=your-key HOST=0.0.0.0 MCP_AUTH_TOKEN=your-token \
  ALLOWED_HOSTS=mcp.internal ALLOWED_ORIGINS=https://mcp.internal \
  npx mcp-jules --http

# Show help
npx mcp-jules --help
```

See [HTTP transport hardening](#http-transport-hardening) for the full list of
security-related environment variables.

### HTTP Endpoints

The HTTP transport exposes exactly two routes:

| Route     | Method | Auth                                    | Description                                                                     |
| :-------- | :----- | :-------------------------------------- | :------------------------------------------------------------------------------ |
| `/mcp`    | POST   | Bearer token if `MCP_AUTH_TOKEN` is set | MCP streamable-HTTP endpoint. This is what MCP clients connect to.              |
| `/health` | GET    | none                                    | Liveness probe. Returns `{"status":"ok","server":"mcp-jules","version":"..."}`. |

The version in `/health` is read from `package.json` at runtime, so it always
matches the published npm version. `/health` is intentionally unauthenticated so
a container orchestrator can probe it without a token; it exposes no session data.

```bash
# Start the HTTP transport
JULES_API_KEY=your-key npx mcp-jules --http

# Probe liveness
curl http://127.0.0.1:3000/health
```

## Tool Reference

The server exposes ten tools across three groups. Inputs are validated with a
strict schema, so an unknown argument is rejected rather than ignored.

| Tool                    | Group      | `response_format` | Paginated |
| :---------------------- | :--------- | :---------------- | :-------- |
| `jules_create_session`  | Sessions   | yes               | no        |
| `jules_list_sessions`   | Sessions   | yes               | yes       |
| `jules_get_session`     | Sessions   | yes               | no        |
| `jules_delete_session`  | Sessions   | no                | no        |
| `jules_send_message`    | Sessions   | no                | no        |
| `jules_approve_plan`    | Sessions   | no                | no        |
| `jules_list_activities` | Activities | yes               | yes       |
| `jules_get_activity`    | Activities | yes               | no        |
| `jules_list_sources`    | Sources    | yes               | yes       |
| `jules_get_source`      | Sources    | yes               | no        |

Every tool that accepts `response_format` defaults to `markdown` and also
accepts `json`. Paginated tools accept `pageSize` (1-100, default 20) and
`pageToken`, and report whether more results are available. In markdown output,
`jules_get_activity` truncates long artifact bodies — git patches at 5,000
characters and bash output at 2,000 characters — appending `... [truncated]`.
JSON output is never truncated.

### Session Tools

#### `jules_create_session`

Creates a new coding session where Jules executes a task on a repository.

- **Arguments**:
  - `prompt` (string, required): Task description. Max 10,000 characters.
  - `sourceContext` (object, required): Repository info (e.g., `{ "source": "sources/github-owner-repo", "githubRepoContext": { "startingBranch": "main" } }`). `githubRepoContext` is optional.
  - `title` (string, optional): Session title. Max 200 characters.
  - `requirePlanApproval` (boolean, optional): If Jules should wait for plan approval.
  - `automationMode` (string, optional): Use `AUTO_CREATE_PR` to automatically create a PR on completion.
  - `response_format` (string, optional): Response format, either `markdown` (default) or `json`.

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

- **Note**: in markdown output, a git patch is truncated to 5,000 characters
  and bash output to 2,000 characters, each ending with `... [truncated]`. Use
  `response_format: "json"` to receive the full, untruncated payload.

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

| Error / Symptom                                          | Meaning                                                                                          | Resolution                                                                                               |
| :------------------------------------------------------- | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `Error: JULES_API_KEY environment variable is required.` | Missing API key                                                                                  | Export `JULES_API_KEY` before starting the server. The process exits immediately without it.             |
| **401 Unauthorized**                                     | Invalid API Key                                                                                  | Check your `JULES_API_KEY` environment variable and ensure it's valid.                                   |
| **403 Forbidden**                                        | Permission Denied                                                                                | Ensure your API key has access to the requested resource or repository.                                  |
| **404 Not Found**                                        | Resource Missing                                                                                 | Verify the `sessionId`, `activityId`, or `sourceId` is correct.                                          |
| **429 Too Many Requests**                                | Rate Limited                                                                                     | You've exceeded the API rate limit. Wait a few minutes before retrying.                                  |
| **500 / 503**                                            | Jules API Error                                                                                  | The Jules service is experiencing issues. Try again later or check [Jules Status](https://jules.google). |
| `Network error - unable to reach Jules API`              | DNS / connectivity                                                                               | Check your internet connection, DNS, or proxy settings.                                                  |
| `Network error: ...`                                     | Transport failure                                                                                | Usually a timeout (`ECONNABORTED`) or a refused connection. Retry, then check firewall rules.            |
| `... [truncated]` at the end of output                   | A markdown artifact body exceeded its limit (5,000 chars for a git patch, 2,000 for bash output) | Re-run `jules_get_activity` with `response_format: "json"` for the untruncated payload.                  |
| `403` from the HTTP transport                            | Origin not allowed                                                                               | Add the client origin to `ALLOWED_ORIGINS`.                                                              |
| Refuses to bind a non-loopback `HOST`                    | Hardening guardrail                                                                              | Set both `MCP_AUTH_TOKEN` and `ALLOWED_HOSTS` before binding `0.0.0.0`.                                  |
| Server exits with an invalid `PORT`                      | Bad configuration                                                                                | `PORT` must be an integer between 1 and 65535.                                                           |

Errors are returned to the MCP client as tool errors; the original Jules API
status code is preserved in the message as `Jules API Error (<status>): ...`.

## Development

```bash
# Install dependencies
npm install

# Build (emits dist/ from src/)
npm run build

# Type-check without emitting files
npm run check

# Lint source files
npm run lint

# Check formatting
npm run format:check

# Run the test suite (Node's built-in test runner)
npm test

# Development mode (watch)
npm run dev
```

The build compiles TypeScript to `dist/`, which is what the `mcp-jules` bin and
the npm tarball ship. `dist/` is generated, so edit files under `src/` only. The
CI workflow runs the format check, lint, type-check and tests on every push and
pull request.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

1.  **Check Issues**: Look for existing issues or open a new one to discuss your proposed change.
2.  **Local Setup**: Follow the [Installation](#installation) steps.
3.  **Topic Branches**: Always work on a new branch (`git checkout -b feature/my-feature`).
4.  **Testing**: If adding a tool, ensure it's tested. Run `npm run check` and `npm run lint`.
5.  **Documentation**: Update the README if you change tool behavior or add new features.
6.  **Pull Requests**: Submit a PR with a clear description of the changes.

Project hygiene and community documents:

- [SECURITY.md](SECURITY.md)
- [LICENSE](LICENSE)

## Releasing

Releases are driven by a git tag. The tag, the `package.json` version and the
npm version must all agree, so the version is bumped first and the tag is pushed
at the merge commit:

1.  Bump the version: `npm version <major.minor.patch> --no-git-tag-version`.
2.  Merge to `main`, then tag the merge commit `v<version>` and push the tag.

Pushing a `v*.*.*` tag runs the [release workflow](.github/workflows/release.yml),
which verifies the tag matches `package.json`, builds, attaches the tarball to a
GitHub release, and publishes to npm with provenance via Trusted Publishing.

### One-time npm setup

Publishing uses [Trusted Publishing](https://docs.npmjs.com/trusted-publishers),
so the release workflow authenticates with a short-lived OIDC token and **no
`NPM_TOKEN` secret is stored in the repository**. Trusted publishing can only be
attached to a package that already exists in the registry, so the package was
created once with a staged publish before the first tag-driven release.

**1. Bootstrap the package (already done for `mcp-jules`).** A brand-new package
is created with [staged publishing](https://docs.npmjs.com/staged-publishing),
which needs npm CLI >= 11.15.0 and Node >= 22.14.0:

```sh
npm stage publish --access public   # uploads the tarball to the stage queue
npm stage list                      # wait for status: staged, then copy the id
npm stage approve <stage-id>        # needs 2FA
```

Staging a package that does not exist yet creates a `0.0.0-stage` placeholder so
the name is reserved and the trusted publisher can be attached; the real version
goes live only after `npm stage approve`. Staging itself does **not** need 2FA,
which is why this path works from a token that cannot bypass 2FA - the
proof-of-presence is deferred to the interactive approve step. A direct
`npm publish` instead fails with
`403 ... Two-factor authentication or granular access token with bypass 2fa
enabled is required to publish packages.`

Bootstrap with a throwaway version (for example `0.0.1`) and leave the release
you want CI to ship unpublished: a published version cannot be published again,
so bootstrapping `0.2.0` would make the `v0.2.0` tag fail in the publish job.

**2. Add the trusted publisher.** On npmjs.com, open the `mcp-jules` package,
then **Settings → Trusted Publisher → GitHub Actions** and enter:

- Organization or user: `cipansor`
- Repository: `mcp-jules`
- Workflow filename: `release.yml` (the filename only, not the full path)
- Environment name: leave blank
- Allowed actions: enable direct `npm publish`, not stage-only. The release
  workflow runs `npm publish`, so a stage-only connection makes the publish job
  fail.

The identity fields are exact-match, so a wrong repository or workflow filename
is the usual cause of an `ENEEDAUTH` or `404` failure in the publish job. These
fields cannot be edited after the connection is created; delete and recreate the
connection to change them.

While you are there, set **Publishing access** to _Require two-factor
authentication and disallow bypass 2fa tokens_. Trusted publishers keep working
under that setting, because CI authenticates with OIDC rather than a long-lived
token.

## API Reference

Based on [Jules REST API](https://jules.google/docs/api/reference/):

- Base URL: `https://jules.googleapis.com/v1alpha`
- Authentication: `x-goog-api-key` header
- Full documentation: [jules.google/docs/api/reference](https://jules.google/docs/api/reference/)

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Copyright 2026 Yayasan Pesantren Cipansor and the mcp-jules contributors.

This is an independent project, not affiliated with, sponsored by, or endorsed by
Google LLC. "Google" and "Jules" are trademarks of Google LLC, used here only to
describe what this software interoperates with.
