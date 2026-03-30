# Equipment Protocols

[Back to README](../README.md)

## Scope

This document covers pool-equipment communication protocols and protocol families used by Splash to observe and control physical pool equipment.

It includes:

- controller, pump, heater, chlorinator, and circuit communication protocols
- frame definitions
- payload definitions
- normalized mapping targets
- reverse-engineering status for supported and planned equipment families

It does not include:

- REST API design
- SSE event contracts
- NATS subject design
- database protocols
- Cloudflare, SMTP, Web Push, or other general integration protocols

## Purpose

This document is the authoritative protocol reference for all known pool-equipment communication protocols relevant to Splash.

It exists to support:

- `splash-protocol` plugin design
- Protocol Explorer decode, simulate, and diff workflows
- vendor comparison and future integration planning
- reverse-engineering work on undocumented or partially documented messages

## Scope Details

This document covers:

- physical-layer characteristics where known
- frame-definition characteristics
- payload-definition status where known
- command and integration notes
- open-source prior art
- known unknowns and reverse-engineering gaps

This document does not replace:

- [architecture.md](./architecture.md) for service ownership and event flow
- [api-design.md](../interfaces/api-design.md) for NATS and REST contracts
- [open-questions.md](../product/open-questions.md) for unresolved design decisions

## Protocol model

Splash should reason about protocol specifications in three layers:

1. Frame definition
   The transport-level structure used to identify a frame, extract addresses, determine payload boundaries, and validate checksums.

2. Payload definition
   The message-specific interpretation of the payload for a known message type or action code.

3. Normalized mapping
   The translation from protocol-specific meaning into Splash-level events, capabilities, and commands.

## Classification model

Protocol identity should not be modeled as vendor-only.

Splash should distinguish:

1. `vendor`
   The manufacturer or product brand, such as Pentair, Hayward, or Jandy.

2. `protocol family`
   The primary communication family or integration surface, such as Pentair EasyTouch / IntelliTouch RS-485, Pentair IntelliCenter local web/mobile interface, Hayward OmniLogic local network integration, or Jandy AquaLink RS.

3. `variant`
   A controller, firmware, or product-line distinction within a protocol family that may require different frame definitions, payload definitions, or API handling.

4. `capability profile`
   The normalized per-equipment profile used by Splash above the protocol layer.

Design rule:

- vendor is an important classification axis, but it is not sufficient as the primary protocol identity
- protocol plugins should be organized around protocol families and variants, not only manufacturer names

## Capability-profile mapping model

Protocol plugins should map protocol-visible equipment into one normalized capability profile per equipment instance.

### Design rules

- each equipment instance resolves to zero or one active capability profile in v1
- protocol plugins define profile catalogs in code and use them as the baseline for normalized capability exposure
- profile catalogs may contain exact model profiles, vendor-family fallback profiles, and generic equipment-type fallback profiles
- protocol plugins must not force the overall platform down to a lowest common denominator; vendor-specific richness should be surfaced as extended capabilities when it maps to a meaningful user intent

### Resolution order

1. honor a persisted confirmed profile assignment when one exists
2. otherwise infer the most specific supported profile from protocol behavior and inventory hints
3. otherwise fall back to a generic profile for the equipment type
4. derive effective capabilities from the resolved profile plus installation-specific evidence

### Examples

- exact: `pentair.intelliflo_vs`
- vendor fallback: `pentair.variable_speed_pump`
- generic fallback: `generic.pump`

### Capability richness rule

Extended capabilities may exist for one vendor family even when other vendor families do not support them.

Examples:

- `set_circuit_state` may be a core capability for many controller-managed loads
- `set_light_show` may be an extended capability exposed only where the active protocol plugin can confidently support it

Protocol-specific wire quirks must remain protocol concerns, not normalized capabilities.

## Initial capability profile catalog

The initial catalog is intentionally conservative and centered on the documented Pentair v1 path plus generic fallbacks.

