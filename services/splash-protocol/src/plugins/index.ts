import { haywardOmniLogicLocalPlugin } from "./hayward-omnilogic-local.js";
import { jandyAquaLinkRsPlugin } from "./jandy-aqualink-rs.js";
import { pentairEasyTouchPlugin } from "./pentair-easytouch.js";
import type { ProtocolPlugin } from "./types.js";

export class PluginRegistry {
  private readonly plugins = new Map<string, ProtocolPlugin>();

  constructor(plugins: ProtocolPlugin[]) {
    for (const plugin of plugins) {
      this.plugins.set(plugin.id, plugin);
    }
  }

  get(pluginId: string): ProtocolPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  all(): ProtocolPlugin[] {
    return [...this.plugins.values()];
  }
}

export function discoverPlugins(): PluginRegistry {
  return new PluginRegistry([
    pentairEasyTouchPlugin,
    jandyAquaLinkRsPlugin,
    haywardOmniLogicLocalPlugin
  ]);
}
