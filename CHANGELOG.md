# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Repository maintenance files and GitHub automation scaffolding.
- Security regression tests for the HTTP transport, run with `npm test`.
- HTTP transport environment variables: `HOST`, `MCP_AUTH_TOKEN`,
  `ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, and `ALLOW_INSECURE_HTTP`.

### Security

- Fix GHSA-rgh8-8cv7-4rj9: the HTTP transport is no longer an unauthenticated
  endpoint bound to all interfaces.
  - Binds `127.0.0.1` by default and refuses a non-loopback bind unless
    `MCP_AUTH_TOKEN` is set and `ALLOWED_HOSTS` lists the permitted hostnames.
  - Validates the `Host` header and rejects requests whose `Origin` is not
    allowed, enabling DNS-rebinding protection on the MCP transport.
  - Supports optional bearer-token authentication on `/mcp`.

### Fixed

- HTTP transport returned `400 Parse error: crypto is not defined` for every
  request on Node 18, where the MCP SDK's use of the `crypto` global is
  unavailable. A `node:crypto` WebCrypto fallback is now installed when the
  global is missing, so the supported Node 18 runtime works.

### Changed

- HTTP transport setup moved from `src/index.ts` to `src/http-server.ts`.
- Pinned GitHub Actions to full commit SHAs to satisfy the repository's
  action-pinning policy (CI failed on every PR without this).

## [0.1.0] - 2026-05-07

### Added

- Initial public release of the Jules MCP Server.
- MCP tools for session, activity, and source management.
- stdio and HTTP transports.
