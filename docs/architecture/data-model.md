# Data Model

[Back to README](../README.md)

## Model overview

Splash uses a dual-database model:

- PostgreSQL for relational, configuration, and user-log data
- InfluxDB for time-series measurements and telemetry

The design is single-pool in v1, but child records carry `pool_id` to keep future multi-pool support possible without a schema reset.

## PostgreSQL entities

| Entity | Purpose | Key fields |
| --- | --- | --- |
| `pools` | Root pool profile | `name`, `pool_type`, `water_type`, `surface_type`, `volume_gallons`, `surface_area_sqft`, `zip_code`, `latitude`, `longitude`, `timezone`, `setup_complete` |
| `equipment` | Physical equipment inventory | `pool_id`, `equipment_type`, `brand`, `model`, `bus_address`, `capability_profile_id`, `capability_profile_source`, `install_date` |
| `maintenance_schedules` | Reminder schedules | `equipment_id`, `interval_type`, `interval_value`, `last_performed_at`, `next_due_at` |
| `checklist_definitions` | Seasonal checklist templates | `pool_id`, `season`, `title`, `sort_order` |
| `checklist_steps` | Checklist steps | `definition_id`, `title`, `notes`, `sort_order` |
| `checklist_completions` | Checklist runs | `definition_id`, `started_at`, `completed_at` |
| `chemistry_readings` | User and sensor chemistry log | `ph`, `free_chlorine`, `total_alkalinity`, `calcium_hardness`, `cyanuric_acid`, `salt_level`, `source`, `recorded_at` |
| `pool_cover_events` | Cover state history | `state`, `cover_type`, `recorded_at` |
| `slam_sessions` | SLAM workflow state | `status`, `cya_at_start`, `slam_fc_target`, `criterion_cc`, `criterion_clear`, `criterion_oclt`, `oclt_fc_before`, `oclt_fc_after` |
| `tasks` | Actionable work items | `status`, `priority`, `source`, `automation_command`, `due_at`, `snooze_until` |
| `notifications` | Notification inbox | `type`, `title`, `body`, `read`, `related_entity_type`, `related_entity_id` |
| `protocol_annotations` | Saved protocol-discovery notes | `pool_id`, `bundle_id`, `frame_index`, `field_name`, `byte_start`, `byte_end`, `confidence`, `label`, `notes` |
| `pool_settings` | Pool-scoped settings and integration configuration | `pool_id`, `chemistry_prompt_interval_days`, `maintenance_reminder_lead_days`, `notification_preferences`, `weather_provider`, `protocol_plugin`, `protocol_config`, `sensor_provider`, `sensor_config` |
| `pool_circuits` | Circuit label and display-name mapping | `pool_id`, `circuit_key`, `display_name`, `circuit_type`, `bus_address`, `action_code`, `sort_order`, `enabled` |

## Entity relationships

- One `pool` owns all other major records
- `equipment` optionally links into `maintenance_schedules`
- `checklist_definitions` own `checklist_steps` and `checklist_completions`
- `slam_sessions`, `tasks`, and `notifications` may reference related entities for UX and audit context
- `protocol_annotations` are pool-scoped so findings can differ by installation
- `protocol_annotations` may be attached to saved Protocol Explorer frame bundles so one controlled experiment can carry its own byte-level notes
- `pool_settings` is one-to-one with `pools`
- `pool_circuits` is one-to-many from `pools`

## Equipment capability model

Capabilities describe what the platform believes a piece of equipment can do at the normalized command layer.

### Capability principles

- capabilities are platform-level, not protocol-packet-level
- capabilities may be configured, inferred from protocol observations, or both
- UI controls and automation suggestions must check capabilities before offering actions
- each equipment instance resolves to zero or one capability profile in v1
- capability profiles define baseline normalized capabilities; effective capabilities are derived from the assigned or inferred profile plus installation-specific evidence

### Capability examples

| Equipment type | Capability examples |
| --- | --- |
| pump | `set_speed`, `set_run_state`, `report_power`, `report_rpm` |
| heater | `set_heater_setpoint`, `set_heater_mode`, `set_run_state` |
| chlorinator | `set_chlorinator_output`, `report_salt_level` |
| light | `set_circuit_state` |
| generic circuit | `set_circuit_state` |

### Representation

ASSUMPTION: Capabilities should initially be represented as derived application state rather than a dedicated relational table.

### Capability profile model

A capability profile is a reusable normalized template that describes what a class of equipment is expected to report and control.

Examples:

- `pentair.intelliflo_vs`
- `pentair.easytouch_heater`
- `generic.circuit`
- `generic.pump`
- `pentair.intellichlor`

Profile characteristics:

- one equipment instance resolves to at most one active capability profile in v1
- profiles are defined by plugin and application logic, not authored as database rows
- profiles may exist at different specificity levels, such as exact model, vendor-family fallback, or generic equipment-type fallback
- effective capabilities are derived from the resolved profile plus pool configuration and observed runtime evidence

### Profile assignment and resolution

