import type { ProtocolPlugin } from "./types.js";
import { ProtocolDecodeError } from "../protocol/types.js";

export const jandyAquaLinkRsPlugin: ProtocolPlugin = {
  id: "jandy_aqualink_rs",
  status: "stub",
  version: "0.1.0",
  decodeFrame() {
    throw new ProtocolDecodeError(
      "jandy_aqualink_rs decode is not implemented yet.",
      "plugin_unsupported"
    );
  }
};
