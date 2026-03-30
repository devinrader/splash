# Glossary

[Back to README](../README.md)

## Purpose

This document defines reference vocabulary used across the Splash design system.

It is a glossary and terminology aid, not yet a normative platform taxonomy. Where terms later become architecture- or contract-significant, the authoritative behavioral rules must live in the owning design documents.

## Platform and system vocabulary

### `platform`

The complete Splash system, including the web application, backend services, data stores, integrations, and supporting workflows.

### `service`

A deployable backend process with a defined responsibility, such as `splash-api`, `splash-scheduler`, `splash-protocol`, or `splash-serial`.

### `host`

A physical or virtual machine that runs one or more Splash services, such as `splash-core` or `splash-zero`.

### `pool`

The primary managed installation and root domain object for a Splash deployment. v1 supports one pool per deployment even though several schemas are future-ready for multi-pool support.

### `setup`

The onboarding process that collects the minimum pool, equipment, and configuration information needed before normal application use.

### `configuration`

Persisted or runtime settings that control how Splash behaves, including pool settings, provider selection, protocol plugin choice, and operational options.

### `integration`

Any connection point between Splash and an external system, device, protocol family, or provider.

### `external provider`

A non-local service that supplies data to Splash, such as a weather API.

### `user-entered data`

Information manually entered by the user rather than captured from live protocols or sensors.

### `derived state`

A platform-computed interpretation based on one or more inputs, such as stale weather status, chemistry warnings, or an automation suggestion.

## Equipment and control vocabulary

### `equipment`

A physical pool-related device that Splash monitors, controls, or tracks as part of pool operation, such as a pump, heater, chlorinator, light, or controller-managed circuit.

### `controller`

The primary automation or equipment control unit that coordinates other pool equipment and exposes protocol-visible state.

### `circuit`

A controller-managed logical output or function, such as pool, spa, aux, or light control, typically surfaced through `pool_circuits`.

Circuit type and circuit name are not the same thing. The type describes the
controller behavior, while the name is the user-visible label. On Pentair
systems, virtual Feature circuits are often named for pump-speed purposes such
as `POOL LOW` or `POOL HIGH` without becoming fixed `pool` circuits. AUX and
Feature circuits may be renamed freely, but renaming `pool` or `spa` does not
change their underlying controller behavior.

### `pump`

Water-circulation equipment, including single-speed or variable-speed pumps, that may expose run-state and performance telemetry such as RPM or watts.

### `heater`

Pool or spa heating equipment, including devices that may expose on/off state, mode, and temperature setpoint.

### `chlorinator`

Equipment that generates or controls sanitizer production, such as a salt chlorinator, and may expose output percent or salt-related status.

### `light`

A controllable lighting device or circuit associated with the pool or surrounding area.

### `bus address`

A protocol-visible identifier used to route or identify messages for a device on a pool-equipment communication bus.

### `equipment state`

The current normalized or protocol-derived condition of a piece of equipment, such as running status, RPM, watts, output percent, or heater mode.

### `command`

An explicit request for Splash to change equipment behavior, usually expressed as a normalized command before protocol encoding.

### `capability`

A normalized statement of what a specific equipment instance can report or do, including any relevant validation limits or support confidence.

## Protocol and diagnostics vocabulary

### `pool-equipment communication protocol`

A vendor-specific or vendor-family-specific method used to observe and control physical pool equipment, such as Pentair, Jandy, or Hayward communication over RS-485.

### `protocol family`

A specific communication family or controller integration surface used by a product line, such as Pentair EasyTouch / IntelliTouch RS-485, Pentair IntelliCenter local web/mobile interface, Hayward OmniLogic local network integration, or Jandy AquaLink RS.

### `variant`

A controller, firmware, or product-line distinction within a protocol family that may require different handling even when the broader vendor or family name is shared.

### `frame`

A protocol-level unit of communication after raw byte transport has been assembled into a complete message envelope.

### `frame definition`

The rules for identifying and validating a protocol frame, such as sync, header layout, payload boundaries, and checksum behavior.

### `payload`

The message content carried inside a frame after the envelope and integrity fields are separated.

### `payload definition`

The rules for interpreting a frame payload, including fields, offsets, enums, bitfields, and scaling.

### `raw transport data`

Byte-oriented serial input or output emitted at the transport boundary before protocol parsing.

### `decoded frame`

A structured protocol message produced after frame assembly, validation, and payload interpretation.

### `normalized event`

A platform-level event shaped for use by application services and the frontend rather than by vendor-specific packet semantics.

### `normalized command`

A platform-level command intent that expresses what Splash wants to do without exposing vendor-specific byte formats.