| Profile ID | Protocol family | Equipment type | Status | Notes |
| --- | --- | --- | --- | --- |
| `generic.controller` | any | controller | active fallback | Use when only controller-level normalized state is confidently available |
| `generic.pump` | any | pump | active fallback | Use when a pump is known but exact model identity is not |
| `generic.heater` | any | heater | active fallback | Use when heater control or state exists but model specificity is weak |
| `generic.chlorinator` | any | chlorinator | active fallback | Use when chlorinator identity is uncertain |
| `generic.circuit` | any | circuit | active fallback | Use for controller-managed loads with circuit-level on/off behavior |
| `pentair.variable_speed_pump` | Pentair EasyTouch / IntelliTouch | pump | active fallback | Vendor-family fallback when a Pentair VS pump is present but exact model is not confirmed |
| `pentair.intelliflo_vs` | Pentair EasyTouch / IntelliTouch | pump | active | Primary v1 exact pump profile |
| `pentair.easytouch_heater` | Pentair EasyTouch / IntelliTouch | heater | active | Heater profile exposed through Pentair controller semantics |
| `pentair.intellichlor` | Pentair EasyTouch / IntelliTouch | chlorinator | active | Salt chlorinator profile for Pentair-family state and output control |
| `pentair.controller_circuit` | Pentair EasyTouch / IntelliTouch | circuit | active | Controller-managed circuits where fixed type and user-visible name must remain distinct, such as pool, spa, aux, feature, or lights |

Profiles not yet active in the initial catalog:

- Hayward-specific exact profiles
- Jandy-specific exact profiles
- IntelliCenter-specific exact profiles beyond future Pentair-family branching

QUESTION: Should `generic.light` become a separate profile from `generic.circuit`, or should lighting remain a circuit specialization in v1?

### Pentair circuit type versus circuit name

On Pentair EasyTouch and IntelliTouch, circuit type and circuit name are
separate concepts:

- circuit type controls behavior
- circuit name is only the user-visible label

Important circuit classes:

- fixed or special circuits:
  - `spa`
  - `pool`
  - these are controller-defined operating modes tied to valve and heater logic
  - renaming them does not change their internal behavior as `spa` or `pool`
- `aux` circuits:
  - relay-backed controller outputs such as `AUX1` through model-dependent aux
    ranges
  - these may be renamed by the user
- `feature` circuits:
  - virtual controller functions commonly used for pump speeds, valve-only
    actions, or controller logic
  - labels such as `POOL LOW` or `POOL HIGH` are often feature-circuit names,
    not fixed `pool` circuit types

Splash should preserve this distinction when decoding controller circuits:

- stable machine identity should reflect the underlying circuit type and key
- user-visible labels should remain editable display names
- protocol discovery should not infer functional type from labels alone
- operator setup and UI flows should allow renaming for `aux` and `feature`
  circuits without implying that fixed `pool` or `spa` behavior can be changed

## Protocol status legend

- `supported`: intended active protocol target with meaningful implementation coverage
- `partial`: known protocol with documented characteristics but incomplete implementation
- `planned`: identified future protocol with enough information to guide design, but not ready for implementation
- `unknown`: known to exist, but insufficiently understood for implementation work

## Vendor summary

| Vendor / platform | Status | Primary integration path | Notes |
| --- | --- | --- | --- |
| Pentair EasyTouch / IntelliTouch | supported | RS-485 binary protocol plus ScreenLogic ecosystem | Primary v1 target |
| Pentair IntelliCenter | planned | local network web/mobile interface plus Pentair equipment ecosystem | Different integration family from EasyTouch |
| Hayward OmniLogic / OmniPL / OmniHub | planned | local network API and controller networking, with possible bus-level paths depending system | Current evidence is more network-centric than Pentair v1 |
| Jandy / Zodiac AquaLink RS | partial | AquaLink RS controller ecosystem with RS-485 and Web Connect paths | Framing known from community work; implementation not complete |

## Pentair EasyTouch / IntelliTouch

Status: `supported`

### Overview

Pentair EasyTouch and IntelliTouch are the primary v1 protocol targets. Community reverse engineering is comparatively mature, and the current Splash design assumes Pentair as the default protocol plugin.

### Physical layer

- medium: RS-485
- baud: 9600
- data bits: 8
- parity: none
- stop bits: 1
- bus model: half-duplex, multi-device bus

### Frame definition

- delimiter: `FF 00 FF A5`
- protocol bytes:
  - `0x01` for standard messages
  - `0x00` for IntelliFlo pump protocol
- fields include:
  - protocol byte
  - source address
  - destination address
  - action code
  - payload length
  - payload bytes
  - checksum
- checksum: 2-byte big-endian sum from `0xA5` through end of payload

### Addressing notes

- controllers: `0x10` to `0x1F`
- remotes: `0x20` to `0x2F`
- IntelliFlo pumps: `0x60` to `0x6F`
- other documented devices include ScreenLogic, QuickTouch, UltraTemp, and chlorinator-related addresses

### Known message areas

- `0x02`: controller status broadcast every ~2 seconds
- `0x07`: pump status/poll-related traffic
- `0x19`: chlorinator broadcast
- additional action codes are known but not all are fully mapped

