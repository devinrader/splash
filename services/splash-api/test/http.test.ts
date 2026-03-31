import test from "node:test";
import assert from "node:assert/strict";
import { HttpRequestError, corsHeaders, readBundleCompareRequest } from "../src/http.js";

test("corsHeaders echoes browser origin when present", () => {
  const headers = corsHeaders({
    headers: {
      origin: "http://127.0.0.1:3000"
    }
  });

  assert.equal(headers["access-control-allow-origin"], "http://127.0.0.1:3000");
  assert.match(headers["access-control-allow-methods"], /OPTIONS/);
  assert.equal(headers["access-control-allow-headers"], "content-type");
});

test("corsHeaders falls back to wildcard when origin is absent", () => {
  const headers = corsHeaders({
    headers: {}
  });

  assert.equal(headers["access-control-allow-origin"], "*");
});

test("readBundleCompareRequest rejects malformed bundle compare requests", () => {
  assert.throws(
    () =>
      readBundleCompareRequest({
        left_bundle_id: "bundle-1",
        right_bundle_id: "bundle-2"
      }),
    (error: unknown) => {
      assert.ok(error instanceof HttpRequestError);
      assert.match(error.message, /baseline_bundle_id/);
      return true;
    }
  );
});
