import test from "node:test";
import assert from "node:assert/strict";
import { EnvProtocolSelectionProvider } from "../src/provider.js";

test("env provider returns unavailable when selection env is absent", async () => {
  const provider = new EnvProtocolSelectionProvider({});

  const result = await provider.getSelection(new AbortController().signal);

  assert.equal(result.kind, "unavailable");
});

test("env provider returns parsed selection when env is configured", async () => {
  const provider = new EnvProtocolSelectionProvider({
    PROTOCOL_POOL_ID: "pool-1",
    PROTOCOL_SELECTED_PLUGIN: "pentair_easytouch",
    PROTOCOL_SELECTED_CONFIG_JSON: "{\"controller_type\":\"easytouch\"}"
  });

  const result = await provider.getSelection(new AbortController().signal);

  assert.equal(result.kind, "ok");
  if (result.kind !== "ok") {
    return;
  }

  assert.equal(result.selection.poolId, "pool-1");
  assert.equal(result.selection.protocolPlugin, "pentair_easytouch");
  assert.deepEqual(result.selection.protocolConfig, {
    controller_type: "easytouch"
  });
});

test("env provider rejects malformed config json", async () => {
  const provider = new EnvProtocolSelectionProvider({
    PROTOCOL_POOL_ID: "pool-1",
    PROTOCOL_SELECTED_PLUGIN: "pentair_easytouch",
    PROTOCOL_SELECTED_CONFIG_JSON: "[1,2,3]"
  });

  const result = await provider.getSelection(new AbortController().signal);

  assert.equal(result.kind, "invalid");
});
