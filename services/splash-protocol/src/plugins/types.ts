export type PluginStatus = "active" | "stub";

export interface ProtocolPlugin {
  id: string;
  status: PluginStatus;
  version: string;
}
