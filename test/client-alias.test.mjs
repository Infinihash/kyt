import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sdk = require("../dist/index.js");

test("Client is an alias of KYT", () => {
  assert.equal(sdk.Client, sdk.KYT);
  assert.equal(sdk.default, sdk.KYT);
});

test("new Client({apiKey}) constructs", () => {
  const c = new sdk.Client({ apiKey: "ih_kyt_test" });
  assert.equal(c.baseUrl, "https://kyt.infinihash.com");
  assert.equal(typeof c.screen.address, "function");
});
