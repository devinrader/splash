export interface EquipmentBridgeEntry {
  id: string;
  equipmentType: "controller" | "pump" | "chlorinator";
  displayName: string;
  protocolName: string;
  busAddress: string | null;
  controlCircuitKeys?: string[];
  defaultControlCircuitKey?: string | null;
  controllerCircuits?: ControllerCircuitDescriptor[];
}

export interface ControllerCircuitDescriptor {
  circuitKey: string;
  displayName: string;
  circuitType: "fixed" | "relay" | "feature" | "aux_extra";
  installed: boolean;
  writable: boolean;
  configurationCircuitIndex: number | null;
  writeCircuitId: number | null;
}

const CONTROLLER_CIRCUIT_IDS: Record<string, number> = {
  spa: 1,
  pool: 2,
  aux1: 3,
  aux2: 4,
  aux3: 5,
  aux4: 6,
  aux5: 7,
  aux6: 8,
  aux7: 9,
  feature1: 11,
  feature2: 12,
  feature3: 13,
  feature4: 14,
  feature5: 15,
  feature6: 16,
  feature7: 17,
  feature8: 18
};

const CONTROLLER_CIRCUITS: ControllerCircuitDescriptor[] = [
  { circuitKey: "spa", displayName: "Spa", circuitType: "fixed", installed: false, writable: true, configurationCircuitIndex: 1, writeCircuitId: 1 },
  { circuitKey: "pool", displayName: "Pool", circuitType: "fixed", installed: true, writable: true, configurationCircuitIndex: 2, writeCircuitId: 2 },
  { circuitKey: "aux1", displayName: "Aux 1", circuitType: "relay", installed: true, writable: true, configurationCircuitIndex: 3, writeCircuitId: 3 },
  { circuitKey: "aux2", displayName: "Aux 2", circuitType: "relay", installed: true, writable: true, configurationCircuitIndex: 4, writeCircuitId: 4 },
  { circuitKey: "aux3", displayName: "Aux 3", circuitType: "relay", installed: true, writable: true, configurationCircuitIndex: 5, writeCircuitId: 5 },
  { circuitKey: "aux4", displayName: "Aux 4", circuitType: "relay", installed: true, writable: true, configurationCircuitIndex: 6, writeCircuitId: 6 },
  { circuitKey: "aux5", displayName: "Aux 5", circuitType: "relay", installed: true, writable: true, configurationCircuitIndex: 7, writeCircuitId: 7 },
  { circuitKey: "aux6", displayName: "Aux 6", circuitType: "relay", installed: true, writable: true, configurationCircuitIndex: 8, writeCircuitId: 8 },
  { circuitKey: "aux7", displayName: "Aux 7", circuitType: "relay", installed: true, writable: true, configurationCircuitIndex: 9, writeCircuitId: 9 },
  { circuitKey: "feature1", displayName: "Feature 1", circuitType: "feature", installed: true, writable: true, configurationCircuitIndex: 10, writeCircuitId: 11 },
  { circuitKey: "feature2", displayName: "Feature 2", circuitType: "feature", installed: true, writable: true, configurationCircuitIndex: 11, writeCircuitId: 12 },
  { circuitKey: "feature3", displayName: "Feature 3", circuitType: "feature", installed: true, writable: true, configurationCircuitIndex: 12, writeCircuitId: 13 },
  { circuitKey: "feature4", displayName: "Feature 4", circuitType: "feature", installed: true, writable: true, configurationCircuitIndex: 13, writeCircuitId: 14 },
  { circuitKey: "feature5", displayName: "Feature 5", circuitType: "feature", installed: true, writable: true, configurationCircuitIndex: 14, writeCircuitId: 15 },
  { circuitKey: "feature6", displayName: "Feature 6", circuitType: "feature", installed: true, writable: true, configurationCircuitIndex: 15, writeCircuitId: 16 },
  { circuitKey: "feature7", displayName: "Feature 7", circuitType: "feature", installed: true, writable: true, configurationCircuitIndex: 16, writeCircuitId: 17 },
  { circuitKey: "feature8", displayName: "Feature 8", circuitType: "feature", installed: true, writable: true, configurationCircuitIndex: 17, writeCircuitId: 18 },
  { circuitKey: "aux_extra", displayName: "Aux Extra", circuitType: "aux_extra", installed: true, writable: false, configurationCircuitIndex: 18, writeCircuitId: null }
];

export class EquipmentBridge {
  private readonly entries: EquipmentBridgeEntry[] = [
    {
      id: "controller-main",
      equipmentType: "controller",
      displayName: "Main Controller",
      protocolName: "pentair_easytouch",
      busAddress: null,
      controllerCircuits: CONTROLLER_CIRCUITS
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

  getControllerCircuitId(circuitKey: string): number | null {
    return CONTROLLER_CIRCUIT_IDS[circuitKey] ?? null;
  }

  getControllerCircuits(): ControllerCircuitDescriptor[] {
    return CONTROLLER_CIRCUITS.map((circuit) => ({ ...circuit }));
  }
}
