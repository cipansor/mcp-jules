import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * The published package version.
 *
 * Read from `package.json` rather than duplicated as a literal, so the npm
 * manifest, the MCP server handshake and the `/health` response cannot drift
 * apart. `package.json` is always present in the published tarball, and this
 * file resolves to the package root from `dist/`.
 */
export const VERSION: string = (
  require("../package.json") as { version: string }
).version;