Persisted equipment fields:

- `capability_profile_id`: nullable stable profile identifier
- `capability_profile_source`: how the stored profile was assigned

Allowed `capability_profile_source` values:

- `user_confirmed`
- `setup_selected`
- `system_inferred`

Derived runtime fields:

- `resolved_profile_id`
- `resolved_profile_confidence`
- `effective_capabilities`

Allowed `resolved_profile_confidence` values:

- `confirmed`
- `probable`
- `unknown`

Resolution rule:

1. Use persisted `capability_profile_id` when it exists and is user-confirmed or setup-selected
2. Otherwise let the active protocol plugin infer the best-fit profile from inventory and protocol evidence
3. Otherwise fall back to a generic profile such as `generic.pump` or `generic.circuit`
4. Derive effective capabilities from the resolved profile plus circuit mappings and observed runtime evidence

Effective capabilities are a read model, not a primary persisted relational structure in v1.

Capability sources:

- resolved capability profile
- equipment type from `equipment`
- configured circuit mappings from `pool_circuits`
- protocol plugin knowledge
- observed decoded state where appropriate

QUESTION: If capabilities need to become user-editable or installation-specific beyond equipment type and circuit config, add a dedicated persistence model in a future update.

## Audit and key conventions

- UUID v4 primary keys on all PostgreSQL tables
- `created_at` and `updated_at` on mutable entities
- Shared trigger updates `updated_at`
- Notifications are immutable after creation except for `read` state

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
```

## Proposed PostgreSQL definitions

### `pool_settings`

Purpose: store pool-scoped operational settings and service-configuration choices that do not belong in the immutable pool profile.

```sql
CREATE TABLE pool_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id UUID NOT NULL UNIQUE REFERENCES pools(id),
  chemistry_prompt_interval_days INTEGER NOT NULL DEFAULT 3,
  maintenance_reminder_lead_days INTEGER NOT NULL DEFAULT 7,
  notification_preferences JSONB NOT NULL DEFAULT '{"in_app": true, "email": false, "push": false}'::jsonb,
  weather_provider TEXT NOT NULL DEFAULT 'tomorrowio',
  protocol_plugin TEXT NOT NULL DEFAULT 'pentair_easytouch',
  protocol_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sensor_provider TEXT NOT NULL DEFAULT 'manual',
  sensor_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Notes:

- `protocol_plugin` identifies the active `splash-protocol` plugin for the pool
- `protocol_config` stores plugin-specific values such as default controller type, decoder options, or family-specific quirks
- `sensor_config` stores provider-specific sensor options without forcing schema churn

ASSUMPTION: `protocol_plugin` should evolve toward protocol-family-oriented identifiers rather than vendor-only labels when one vendor exposes multiple materially different integration surfaces.

### `equipment`

Purpose: persist installed pool equipment and any confirmed profile assignment that should survive restarts and future inference changes.

Expected additions to the canonical `equipment` shape:

- `capability_profile_id TEXT NULL`
- `capability_profile_source TEXT NULL`

Notes:

- `capability_profile_id` stores a stable profile identifier such as `pentair.intelliflo_vs` when the profile has been explicitly selected or confirmed
- `capability_profile_source` distinguishes persisted user or setup intent from transient runtime inference
- the effective runtime profile may still be surfaced as `resolved_profile_id` when no persisted assignment exists
- initial valid examples include generic fallbacks and Pentair-family profiles defined by the platform capability catalog

### `pool_circuits`

Purpose: persist friendly labels and metadata for controller circuits exposed to the UI and automation engine.

```sql
CREATE TABLE pool_circuits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id UUID NOT NULL REFERENCES pools(id),
  circuit_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  circuit_type TEXT NOT NULL DEFAULT 'generic',
  bus_address TEXT,
  action_code TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pool_id, circuit_key)
);
```

Notes:

- `circuit_key` is the stable machine identifier used in normalized events and command intents
- `display_name` is user-facing and editable
- `circuit_type` describes the functional circuit class, not the user-visible
  label
- on Pentair EasyTouch and IntelliTouch, this distinction matters:
  - fixed or special circuits such as `pool` and `spa` have controller-defined
    behavior and are not just user labels; renaming them does not change their
    internal `pool` or `spa` semantics
  - `aux` circuits are relay-backed controller outputs that may be renamed
  - `feature` circuits are virtual controller functions often used for pump
    speeds, valve-only actions, or logic functions
- user-facing names such as `POOL LOW` or `POOL HIGH` should therefore be
  treated as `display_name` values on a stable circuit type such as `feature`,
  not as evidence that the underlying circuit type is `pool`
- `bus_address` and `action_code` are optional protocol hints, not required for all implementations

## InfluxDB measurements

