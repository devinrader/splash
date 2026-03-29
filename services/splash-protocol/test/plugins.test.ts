import test from "node:test";
import assert from "node:assert/strict";
import { discoverPlugins } from "../src/plugins/index.js";

test("discoverPlugins exposes documented plugin identities", () => {
  const registry = discoverPlugins();
  const ids = registry.all().map((plugin) => plugin.id).sort();

  assert.deepEqual(ids, [
    "hayward_omnilogic_local",
    "jandy_aqualink_rs",
    "pentair_easytouch"
  ]);
});
