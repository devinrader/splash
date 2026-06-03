import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpRequestError,
  corsHeaders,
  readBundleCompareRequest,
  readCustomNameIndex,
  readRawFrameRequest,
  readWatchSessionRequest
} from "../src/http.js";

test("corsHeaders echoes browser origin when present", () => {
  const headers = corsHeaders({
    headers: {
      origin: "http://127.0.0.1:3000"
    }
  });

  assert.equal(headers["access-control-allow-origin"], "http://127.0.0.1:3000");
  assert.match(headers["access-control-allow-methods"], /PUT/);
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

test("readRawFrameRequest rejects non-lowercase or odd-length hex", () => {
  assert.throws(
    () =>
      readRawFrameRequest({
        protocol_name: "pentair_easytouch",
        bytes_hex: "FF"
      }),
    (error: unknown) => {
      assert.ok(error instanceof HttpRequestError);
      assert.match(error.message, /even-length lowercase hex/);
      return true;
    }
  );
});

test("readWatchSessionRequest accepts serial-only watch filters", () => {
  const request = readWatchSessionRequest({
    label: "serial only",
    events: ["serial.rx.raw", "serial.tx.raw", "protocol.frame.buffered", "protocol.frame.unidentified", "serial.rx.raw"]
  });

  assert.equal(request.label, "serial only");
  assert.deepEqual(request.events, ["serial.rx.raw", "serial.tx.raw", "protocol.frame.buffered", "protocol.frame.unidentified"]);
});

test("readWatchSessionRequest rejects unsupported watch events", () => {
  assert.throws(
    () =>
      readWatchSessionRequest({
        events: ["serial.unknown"]
      }),
    (error: unknown) => {
      assert.ok(error instanceof HttpRequestError);
      assert.match(error.message, /unsupported/);
      return true;
    }
  );
});

test("readCustomNameIndex accepts explicit custom-name-bank indexes", () => {
  const request = readCustomNameIndex({
    name_index: 4
  });

  assert.equal(request.nameIndex, 4);
});

test("readCustomNameIndex rejects out-of-range indexes", () => {
  assert.throws(
    () =>
      readCustomNameIndex({
        name_index: 10
      }),
    (error: unknown) => {
      assert.ok(error instanceof HttpRequestError);
      assert.match(error.message, /between 0 and 9/);
      return true;
    }
  );
});
