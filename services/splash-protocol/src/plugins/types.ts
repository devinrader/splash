export type PluginStatus = "active" | "stub";

import type { DecodedProtocolFrame } from "../protocol/types.js";

export interface ProtocolPlugin {
  id: string;
  status: PluginStatus;
  version: string;
  decodeFrame(
    frame: Uint8Array,
    context?: { frameId?: string; occurredAt?: string }
  ): DecodedProtocolFrame;
}
