export interface EquipmentBridgeEntry {
  id: string;
  equipmentType: "controller" | "pump" | "chlorinator";
  displayName: string;
  protocolName: string;
  busAddress: string | null;
  controlCircuitKeys?: string[];
  defaultControlCircuitKey?: string | null;
}

export class EquipmentBridge {
  private readonly entries: EquipmentBridgeEntry[] = [
    {
      id: "controller-main",
      equipmentType: "controller",
      displayName: "Main Controller",
      protocolName: "pentair_easytouch",
      busAddress: null
    },
    {
      id: "pump-main",
      equipmentType: "pump",
      displayName: "Main Pump",
      protocolName: "pentair_easytouch",
      busAddress: "0x60",
      controlCircuitKeys: ["pool", "pool_low", "pool_high", "cleaner"],
      defaultControlCircuitKey: "pool"
    },
    {
      id: "chlorinator-main",
      equipmentType: "chlorinator",
      displayName: "Main Chlorinator",
      protocolName: "pentair_easytouch",
      busAddress: null
    }
  ];

  all(): EquipmentBridgeEntry[] {
    return [...this.entries];
  }

  get(id: string): EquipmentBridgeEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }
}
