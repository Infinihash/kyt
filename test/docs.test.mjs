/**
 * Audit 2026-11 C-2 / C-3: key docs must point self-serve users at a page
 * they can open, and show the key format the engine actually mints.
 *
 * - /kyt/admin/api-keys renders "Admin role required." for non-admins, and
 *   signup always creates role="user", so every self-serve user hit a wall.
 *   The self-serve page is /kyt/settings/api-keys.
 * - The engine mints `kyt_…` keys (clearauthority-kyt app/auth/api_keys.py);
 *   `ih_kyt_…` does not exist.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["src/index.ts", "README.md"].map((f) => [f, readFileSync(join(ROOT, f), "utf8")]);

test("key docs point at /kyt/settings/api-keys, never /kyt/admin", () => {
  for (const [f, s] of FILES) {
    assert.ok(!s.includes("/kyt/admin"), `${f} still links /kyt/admin`);
  }
  assert.ok(FILES.some(([, s]) => s.includes("https://kyt.infinihash.com/kyt/settings/api-keys")));
});

test("key format examples use kyt_, not ih_kyt_", () => {
  for (const [f, s] of FILES) {
    assert.ok(!s.includes("ih_kyt_"), `${f} still shows ih_kyt_ keys`);
  }
});