### Payload definition status

- `0x02` is partially well understood and is the primary state source for Splash
- several fields remain incompletely decoded
- pump and chlorinator payloads are sufficiently understood to support normalized state and control paths in the intended design

### Command notes

- commands are written when the bus is idle
- the source material references a 50 ms idle requirement before writing
- some pump-control flows require panel-control toggling before direct pump commands are accepted

### Initial pump-speed control assumption

The first Splash command implementation should prefer Pentair
controller-mediated pump-circuit speed control rather than direct IntelliFlo
RPM writes.

Initial assumption set:

- the target pump is assigned to one or more EasyTouch-managed circuits
- Splash must first decode enough controller system-status information to
  identify those circuit assignments and the controller clues that indicate pump
  ownership
- the first trusted controller-status circuit-discovery slice should at minimum
  expose known active circuit bits, `active_circuit_keys`, and a controller
  `mode` hint derived from those same trusted bits
- Splash changes the configured RPM for the relevant pump circuit rather than
  writing a direct standalone pump RPM
- the controller remains the authority that keeps the pump at the requested
  speed once the circuit is active
- required Pentair controller write frames and follow-up response frames must be
  captured and documented before the first live implementation is considered
  complete

This keeps milestone 1 aligned with the actual controller-managed operating mode
instead of competing with EasyTouch over direct pump ownership.

### Deferred direct-pump and no-controller scenarios

Later work should still explore:

- pumps with no controller-managed circuits assigned
- pumps physically present on RS-485 but not connected through an EasyTouch
  controller path
- standalone or no-controller deployments where Splash must own direct pump
  control without controller mediation

Those scenarios are real, but they should not drive the first milestone command
path while the controller-managed circuit model remains the cleanest and most
supported EasyTouch integration surface.

### Normalized mapping targets

- `equipment.state.controller`
- `equipment.state.pump`
- `equipment.state.chlorinator`
- capability profiles such as `pentair.intelliflo_vs`, `pentair.easytouch_heater`, and generic fallbacks where needed
- command types such as:
  - `set_speed`
  - `set_circuit_state`
  - `set_heater_setpoint`
  - `set_chlorinator_output`

### Reverse-engineering notes

- heater-setpoint-related bytes in the controller-status payload remain incomplete
- multiple action codes remain only partially documented
- Protocol Explorer frame diff is the preferred workflow for mapping remaining unknown fields

### Initial partial normalized mapping rule

- the first `splash-protocol` implementation may publish partial normalized
  controller, pump, and chlorinator events using only the subset of bytes that
  are currently trusted
- bytes that remain incomplete should stay visible through protocol diagnostics
  and `unknown_fields`, not be guessed into normalized state
- unresolved byte ranges should be tracked as explicit follow-up issues so the
  normalized mapping can expand safely over time

## Pentair IntelliCenter

Status: `planned`

### Overview

IntelliCenter differs from EasyTouch and IntelliTouch. It still participates in Pentair equipment ecosystems but cannot be treated as identical to the older RS-485 controller protocol.

### Integration paths

- official local network web and mobile interface support exists for the controller
- Internet-connected control is also part of the official IntelliCenter interface model
- RS-485 remains relevant for connected equipment on the bus
- the controller-status model may overlap conceptually with EasyTouch but message layout is not assumed to be identical

### Design implications

- IntelliCenter should be modeled as a separate protocol family or a clearly separate Pentair-family variant, not as the same integration surface as EasyTouch / IntelliTouch
- do not assume EasyTouch payload definitions are valid without version-specific verification
- frame and payload definitions may need controller-type branching in `protocol_config`
- initial profile mapping should prefer Pentair-family fallback profiles over EasyTouch-specific exact profiles when controller identity is not yet confirmed
- local-network/API interaction should be treated as a first-class research and integration path for IntelliCenter

### Known limitations

- QUESTION: Which IntelliCenter messages can share payload definitions with EasyTouch, and which require separate message catalogs?
- TODO: Add version-specific protocol notes when real captures are available

## Hayward OmniLogic / OmniPL / OmniHub

Status: `planned`

### Overview

Hayward systems are important future targets but have less mature public reverse-engineering coverage than Pentair.

### Physical and protocol notes

- controller networking is a major documented integration path
- Ethernet and optional wireless connectivity are part of the official OmniLogic system model
- community local integrations indicate local network API behavior, including UDP- and XML-oriented approaches
- RS-485 may still exist in some Hayward integrations, but it is not currently the strongest documented v1 path in the available research

