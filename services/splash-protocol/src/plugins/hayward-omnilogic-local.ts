import type { ProtocolPlugin } from "./types.js";
import { ProtocolDecodeError } from "../protocol/types.js";

export const haywardOmniLogicLocalPlugin: ProtocolPlugin = {
  id: "hayward_omnilogic_local",
  status: "stub",
  version: "0.1.0",
  decodeFrame() {
    throw new ProtocolDecodeError(
      "hayward_omnilogic_local decode is not implemented yet.",
      "plugin_unsupported"
    );
  }
};
