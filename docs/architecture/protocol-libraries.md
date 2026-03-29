# Protocol Libraries

[Back to README](../README.md)

## Purpose

This document defines the library architecture that sits under
`splash-protocol`.

It exists to keep the boundary clear between:

- service runtime concerns
- protocol core library concerns
- vendor or family-specific plugin concerns

## Design goals

The protocol-library architecture should:

- isolate vendor-specific wire behavior from service runtime code
- support multiple loaded protocol plugins in one process
- keep one active live plugin per pool in v1
- allow Protocol Explorer to reuse the same plugin implementations as live decode
- preserve a clear normalized boundary above protocol specifics
- support deterministic no-hardware testing

## Layer model

The design should distinguish three implementation layers under the service:

1. protocol core library
2. vendor or family-specific plugin libraries
3. service adapter layer inside `splash-protocol`

### Protocol core library

The protocol core library owns generic protocol-processing mechanics that should
not be reimplemented in each vendor plugin.

Core responsibilities:

- stream-scoped frame assembly orchestration
- buffer management by `stream_id`
- plugin registry contracts
- handoff between raw transport chunks and plugin frame assembly
- command-correlation orchestration
- timeout handling for pending commands
- standardized error shapes and reason codes
- normalized-event publication helpers or mapping contracts

The core library should not own:

- Pentair-specific frame structure
- vendor-specific checksum rules
- payload decode semantics
- vendor-specific command bytes
- service networking, HTTP, or NATS connectivity

### Vendor or family-specific plugin libraries

Each plugin library owns one protocol family or variant.

Plugin responsibilities:

- protocol identity and metadata
- transport settings metadata where relevant
- frame-boundary hints and framing rules
- checksum calculation and validation
- payload decode
- normalized mapping for supported equipment and commands
- command encode
- command/response correlation hints

Plugin libraries should not own:

- direct NATS subscriptions or publications
- HTTP endpoints
- process supervision
- generic command timeout scheduling
- generic stream lifecycle ownership

### Service adapter layer

The `splash-protocol` service adapter layer owns runtime integration of the
libraries.

Service adapter responsibilities:

- NATS integration
- configuration-provider integration
- health and metrics
- active-plugin selection for live traffic
- publication of protocol-level and normalized events
- publication of command-result state

## Plugin contract expectations

The concrete language interface may evolve, but every plugin should provide a
narrow contract that covers:

- identity and version metadata
- capability-profile catalog contribution or lookup support
- frame assembly or frame parsing entrypoints
- frame validation
- decode output
- normalized mapping output
- command encode
- command matching or correlation hints
- unsupported-operation behavior

## Multi-plugin process model

Multiple plugins may be loaded into the registry.

Rules:

- the registry is process-local
- multiple plugin libraries may be present and loaded at startup
- registry population should come from local discovery of packaged plugins or a
  known plugin directory
- one pool resolves to one active live plugin at a time in v1
- no plugin competition for the same live stream in normal operation
- Protocol Explorer may invoke any loaded plugin for offline or diagnostic flows

## Stub plugin model

Stub plugin libraries are valuable even before full protocol support exists.

Stub plugins should:

- register cleanly in the registry
- expose identity and metadata
- reject decode or encode operations with structured unsupported errors
- help validate the multi-protocol runtime shape

Initial stub expectations:

- `jandy_aqualink_rs`
- `hayward_omnilogic_local`

## Capability-profile relationship

Protocol libraries must remain below the normalized capability boundary.

Rules:

- plugins may know how protocol observations map to capability profiles
- plugins may emit protocol-specific decoded fields for diagnostics
- the normalized vocabulary remains authoritative for application services
- application services must not consume plugin-private protocol structures directly

## Reuse by Protocol Explorer

Protocol Explorer should reuse the same plugin libraries as live traffic
processing.

Implications:

- offline decode should use the same decode logic as live runtime
- dry-run or simulate operations should use the same command-encode logic as live runtime
- plugin behavior must not depend on hidden service-only decode rules

## Testing implications

Library boundaries should support:

- unit tests for plugin decode and encode behavior
- replay tests for frame sequences and malformed data
- core-library tests for stream reset and command-correlation behavior
- service integration tests for NATS subject flow and runtime degradation

This split is required so protocol correctness does not depend entirely on
service-level integration tests.