### `protocol annotation`

Saved diagnostic knowledge about partially understood protocol bytes, fields, or message behavior.

### `Protocol Explorer`

The advanced diagnostics and reverse-engineering surface for live monitoring, decode, simulation, diffing, and annotation of pool-equipment protocol traffic.

## Sensor and environmental vocabulary

### `sensor`

A device that directly measures a physical property relevant to pool management, such as chemistry or temperature.

### `sensor provider`

The abstraction boundary used by Splash for chemistry or other measurement hardware integrations.

### `environmental input`

Contextual non-equipment data that affects pool operation or chemistry interpretation, such as rainfall, UV, temperature, humidity, or forecast conditions.

### `weather input`

Environmental input sourced from a weather provider, including current conditions and forecasted values.

### `rainfall input`

Recorded or provider-supplied precipitation data used as context for chemistry and maintenance interpretation.

### `UV input`

Recorded or provider-supplied ultraviolet exposure data used as context for sanitizer demand and automation reasoning.

### `manual observation`

A user-recorded non-automated input, such as a chemistry test result, cover state change, or visually observed water condition.

## Chemistry and pool-balance vocabulary

### `chemistry reading`

A recorded measurement of one or more pool water chemistry values, whether partial or complete.

### `manual chemistry reading`

A chemistry reading entered by the user from a test kit, strip, or other manual process.

### `sensor-derived chemistry reading`

A chemistry reading supplied by supported hardware through a `SensorProvider`.

### `pH`

The measure of water acidity or basicity used by Splash as a primary chemistry input.

### `free chlorine (FC)`

The sanitizer level available to actively sanitize the water.

### `combined chlorine (CC)`

The portion of chlorine bound to contaminants and tracked as part of water-quality interpretation and SLAM completion criteria.

### `total alkalinity (TA)`

The water’s buffering capacity against rapid pH change.

### `calcium hardness (CH)`

The concentration of dissolved calcium relevant to plaster protection, scaling risk, and balance interpretation.

### `cyanuric acid (CYA)`

The stabilizer level used to interpret chlorine requirements, including CYA-adjusted minimum free chlorine guidance.

### `salt level`

The dissolved salt concentration relevant to saltwater chlorination systems.

### `water balance`

The overall condition of the pool water as interpreted from chemistry readings and related context.

### `ideal range`

A preferred operating range for a chemistry measurement under normal conditions.

### `target range`

A desired value band the platform uses for guidance or display. A target range may differ from a broad ideal range depending on context.

### `minimum FC`

The lowest acceptable free chlorine level for normal operation, interpreted relative to CYA rather than as a fixed universal number.

### `SLAM FC target`

The free chlorine target used during an active SLAM workflow, derived from current CYA and distinct from routine operation targets.

### `chemistry state`

Splash’s interpreted view of current water condition, derived from one or more chemistry readings and contextual inputs.

### `chemistry alert`

A user-facing warning that a chemistry reading or derived chemistry state requires attention.

### `chemistry prompt`

A reminder or nudge to collect or review chemistry data, even when no explicit alert is active.

### `chemistry recommendation`

A suggested action or guidance message derived from chemistry readings, rules, and contextual interpretation.

## Workflow and planning vocabulary

### `task`

An actionable item persisted by the platform for the user to review, complete, approve, dismiss, or snooze.

### `notification`

A persisted user-facing message that surfaces an event, warning, reminder, or suggestion.

### `suggestion`

A platform-generated recommendation that the user may review before acting on it.

### `automation suggestion`

A specific suggestion generated by automation logic that proposes a normalized equipment action and requires user approval in v1.

### `approval`

An explicit user action that authorizes a pending automation or control request to proceed.

### `maintenance schedule`

A recurring plan for upkeep activities associated with a pool or a specific piece of equipment.

### `seasonal checklist`

A structured set of ordered steps used for workflows such as pool opening or closing.

### `SLAM session`

A persisted workflow instance for managing shock-level chlorination, repeated testing, and completion checks.

### `cover event`

A recorded change in pool-cover state, such as cover on or cover off, used as contextual history rather than only current state.

## Future-facing or provisional vocabulary

### `predictive guidance`

Future-facing insight generated from history, trends, or modeling to help the user act before a problem becomes visible.

### `dosing recommendation`

Future-facing guidance on how much chemical to add. This term may be used in design discussion even though full dosing math is deferred beyond v1.

### `autonomous automation`

A future operating mode where the system may execute actions without per-action user approval.

### `experimental capability`

A partially validated or advanced feature that may be exposed first in diagnostics or limited UI surfaces before becoming a stable general-platform capability.
