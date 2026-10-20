/**
 * Security regression tests for the HTTP transport (GHSA-rgh8-8cv7-4rj9).
 *
 * Run with: npm test  (builds first, then runs `node --test test/`)
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { after, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { resolveHttpSecurityConfig } = await import("../dist/http-server.js");

const ENTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "index.js"
);

describe("resolveHttpSecurityConfig", () => {
  it("defaults to a loopback bind with Host and Origin protection", () => {
    const config = resolveHttpSecurityConfig({});

    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 3000);
    assert.deepEqual(config.allowedHostnames, [
      "localhost",
      "127.0.0.1",
      "[::1]",
    ]);
    assert.deepEqual(config.allowedOrigins, [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
    ]);
    assert.equal(config.authToken, undefined);
  });

  it("rejects a wildcard bind without a token and an allowed-host list", () => {
    assert.throws(
      () => resolveHttpSecurityConfig({ HOST: "0.0.0.0" }),
      /MCP_AUTH_TOKEN must be set/
    );
  });

  it("rejects a wildcard bind with a token but no allowed hosts", () => {
    assert.throws(
      () => resolveHttpSecurityConfig({ HOST: "0.0.0.0", MCP_AUTH_TOKEN: "x" }),
      /ALLOWED_HOSTS must list the hostnames/
    );
  });

  it("allows a wildcard bind once a token and allowed hosts are provided", () => {
    const config = resolveHttpSecurityConfig({
      HOST: "0.0.0.0",
      MCP_AUTH_TOKEN: "x",
      ALLOWED_HOSTS: "mcp.internal, 127.0.0.1",
    });

    assert.equal(config.host, "0.0.0.0");
    assert.deepEqual(config.allowedHostnames, ["mcp.internal", "127.0.0.1"]);
    assert.equal(config.authToken, "x");
  });

  it("requires a token for any non-loopback bind", () => {
    assert.throws(
      () => resolveHttpSecurityConfig({ HOST: "192.168.1.10" }),
      /MCP_AUTH_TOKEN must be set/
    );
  });

  it("permits an insecure bind only when explicitly acknowledged", () => {
    const config = resolveHttpSecurityConfig({
      HOST: "0.0.0.0",
      ALLOW_INSECURE_HTTP: "true",
    });

    assert.equal(config.host, "0.0.0.0");
    assert.deepEqual(config.allowedHostnames, []);
  });

  it("honours an explicit allowed-origins override", () => {
    const config = resolveHttpSecurityConfig({
      ALLOWED_ORIGINS: "https://client.example,https://other.example",
    });

    assert.deepEqual(config.allowedOrigins, [
      "https://client.example",
      "https://other.example",
    ]);
  });

  it("rejects an invalid port", () => {
    assert.throws(() => resolveHttpSecurityConfig({ PORT: "not-a-port" }));
    assert.throws(() => resolveHttpSecurityConfig({ PORT: "70000" }));
    assert.throws(() => resolveHttpSecurityConfig({ PORT: "3000oops" }));
    assert.throws(() => resolveHttpSecurityConfig({ PORT: "1.5" }));
    assert.throws(() => resolveHttpSecurityConfig({ PORT: "0" }));
    assert.throws(() => resolveHttpSecurityConfig({ PORT: "-1" }));
  });

  it("falls back to the default port when PORT is unset or blank", () => {
    assert.equal(resolveHttpSecurityConfig({}).port, 3000);
    assert.equal(resolveHttpSecurityConfig({ PORT: "" }).port, 3000);
    assert.equal(resolveHttpSecurityConfig({ PORT: " " }).port, 3000);
  });

  it("treats the IPv6 loopback bind address as local", () => {
    const config = resolveHttpSecurityConfig({ HOST: "::1" });

    assert.equal(config.host, "::1");
    assert.deepEqual(config.allowedHostnames, [
      "localhost",
      "127.0.0.1",
      "[::1]",
    ]);
    assert.ok(config.allowedOrigins.includes("http://[::1]:3000"));
  });

  it("brackets IPv6 bind addresses when building the default origin", () => {
    const config = resolveHttpSecurityConfig({
      HOST: "2001:db8::1",
      MCP_AUTH_TOKEN: "x",
    });

    assert.ok(config.allowedOrigins.includes("http://[2001:db8::1]:3000"));
    assert.ok(
      !config.allowedOrigins.some((origin) => origin.includes("::1:3000"))
    );
  });

  it("refuses a non-local allowlisted hostname on a tokenless loopback bind", () => {
    assert.throws(
      () => resolveHttpSecurityConfig({ ALLOWED_HOSTS: "mcp.internal" }),
      /Refusing to allow non-local hostnames/
    );
    assert.throws(
      () => resolveHttpSecurityConfig({ ALLOWED_HOSTS: "10.0.0.5" }),
      /Refusing to allow non-local hostnames/
    );
  });

  it("allows local allowlisted hostnames on a tokenless loopback bind", () => {
    const config = resolveHttpSecurityConfig({
      ALLOWED_HOSTS: "localhost,127.0.0.2,[::1],::1",
    });

    assert.deepEqual(config.allowedHostnames, [
      "localhost",
      "127.0.0.2",
      "[::1]",
      "::1",
    ]);
  });

  it("allows a non-local allowlisted hostname when a token is set", () => {
    const config = resolveHttpSecurityConfig({
      ALLOWED_HOSTS: "mcp.internal",
      MCP_AUTH_TOKEN: "x",
    });

    assert.deepEqual(config.allowedHostnames, ["mcp.internal"]);
    assert.equal(config.authToken, "x");
  });
});

async function startServer(env) {
  const port = 4500 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, [ENTRY, "--http"], {
    env: { ...process.env, JULES_API_KEY: "dummy", PORT: String(port), ...env },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early: ${stderr}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return { child, port };
      }
    } catch {
      // not listening yet
    }
    await delay(100);
  }

  child.kill();
  throw new Error(`server did not become ready: ${stderr}`);
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
  });
}

async function mcpPost(port, { authorization } = {}) {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

/**
 * Raw request used for headers that fetch refuses to send (Origin) or
 * overwrites (Host).
 */
