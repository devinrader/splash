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

export class EnvProtocolSelectionProvider implements ProtocolSelectionProvider {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async getSelection(_signal: AbortSignal): Promise<ProviderSelectionResult> {
    const poolId = this.env.PROTOCOL_POOL_ID;
    const protocolPlugin = this.env.PROTOCOL_SELECTED_PLUGIN;
    const rawConfig = this.env.PROTOCOL_SELECTED_CONFIG_JSON;

    if (!poolId || !protocolPlugin) {
      return {
        kind: "unavailable",
        errorCode: "config_provider_unavailable",
        detail: "Temporary env-backed protocol selection is not configured."
      };
    }

    let protocolConfig: Record<string, unknown> = {};
    if (rawConfig && rawConfig.length > 0) {
      try {
        const parsed = JSON.parse(rawConfig);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return {
            kind: "invalid",
            errorCode: "protocol_config_invalid",
            detail: "PROTOCOL_SELECTED_CONFIG_JSON must decode to a JSON object."
          };
        }
        protocolConfig = parsed as Record<string, unknown>;
      } catch (error) {
        return {
          kind: "invalid",
          errorCode: "protocol_config_invalid",
          detail: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return {
      kind: "ok",
      selection: {
        poolId,
        protocolPlugin,
        protocolConfig
      }
    };
  }
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

export function createDefaultProtocolSelectionProvider(
  env: NodeJS.ProcessEnv = process.env
): ProtocolSelectionProvider {
  return new EnvProtocolSelectionProvider(env);
}
