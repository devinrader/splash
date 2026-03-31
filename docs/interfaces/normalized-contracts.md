# Normalized Contracts

[Back to README](../README.md)

## Purpose

This document defines the normalized equipment events and command vocabulary that sit above protocol decoding and below product workflows.

Application services should depend on these contracts rather than vendor-specific packet details.

## Capability profile contract

Splash uses a profile-based capability model.

- a capability profile is a reusable normalized template for a class of equipment
- each equipment instance resolves to zero or one active capability profile in v1
- effective capabilities are derived from the resolved profile plus configuration and runtime evidence
- application services validate commands against effective capabilities, not against protocol packet details

### Initial profile catalog

The following profile identifiers form the initial platform vocabulary for capability mapping.

| Profile ID | Equipment type | Specificity | Intended use |
| --- | --- | --- | --- |
| `generic.controller` | controller | generic fallback | Minimal controller profile when only high-level control state is known |
| `generic.pump` | pump | generic fallback | Minimal fallback for pumps with uncertain model identity |
| `generic.heater` | heater | generic fallback | Minimal fallback for heaters with uncertain model identity |
| `generic.chlorinator` | chlorinator | generic fallback | Minimal fallback for chlorinators with uncertain model identity |
| `generic.circuit` | circuit | generic fallback | Minimal fallback for controller-managed circuits |
| `pentair.variable_speed_pump` | pump | vendor fallback | Pentair-family variable-speed pump behavior when exact model identity is not confirmed |
| `pentair.intelliflo_vs` | pump | exact model | Primary v1 Pentair variable-speed pump profile |
| `pentair.easytouch_heater` | heater | vendor/controller-specific | Heater control through Pentair EasyTouch or IntelliTouch controller messaging |
| `pentair.intellichlor` | chlorinator | exact family | Salt chlorinator behavior exposed through Pentair integrations |
| `pentair.controller_circuit` | circuit | vendor/controller-specific | Pentair controller-managed circuit with named circuit-state control |

ASSUMPTION: The exact profile catalog will expand as more captures and equipment-model validation are completed, especially for Hayward and Jandy integrations.

### Capability object shape

```json
{
  "name": "set_speed",
  "tier": "core",
  "support": "supported",
  "mode": "write",
  "source": "protocol_plugin",
  "arguments": {
    "rpm": {
      "type": "integer",
      "min": 450,
      "max": 3450,
      "step": 10
    }
  },
  "constraints": [
    "requires_live_protocol_connection",
    "requires_confirmed_target_address"
  ]
}
```

Allowed `tier` values:

- `core`
- `extended`
- `diagnostic`

Allowed `support` values:

- `supported`
- `configured`
- `observed`
- `inferred`
- `unsupported`
- `unknown`

Allowed `mode` values:

- `read`
- `write`
- `read_write`

Allowed `source` values:

- `protocol_plugin`
- `equipment_inventory`
- `pool_circuits`
- `protocol_observation`
- `manual_override`

### Equipment capability projection

Each equipment read model should expose a resolved profile and effective capabilities.

Example:

```json
{
  "equipment_id": "uuid",
  "equipment_type": "pump",
  "resolved_profile_id": "pentair.intelliflo_vs",
  "resolved_profile_confidence": "confirmed",
  "effective_capabilities": [
    {
      "name": "set_speed",
      "tier": "core",
      "support": "supported",
      "mode": "write",
      "source": "protocol_plugin",
      "arguments": {
        "rpm": {
          "type": "integer",
          "min": 450,
          "max": 3450,
          "step": 10
        }
      }
    },
    {
      "name": "report_power",
      "tier": "extended",
      "support": "observed",
      "mode": "read",
      "source": "protocol_observation"
    }
  ]
}
```

Profile resolution should prefer the most specific known profile in the catalog, then fall back to vendor-level profiles, then generic profiles.

## Normalized event contracts

### `equipment.state.controller`

```json
{
  "pool_id": "uuid",
  "event_id": "uuid",
  "occurred_at": "2026-03-26T20:00:02Z",
  "source": {
    "service": "splash-protocol",
    "protocol_name": "pentair_easytouch",
    "frame_id": "uuid"
  },
  "water_temp_f": null,
  "air_temp_f": null,
  "solar_temp_f": null,
  "heater": {
    "enabled": false,
    "mode": "off",
    "setpoint_f": 84
  },
  "freeze_protection": false,
  "mode": "pool",
  "active_circuit_keys": ["pool"],
  "circuits": {
    "pool": true,
    "spa": false,
    "aux1": false,
    "aux2": false,
    "aux3": false,
    "feature1": false,
    "feature2": false,
    "feature3": false
  }
}
```

