export interface SelectedProtocolConfig {
  poolId: string;
  protocolPlugin: string;
  protocolConfig: Record<string, unknown>;
}

export type ProviderSelectionResult =
  | { kind: "ok"; selection: SelectedProtocolConfig }
  | { kind: "unavailable"; errorCode: string; detail: string }
  | { kind: "invalid"; errorCode: string; detail: string };

export interface ProtocolSelectionProvider {
  getSelection(signal: AbortSignal): Promise<ProviderSelectionResult>;
}

export class UnavailableProtocolSelectionProvider implements ProtocolSelectionProvider {
  async getSelection(_signal: AbortSignal): Promise<ProviderSelectionResult> {
    return {
      kind: "unavailable",
      errorCode: "config_provider_unavailable",
      detail: "No configuration provider is configured for splash-protocol yet."
    };
  }
}
