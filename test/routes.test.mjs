/**
 * Route regression tests for the Infinihash KYT TypeScript SDK.
 *
 * Why this file exists
 * --------------------
 * Two intelligence methods shipped pointing at routes that do not exist:
 *
 *   intel.lookup()            GET /api/v1/lookup/{address}    -> 404
 *   intel.recentScreenings()  GET /api/v1/recent-screenings   -> 404
 *
 * The correct routes are namespaced under /api/v1/intel/. A 404 on an
 * intelligence lookup is the worst possible failure mode for a compliance
 * tool: to the caller it is indistinguishable from "this address is clean".
 * These tests make that class of bug impossible to reintroduce silently.
 *
 * Layers:
 *   1. Exact-literal assertions for the two routes that were broken
 *      (offline, always run).
 *   2. A sweep of every /api/v1 literal in src/index.ts against the live
 *      OpenAPI document (network; skipped if the spec is unreachable so a
 *      flaky network never reds the build, but a *mismatch* always fails).
 *
 * Runs on plain Node 18+ via `npm test` — no test framework dependency.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "..", "src", "index.ts"), "utf8");
const SPEC_URL = "https://kyt.infinihash.com/api/v1/openapi.json";

// Every "/api/v1/..." literal in the client: quoted or template literal.
const ROUTE_RE = /["'`](\/api\/v1\/[^"'`]*)["'`]/g;

// `${screeningId}` in the SDK, `{screening_id}` in the spec: collapse both to
// a single placeholder so the comparison is about the route shape.
const normalise = (p) =>
  p.replace(/\$\{[^}]*\}/g, "{}").replace(/\{[^{}]*\}/g, "{}").replace(/\/$/, "");

function sdkRoutes() {
  return new Set([...SRC.matchAll(ROUTE_RE)].map((m) => normalise(m[1])));
}

// ---------------------------------------------------------------------------
// 1. The two routes that were broken. Exact strings, no network needed.
// ---------------------------------------------------------------------------

test("intel.lookup is namespaced under /api/v1/intel", () => {
  assert.ok(
    SRC.includes("`/api/v1/intel/lookup/${address}`"),
    "intel.lookup() must call /api/v1/intel/lookup/${address}"
  );
});

test("intel.recentScreenings is namespaced under /api/v1/intel", () => {
  assert.ok(
    SRC.includes('"/api/v1/intel/recent-screenings"'),
    "intel.recentScreenings() must call /api/v1/intel/recent-screenings"
  );
});

test("no un-namespaced intel routes anywhere in the client", () => {
  for (const dead of ["/api/v1/lookup/", "/api/v1/recent-screenings"]) {
    // The fixed routes contain the dead ones as substrings, so strip the
    // namespaced form first and only then look for what is left over.
    const stripped = SRC.split("/api/v1/intel/").join("/api/v1/intel-NS/");
    assert.ok(
      !stripped.includes(dead),
      `dead route ${dead} is back in src/index.ts — it returns 404, which a ` +
        `caller reads as "address is clean"`
    );
  }
});

test("route literals are well formed", () => {
  const routes = sdkRoutes();
  assert.ok(routes.size > 0, "no /api/v1 routes found — regex broke?");
  for (const r of routes) {
    assert.ok(r.startsWith("/api/v1/"), r);
    assert.ok(!r.includes(" "), r);
  }
});

// ---------------------------------------------------------------------------
// 2. Every route in the SDK must exist in the live OpenAPI document.
// ---------------------------------------------------------------------------

test("every SDK route exists in the live OpenAPI spec", async (t) => {
  let spec;
  try {
    // The edge blocks default bot user-agents, so send a real one.
    const res = await fetch(SPEC_URL, {
      headers: { "User-Agent": "infinihash-kyt-sdk-tests/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    spec = await res.json();
  } catch (err) {
    t.skip(`live OpenAPI spec unreachable (${err.message}); skipping sweep`);
    return;
  }

  const specPaths = new Set(Object.keys(spec.paths ?? {}).map(normalise));
  assert.ok(specPaths.size > 0, "OpenAPI document has no paths");

  const missing = [...sdkRoutes()].filter((r) => !specPaths.has(r)).sort();
  assert.deepEqual(
    missing,
    [],
    `SDK calls routes the API does not serve: ${missing.join(", ")}\nLive spec: ${SPEC_URL}`
  );
});