| Measurement | Source | Key fields |
| --- | --- | --- |
| `equipment_state` | controller 0x02 broadcast every 2s | controller time, water temp, air temp, solar temp, heater state, circuit states, freeze protection, mode |
| `pump_state` | pump 0x07 poll response | `running`, `watts`, `rpm` |
| `chlorinator_state` | chlorinator broadcast | `salt_ppm`, `output_percent`, `status` |
| `weather` | scheduler weather fetch | `temp_f`, `uv_index`, `humidity`, `condition`, `forecast_high_f`, `forecast_low_f`, `precip_chance_pct`, `actual_precip_in` |
| `chemistry_sensor` | future automated chemistry hardware | `ph`, `free_chlorine`, `orp` |
| `rainfall` | manual or provider-derived rainfall events | `inches` |

## Retention policy

| Measurement | Retention |
| --- | --- |
| `equipment_state` | 30 days raw, then 5-minute downsample for 1 year |
| `pump_state` | 90 days raw, then hourly downsample for 2 years |
| `weather` | 1 year at 15-minute resolution |
| `chemistry_sensor` | 2 years full resolution |
| `rainfall` | 2 years full resolution |
| PostgreSQL `chemistry_readings` | kept indefinitely as the permanent user log |

## Chemistry reference

### Parameter ranges and alert thresholds

| Parameter | Ideal target | Acceptable range | Alert low | Alert high | Critical low | Critical high |
| --- | --- | --- | --- | --- | --- | --- |
| pH | 7.4-7.6 | 7.2-7.8 | < 7.2 | > 7.8 | < 7.0 | > 8.2 |
| Free chlorine | CYA-adjusted | 1.0-5.0 ppm with CYA-adjusted minimum also met | < 1.0 ppm | > 5.0 ppm | < 0.5 ppm | > 8.0 ppm in SWG mode |
| Total alkalinity | 80-120 ppm, SWG: 80-100 | 60-180 ppm | < 60 ppm | > 180 ppm | TODO: not specified | TODO: not specified |
| Calcium hardness | 200-400 ppm, vinyl/fiberglass: 150-250 | 150-500 ppm | < 150 ppm | > 500 ppm | TODO: not specified | TODO: not specified |
| Cyanuric acid | 30-50 ppm, SWG: 60-80 | 20-80 ppm, SWG: 50-90 | < 20 ppm | > 80 ppm, SWG: > 90 ppm | TODO: not specified | > 100 ppm |
| Salt | 3000-3200 ppm | 2500-3500 ppm | < 2500 ppm | > 3500 ppm | < 2000 ppm | > 4500 ppm |

Do-not-swim conditions called out in the source:

- pH outside 7.0-8.2
- free chlorine below 0.5 ppm
- cyanuric acid above 100 ppm

### CYA-adjusted free chlorine reference

| CYA ppm | Minimum FC | Target FC | SLAM level | Notes |
| --- | --- | --- | --- | --- |
| 0 | 0.5 | 1-2 | TODO: not specified | No stabilizer |
| 20 | 1.5 | 2-3 | 10 |  |
| 30 | 2.0 | 3-4 | 12 |  |
| 40 | 3.0 | 4-5 | 16 |  |
| 50 | 4.0 | 5-6 | 20 |  |
| 60 | 5.5 | 5-7 | 24 | Typical SWG minimum target |
| 70 | 5.0 | 6-8 | 28 | Typical SWG upper target |
| 80 | 6.0 | 7-9 | 32 |  |
| 90 | 7.0 | 8-10 | 36 | Consider partial drain |
| 100+ | impractical | TODO: not specified | TODO: not specified | Chlorine lock; partial drain required |

## Data flow summary

1. `splash-serial` reads the RS-485 bus and publishes raw transport events to NATS.
2. `splash-protocol` reconstructs and decodes frames, then publishes normalized equipment events.
3. `splash-scheduler` fetches weather, evaluates rules against normalized state, and publishes tasks, suggestions, and notifications.
4. `splash-api` persists relational updates to PostgreSQL, exposes REST and SSE, and emits normalized command intents when actions are approved.
5. The frontend bootstraps from REST and stays current through SSE and normalized events.

## Protocol metadata persistence

The system design does not require durable storage of every raw transport chunk. Persistence should be selective and focused on user-facing or diagnostic value.

### Persisted by design

- `protocol_annotations` in PostgreSQL
- `pool_settings` in PostgreSQL
- `pool_circuits` in PostgreSQL
- user-facing equipment state in InfluxDB through normalized measurements
- command/task history in PostgreSQL

### Not required as a primary store

- every `serial.rx.raw` chunk
- every `serial.tx.raw` write event
- every reconstructed raw frame

ASSUMPTION: Raw transport and protocol-frame traffic is primarily ephemeral and observability-oriented unless a future diagnostic archive feature is explicitly added.

### Potential future persistence

- QUESTION: Should a bounded protocol-frame archive be added for debugging difficult vendor-specific issues?
- TODO: If protocol-frame archival becomes a requirement, add explicit PostgreSQL or object-storage design rather than treating NATS as a historical store.

## Remaining schema questions

- QUESTION: Should `pool_settings.protocol_config` and `pool_settings.sensor_config` remain free-form JSONB long term, or later split into typed columns once real provider requirements stabilize?