### Design implications

- Hayward should be modeled as a separate protocol family, not as a Pentair-like serial assumption set
- serial-parameter assumptions must not be inherited from Pentair
- the protocol reference should distinguish controller-network APIs from pure bus protocols
- until Hayward-specific exact profiles are validated, Hayward integrations should resolve to generic or Hayward-family fallback profiles rather than borrowing Pentair profile IDs
- initial Hayward research and plugin design should prioritize the network-facing local integration model where possible

### Known limitations

- payload-definition maturity is limited
- bus-level checksum and framing details need validation against real captures before implementation
- TODO: Add concrete frame-definition sections once captures or trusted references are available

## Jandy / Zodiac AquaLink RS

Status: `partial`

### Overview

Jandy AquaLink RS is partially reverse engineered and differs materially from Pentair at both framing and bus-behavior levels.

Official product materials also center the AquaLink RS control system plus iAquaLink Web Connect path, so Splash should treat AquaLink RS as a controller/platform family rather than only as a raw vendor bus definition.

### Physical layer

- medium: RS-485
- bus notes: implementations often reference Data+, Data-, GND, and a power rail
- the control panel acts as bus master

### Frame definition

- uses DLE-style framing
- start sequence: `0x10 0x02`
- end sequence: `0x10 0x03`
- data occurrences of `0x10` are escaped
- checksum: single-byte checksum model is referenced in the source material

### Bus architecture notes

- master/slave model with the control panel as the bus master
- third-party integration acts more like a slave/client than an independent bus master
- direct command assumptions must account for this topology

### Payload definition status

- sufficient framing knowledge exists to justify a partial plugin design
- payload coverage is incomplete
- device and keypad variants complicate a single universal payload map

### Design implications

- Jandy support should remain explicitly partial until live-capture validation closes the remaining gaps
- write-path behavior may differ significantly from Pentair and should not reuse Pentair assumptions
- initial Jandy support should use generic profiles unless and until Jandy-specific profile definitions are confirmed
- the docs should distinguish official AquaLink / iAquaLink integration surfaces from community RS-485 reverse-engineering details

## Cross-vendor design rules

- each protocol family gets an explicit plugin identity, even when multiple families belong to the same vendor
- serial parameters belong to the frame-definition layer, not to general application logic
- frame definitions and payload definitions must be versioned independently where needed
- normalized commands and events must remain stable above the protocol layer even when vendor-specific payloads differ
- capability profiles are the preferred way to express vendor and model specificity without leaking packet semantics into application services
- network/API-driven controller families and bus-level protocol families must be documented distinctly when both exist in the same vendor ecosystem

## Open-source prior art

The source document referenced prior community implementations and research as useful inputs. These are design references, not canonical truth.

- Pentair community implementations are the strongest source of prior art for v1 protocol work
- Jandy community projects provide partial framing and command information
- Hayward public implementation maturity is lower and should be treated cautiously

ASSUMPTION: Protocol plugins should prefer confirmed field behavior from captures and tests over copied assumptions from third-party projects.

## External validation summary

External validation outside this repository supports these conclusions:

- Pentair EasyTouch / IntelliTouch and Pentair IntelliCenter should not be treated as one protocol just because they share a vendor
- Hayward OmniLogic-family systems currently have stronger documented local-network integration evidence than bus-level protocol evidence in the available research
- Jandy AquaLink RS should be treated as a controller/platform family with both official web-connect positioning and community RS-485 reverse-engineering knowledge

These conclusions should guide future protocol-plugin organization and naming.

## Reverse-engineering workflow

When protocol knowledge is incomplete:

1. confirm frame definition first
2. capture repeatable live traffic
3. define or refine payload definitions
4. map payload fields into normalized domain events
5. record unresolved items in [open-questions.md](../product/open-questions.md)
6. store local byte-level discoveries through `protocol_annotations`

## Documentation rules for equipment protocol work

- if framing is known but payload meaning is incomplete, document both states explicitly
- if a payload field is inferred but not confirmed, mark it with `ASSUMPTION:`
- if a message family is known to exist but not yet mapped, mark it with `TODO:`
- if a pool-equipment protocol choice affects architecture or behavior, record the decision in [decisions.md](../product/decisions.md)

## Known unresolved areas

- exact IntelliCenter protocol boundaries vs EasyTouch compatibility
- fuller Hayward frame and payload definitions
- Jandy payload coverage beyond framing and basic command models
- unmapped Pentair action codes and partially known controller-status fields
