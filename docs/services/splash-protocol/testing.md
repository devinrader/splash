# Testing

[Back to Splash Protocol Service](./README.md)

## Test strategy

`splash-protocol` should be tested at four levels:

- unit tests
- integration tests
- replay or fixture tests
- end-to-end platform validation

## No-hardware requirement

`splash-protocol` must support a fully automated no-hardware test path.

Core design rule:

- CI must validate decode, normalize, encode, and command-correlation behavior
  without a physical RS-485 adapter
- live-host validation remains useful, but does not replace automated tests

## Unit tests

Unit coverage should include:

- plugin registry behavior
- frame assembly behavior per stream
- checksum and framing validation
- Pentair decode paths for controller, pump, and chlorinator state
- unsupported-plugin stub behavior
- command encode behavior
- command correlation transitions
- stream reset behavior that clears partial frame buffers and pending command state

Recommended unit harness:

- fixture byte sequences
- plugin-local decode and encode tests
- deterministic fake timers for command timeout behavior

## Integration tests

Integration coverage should include:

- live NATS subject flow through:
  - `serial.rx.raw`
  - `protocol.frame.raw`
  - `protocol.frame.decoded`
  - `equipment.state.*`
  - `protocol.command.encoded`
  - `serial.write.request`
  - `serial.tx.raw`
  - `command.result.{command_id}`
- degraded startup with NATS unavailable
- degraded startup with configuration-provider unavailable
- stream rollover behavior when `stream_id` changes
- stale transmit and timeout command-result handling

Recommended harness:

- in-process or sidecar NATS
- fixture-driven raw chunk publication instead of physical serial hardware
- explicit stream-id rollover scenarios

## Replay and fixture tests

Replay tests should validate:

- known-good Pentair frame sequences
- mixed transport chunk boundaries that still assemble into the same frames
- malformed frames and checksum failures
- command/response matching against recorded or synthetic sequences

Replay fixtures should remain a first-class part of the design because they are
the fastest way to validate protocol behavior without hardware.

## End-to-end validation

End-to-end validation should cover:

- `splash-serial` publishing live raw bytes
- `splash-protocol` decoding them into normalized events
- command intent flowing through encode, transport handoff, transmit result,
  and completion

This layer may run without real hardware if the transport source is simulated,
but it must use the real service runtime boundaries.

## CI expectations

For a TypeScript or Node.js implementation, CI should include:

- unit test job
- integration test job
- fixture or replay test job
- build job for the service package or image artifact

CI should not require:

- physical RS-485 hardware
- direct `/dev/ttyUSB*` access
- privileged containers

## Failure diagnostics

When CI tests fail, logs should capture at least:

- active plugin identity
- `serial_instance_id`, `pool_id` when known, and `stream_id`
- frame ids or fixture identifiers where relevant
- command ids for command-flow failures
- machine-readable error codes for decode and command failures
- startup phase and degraded dependency state
