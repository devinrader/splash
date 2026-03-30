# Splash Protocol Service

[Back to README](../../README.md)

## Purpose

This directory contains the service-specific design for `splash-protocol`.

`splash-protocol` is the protocol translation service that runs on `splash-core`.
It consumes raw transport traffic from `splash-serial`, reconstructs and decodes
protocol frames, publishes normalized equipment state, and encodes outbound
command intent into transport writes.

## Scope

This service design complements, but does not replace:

- [System Architecture](../../architecture/architecture.md)
- [Deployment Architecture](../../architecture/deployment.md)
- [Equipment Protocols](../../architecture/equipment-protocols.md)
- [Protocol Libraries](../../architecture/protocol-libraries.md)
- [Resilience and Health](../../architecture/resilience.md)
- [Operations and Verification](../../architecture/operations.md)
- [NATS Messaging](../../interfaces/messaging-nats.md)
- [Normalized Contracts](../../interfaces/normalized-contracts.md)

## Service documents

- [Runtime Model](./runtime.md)
  Process model, plugin loading, stream ownership, and degraded-state behavior.
- [Plugin Model](./plugins.md)
  Registry structure, active-plugin rules, and stub-plugin expectations.
- [Command Flow](./commands.md)
  Command intent, encode, write handoff, and result-correlation behavior.
- [Configuration](./configuration.md)
  Runtime configuration, provider model, and validation expectations.
- [Observability](./observability.md)
  Health, metrics, logging, and diagnostics expectations.
- [Testing](./testing.md)
  Unit, integration, replay, and host-close validation strategy.
- [CI Runner Usage](./ci.md)
  Gitea Actions runner, workflow, and build-artifact assumptions for no-hardware CI.

## Core responsibilities

- consume `serial.rx.raw`, `serial.tx.raw`, and `serial.port.status`
- reconstruct frames from raw transport chunks per active `stream_id`
- validate protocol framing and checksums
- decode protocol frames into:
  - `protocol.frame.raw`
  - `protocol.frame.decoded`
  - normalized `equipment.state.*` events
- consume `protocol.command.intent`
- encode normalized command intent into protocol bytes
- publish:
  - `protocol.command.encoded`
  - `serial.write.request`
  - `command.result.{command_id}`
- maintain command correlation state until command completion or timeout
- expose local `GET /healthz` and `GET /metrics`
- support Protocol Explorer diagnostics as a separate runnable consumer surface

## Dependencies

### Direct runtime dependencies

- NATS reachability on `splash-core`
- a configuration-provider path for:
  - `pool_settings.protocol_plugin`
  - `pool_settings.protocol_config`
- milestone-1 may satisfy that provider path through a temporary env-backed
  provider while the longer-term provider implementation is still pending
- local runtime configuration for service-level settings
- container or process supervision on `splash-core`

### Consumed interfaces

- `serial.rx.raw` from `splash-serial`
- `serial.tx.raw` from `splash-serial`
- `serial.port.status` from `splash-serial`
- `protocol.command.intent` from `splash-api`

Raw transport subjects are keyed by `serial_instance_id` and `stream_id`.
`splash-protocol` is responsible for attaching `pool_id` only after it has an
active pool selection or future controller-domain binding.

### Provided interfaces

- `protocol.frame.raw`
- `protocol.frame.decoded`
- `equipment.state.controller`
- `equipment.state.pump`
- `equipment.state.chlorinator`
- `protocol.command.encoded`
- `serial.write.request`
- `command.result.{command_id}`
- `GET /healthz`
- `GET /metrics`

## Explicit non-responsibilities

- direct RS-485 adapter ownership
- raw serial-port reads or writes
- transport write serialization or bus-idle enforcement
- REST API ownership
- SSE broker ownership
- frontend Protocol Explorer UI ownership
- durable persistence of every raw transport chunk or raw frame

Those concerns belong to `splash-serial`, `splash-api`, and other platform
services.