function rawMcpPost(port, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/mcp",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      }
    );
    request.on("error", reject);
    request.end(body);
  });
}

describe("HTTP transport enforcement", () => {
  const children = [];

  after(async () => {
    await Promise.all(children.map(stopServer));
  });

  it("rejects a cross-origin request and a forged Host header", async () => {
    const { child, port } = await startServer({});
    children.push(child);

    const evilOrigin = await rawMcpPost(port, {
      Origin: "https://evil.example",
    });
    assert.equal(evilOrigin, 403);

    const forgedHost = await rawMcpPost(port, { Host: "attacker.example" });
    assert.equal(forgedHost, 403);

    const allowed = await rawMcpPost(port, {
      Origin: `http://127.0.0.1:${port}`,
    });
    assert.equal(allowed, 200);
  });

  it("requires the bearer token when MCP_AUTH_TOKEN is set", async () => {
    const { child, port } = await startServer({ MCP_AUTH_TOKEN: "s3cret" });
    children.push(child);

    const unauthenticated = await mcpPost(port);
    assert.equal(unauthenticated.status, 401);

    const wrongToken = await mcpPost(port, { authorization: "Bearer wrong" });
    assert.equal(wrongToken.status, 401);

    const authenticated = await mcpPost(port, {
      authorization: "Bearer s3cret",
    });
    assert.equal(authenticated.status, 200);
  });

  it("refuses to start an unauthenticated non-loopback listener", async () => {
    const child = spawn(process.execPath, [ENTRY, "--http"], {
      env: {
        ...process.env,
        JULES_API_KEY: "dummy",
        PORT: "4999",
        HOST: "0.0.0.0",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const exitCode = await new Promise((resolve) =>
      child.once("exit", resolve)
    );

    assert.equal(exitCode, 1);
    assert.match(stderr, /Refusing to expose an insecure MCP endpoint/);
  });
});
