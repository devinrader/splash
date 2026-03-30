# Transport Contract

[Back to Splash Serial Service](./README.md)

## Purpose

This document defines the transport-facing behavior of `splash-serial`.

The authoritative subject and payload shapes live in [NATS Messaging](../../interfaces/messaging-nats.md). This document defines how `splash-serial` should behave when publishing or consuming those contracts.

## Port abstraction dependency

Transport logic should operate through a serial-port abstraction rather than binding service logic directly to one concrete library implementation.

This abstraction should support:

- a real adapter-backed implementation for production
- a fake or mock implementation for unit tests
- a PTY-backed or loopback-backed implementation for integration tests

Design requirement:

- `splash-serial` should not be considered implementation-ready unless its transport behavior can be exercised through both a fake-port harness and a PTY-backed no-hardware integration harness

## Interface dependencies

Transport-facing dependencies:

- consumes `serial.write.request` from `splash-protocol`
- publishes `serial.rx.raw` for `splash-protocol`
- publishes `serial.tx.raw` for `splash-protocol`
- publishes `serial.port.status` for `splash-protocol` and broader platform observability

Transport identity rules:

- `splash-serial` must include `serial_instance_id` on every published raw
  transport subject
- raw transport subjects must not require `pool_id`
- pool binding belongs above the transport layer because the serial wire format
  does not expose a Splash pool identifier

## Transport lifecycle expectations

Transport loops are expected to remain long-lived.

Rules:

- a serial disconnect, EOF, or NATS outage must not terminate the daemon
- transport loops should transition the service into degraded state and continue retry behavior
- an unexpected clean transport-loop exit should be treated as an internal error and surfaced through local observability

## Read path

### Native read boundaries

`splash-serial` must publish `serial.rx.raw` using native serial read boundaries.

Implications:

- `serial.rx.raw` messages are not frames
- `serial.rx.raw` chunk size is implementation-dependent
- transport must not add frame-aware buffering
- `splash-protocol` must reconstruct frames from the raw stream

## Write path

### Input contract

`splash-serial` consumes `serial.write.request`.

It must:

- validate that the request `stream_id` matches the active session
- serialize writes so only one transport write is active at a time
- enforce any minimum bus-idle timing before sending
- attempt the port write within the configured timeout
- publish the result as `serial.tx.raw`

### Write result semantics

`serial.tx.raw.write_result` must use one of these values:

- `ok`
- `stale_stream`
- `timeout`
- `port_error`
- `rejected`

Expected meanings:

- `ok`: bytes were written to the serial port
- `stale_stream`: request targeted an inactive `stream_id`
- `timeout`: the write exceeded `SERIAL_WRITE_TIMEOUT_MS`
- `port_error`: the adapter or port returned a write failure
- `rejected`: the write was refused for another transport-level reason

### Stale request rejection

If `serial.write.request.stream_id` does not match the active session:

- do not write to the port
- emit transport-visible failure through `serial.tx.raw` with `write_result = stale_stream`
- increment the relevant write-failure metrics
- leave protocol-level command success or failure ownership to `splash-protocol`

### Adapter assumptions

V1 assumptions:

- one active serial adapter only
- hot-swap may occur and should trigger reconnect behavior, but multi-adapter scheduling is out of scope
- a stable device path is preferred
- ASSUMPTION: `/dev/serial/by-id/...` is preferred over volatile `/dev/ttyUSB*` naming when available on the target host
- the concrete serial library is an implementation detail behind the port abstraction

## Bus-idle enforcement

`splash-protocol` may provide a per-write requirement using `bus_requirements.requires_idle_ms`.

Transport rules:

- `splash-serial` owns the actual timing measurement
- `splash-serial` must wait until the bus has been idle for at least the required minimum
- if no per-write requirement is supplied, `splash-serial` may use `SERIAL_DEFAULT_IDLE_MS`
- bus-idle enforcement must remain a transport concern, not protocol parsing logic

## Ordering guarantees

Ordering guarantees:

- read ordering is preserved only within one `stream_id`
- write execution is serialized by `splash-serial`
- transport ordering does not imply protocol-level command success

## Published transport subjects

`splash-serial` publishes:

- `serial.rx.raw`
- `serial.tx.raw`
- `serial.port.status`

`splash-serial` consumes:

- `serial.write.request`

## `serial.port.status` detail guidance

`serial.port.status.detail` should carry concise operational detail for transport transitions.

Examples:

- `adapter connected`
- `adapter read ended`
- `serial_read_eof`
- `serial_open_failed`
- `nats_dns_failed`
- `unexpected_loop_exit`

Machine-readable error codes belong in local health, logs, and metrics; `detail` is the short transport-facing explanation.