### `equipment.state.pump`

```json
{
  "pool_id": "uuid",
  "event_id": "uuid",
  "occurred_at": "2026-03-26T20:00:03Z",
  "source": {
    "service": "splash-protocol",
    "protocol_name": "pentair_easytouch",
    "frame_id": "uuid"
  },
  "equipment_id": "uuid",
  "equipment_type": "pump",
  "bus_address": "0x60",
  "running": true,
  "rpm": 2800,
  "watts": 1450
}
```

### `equipment.state.chlorinator`

```json
{
  "pool_id": "uuid",
  "event_id": "uuid",
  "occurred_at": "2026-03-26T20:00:04Z",
  "source": {
    "service": "splash-protocol",
    "protocol_name": "pentair_easytouch",
    "frame_id": "uuid"
  },
  "equipment_id": "uuid",
  "equipment_type": "chlorinator",
  "salt_ppm": 3100,
  "output_percent": 40,
  "status": "ok"
}
```

Partial normalized event rule:

- normalized events may omit fields that are not yet confidently mapped for the
  active protocol family
- omitted fields should not be synthesized from uncertain byte interpretations
- protocol-level diagnostics remain the source for incomplete or still
  reverse-engineered payload areas

## Normalized command vocabulary

| Command type | Purpose | Typical target |
| --- | --- | --- |
| `set_speed` | Set pump RPM | pump |
| `set_run_state` | Start or stop equipment | pump, heater, circuit |
| `set_circuit_state` | Turn a named circuit on or off | controller circuit |
| `set_heater_setpoint` | Change heater target temperature | heater |
| `set_heater_mode` | Change heater operating mode | heater |
| `set_chlorinator_output` | Set chlorinator output percent | chlorinator |

### Initial profile-to-command expectations

| Profile ID | Expected write capabilities | Expected read capabilities |
| --- | --- | --- |
| `generic.controller` | `set_circuit_state` where circuit mapping exists | controller status fields and named circuit states where available |
| `generic.pump` | `set_run_state` if commandable | `report_rpm` or basic running state where available |
| `generic.heater` | `set_run_state`, `set_heater_setpoint` if supported | heater mode and setpoint where available |
| `generic.chlorinator` | `set_chlorinator_output` if supported | `report_salt_level`, chlorinator status |
| `generic.circuit` | `set_circuit_state` | on/off state |
| `pentair.variable_speed_pump` | `set_speed`, `set_run_state` | `report_rpm`, `report_power` |
| `pentair.intelliflo_vs` | `set_speed`, `set_run_state` | `report_rpm`, `report_power` |
| `pentair.easytouch_heater` | `set_heater_setpoint`, `set_heater_mode`, `set_run_state` | heater mode, enabled state, setpoint |
| `pentair.intellichlor` | `set_chlorinator_output` | `report_salt_level`, output percent, chlorinator status |
| `pentair.controller_circuit` | `set_circuit_state` | named circuit state |

### Example `set_speed`

```json
{
  "pool_id": "uuid",
  "command_id": "uuid",
  "command_type": "set_speed",
  "target": {
    "equipment_id": "uuid",
    "equipment_type": "pump",
    "bus_address": "0x60"
  },
  "arguments": {
    "rpm": 2800
  }
}
```

Validation rule:

- `set_speed` must be rejected before encode if the target equipment lacks an effective capability named `set_speed` with a support state suitable for write use

### Example `set_circuit_state`

```json
{
  "pool_id": "uuid",
  "command_id": "uuid",
  "command_type": "set_circuit_state",
  "target": {
    "circuit_key": "pool"
  },
  "arguments": {
    "state": "on"
  }
}
```

### Example `set_heater_setpoint`

```json
{
  "pool_id": "uuid",
  "command_id": "uuid",
  "command_type": "set_heater_setpoint",
  "target": {
    "equipment_id": "uuid",
    "equipment_type": "heater"
  },
  "arguments": {
    "setpoint_f": 84
  }
}
```

## Mapping rule

- protocol plugins may emit protocol-specific decoded fields for diagnostics
- scheduler, API, task logic, and general UI state must rely on normalized events and normalized commands
- Protocol Explorer may use both normalized and protocol-specific data because diagnostics are part of its purpose
- richer vendor-specific functionality should be represented as extended normalized capabilities when it maps to a real user or automation intent, not suppressed to a lowest common denominator
- application services should depend on effective capability projections rather than assuming all equipment of a given type supports the same commands
