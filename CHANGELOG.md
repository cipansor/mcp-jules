# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-10-20

### Changed

- The package is published to npm as `mcp-jules`, and installs a `mcp-jules`
  command, so it can be run with `npx -y mcp-jules`.
- The release workflow publishes to npm with provenance, in addition to
  attaching the tarball to the GitHub release.
- The server version is read from `package.json` at runtime instead of being
  duplicated as a literal, so the npm manifest, the MCP handshake and `/health`
  cannot report different versions.

### Fixed

- The release workflow no longer overrides the job's `contents: write`
  permission, which had stopped `action-gh-release` from creating the GitHub
  release and therefore blocked the npm publish job that depends on it.
- The release workflow now fails early when the pushed tag does not match the
  `package.json` version, so npm and GitHub cannot be released under different
  versions.

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
- `PORT` values such as `3000oops` or `1.5` were silently truncated by
  `parseInt` and bound an unintended port; they are now rejected.
- `HOST=::1` (the IPv6 loopback bind form) was treated as a remote bind,
  requiring a token and producing the invalid origin `http://::1:3000`. IPv6
  bind addresses are now recognized as loopback and bracketed in origins.
- On a tokenless loopback bind, `ALLOWED_HOSTS` accepted hostnames that
  resolve elsewhere, which reintroduced DNS rebinding. Such hostnames are now
  rejected unless `MCP_AUTH_TOKEN` is set.

### Changed

- HTTP transport setup moved from `src/index.ts` to `src/http-server.ts`.
- Pinned GitHub Actions to full commit SHAs to satisfy the repository's
  action-pinning policy (CI failed on every PR without this).

## [0.1.0] - 2026-05-07

### Added

- Initial public release of the Jules MCP Server.
- MCP tools for session, activity, and source management.
- stdio and HTTP transports.
