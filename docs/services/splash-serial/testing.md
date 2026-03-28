# Testing

[Back to Splash Serial Service](./README.md)

## Test strategy

`splash-serial` should be tested at three levels:

- unit tests
- integration tests
- hardware-in-the-loop tests

## No-hardware requirement

`splash-serial` must support a fully automated no-hardware test path.

Design rule:

- CI should be able to validate core service correctness without a physical RS-485 adapter or pool equipment
- hardware-in-the-loop tests validate real-world behavior, but they do not replace the mandatory no-hardware path

## CI runner assumptions

The primary automated no-hardware path is expected to run in a Gitea container-based runner.

The authoritative runner-label and workflow-usage guidance lives in [CI Runner Usage](./ci.md).

Required runner capabilities:

- Linux container environment
- PTY support through `/dev/ptmx` and `devpts`
- ability to run a local test NATS instance in the test job or as a sidecar service
- ability to execute the compiled `splash-serial` test binary inside the container

Container image expectations:

- include the tools and libraries needed for PTY-backed tests
- include a shell and basic process utilities for integration-test orchestration
- support loopback networking inside the container

### Recommended CI tools and libraries

For a Go-based `splash-serial` implementation, the no-hardware CI path should standardize on these tools:

- Go test runner: `go test`
- PTY library: `github.com/creack/pty`
- NATS test dependency: either
  - `github.com/nats-io/nats-server/v2/server` for in-process startup, or
  - `nats:2` as a sidecar container image
- HTTP assertions: standard Go HTTP client is sufficient
- process orchestration in the test container: `/bin/sh` or `/bin/bash`

Recommended container packages or capabilities:

- `ca-certificates`
- `bash` or equivalent POSIX shell
- `coreutils`
- `procps` or equivalent minimal process-inspection tools
- PTY support via the kernel-provided `/dev/ptmx` and `devpts`

Explicitly not required:

- `socat`
- physical serial adapters
- USB passthrough
- privileged container access for normal PTY-backed tests

ASSUMPTION: The Gitea runner image and runtime will allow PTY allocation inside the container without requiring physical device passthrough.

## Unit tests

Unit coverage should include:

- config validation
- `stream_id` generation and rollover behavior
- stale write rejection
- write serialization
- bus-idle wait calculation
- transport behavior using a fake serial-port implementation
- deterministic timeout and reconnect behavior using a controllable clock or timer abstraction

### Mocking strategy

`splash-serial` should be designed to support mocking the serial port.

Required test doubles:

- in-memory fake port for deterministic unit tests
- optional mock or spy behavior for asserting reads, writes, timeouts, and close behavior

Recommended Go support libraries:

- standard library only for the fake port implementation is preferred
- a mocking library is optional, but the design should not require one

The fake port should be able to simulate:

- incoming byte chunks
- successful writes
- write timeouts
- port errors
- disconnect and reconnect events

The fake-port path should not require:

- `/dev/tty*`
- PTY support
- NATS if the test is exercising isolated service logic only

Unit tests should be mandatory in CI.

## Integration tests

Integration coverage should include:

- NATS publish and subscribe behavior for transport subjects
- `serial.write.request` consumption
- `serial.tx.raw` result publication
- local `GET /healthz` and `GET /metrics` availability
- PTY-backed or loopback-backed serial emulation
- degraded startup with NATS unavailable
- degraded startup with serial hardware unavailable
- repeated serial EOF or disconnect handling without process exit
- unexpected loop-exit diagnostics

Integration tests should also be mandatory in CI.

### Integration emulation

Integration tests should use a pseudo-terminal or loopback-backed serial device to validate:

- native read-boundary behavior
- real read and write loop interaction
- reconnect handling against a more realistic transport surface than an in-memory fake
- stale write rejection through the full NATS and transport path
- timeout and port-error reporting through `serial.tx.raw`

ASSUMPTION: The supported test environment for `splash-serial` includes PTY support on developer machines and CI runners.

Recommended implementation approach:

- allocate PTY pairs using `github.com/creack/pty`
- pass the slave PTY path into `splash-serial` as `SERIAL_DEVICE`
- drive the master side from the test harness to simulate remote equipment traffic

### Container-runner PTY requirements

PTY-backed integration tests in a container runner require:

- `/dev/ptmx` availability inside the container
- `devpts` mounted and usable by the test process
- no requirement for privileged access to physical serial devices

The tests should not require:

- USB device passthrough
- host-level `/dev/ttyUSB*` access
- RS-485 hardware

### NATS harness in CI

Integration tests should run against an isolated NATS test instance.

Recommended options:

- start NATS in-process for the test suite if practical
- or run a short-lived NATS sidecar container dedicated to the test job

Preferred order:

1. in-process NATS for faster isolated tests where startup and teardown are simple
2. sidecar `nats:2` container when closer parity with deployment behavior is preferred

The harness should allow tests to:

- subscribe to transport subjects
- publish `serial.write.request`
- assert ordering and payload content for `serial.rx.raw`, `serial.tx.raw`, and `serial.port.status`

### CI test split

Recommended CI split:

- unit job
  fake port, fake clock, no PTY required
- integration job
  PTY-backed serial emulation plus test NATS

Recommended runner composition:

- unit job container:
  - Go toolchain only
  - no PTY requirement beyond normal Linux process support
- integration job container:
  - Go toolchain
  - PTY-capable runtime
  - access to `/dev/ptmx`
  - either embedded NATS support or a `nats:2` sidecar

This split keeps failures easier to diagnose and avoids making the pure unit path depend on PTY availability.

### Failure diagnostics

When PTY-backed CI tests fail, logs should capture at least:

- PTY creation failure
- NATS startup or connection failure
- transport state transitions
- `stream_id` values across reconnect tests
- published `serial.tx.raw.write_result` values
- startup phase and degraded dependency state
- machine-readable error codes for serial and NATS failures
- shutdown reason or unexpected loop-exit reason when the process exits

## Hardware-in-the-loop tests

Hardware validation should include:

- adapter detection and reconnect behavior on `splash-zero`
- native read-boundary publication against a real adapter
- command round-trip behavior with `splash-protocol`
- idle-timing behavior on the real bus

Hardware-in-the-loop tests remain necessary even with mocks because USB adapter behavior, buffering, and disconnect handling may differ from fake or PTY-based transport.

Hardware-in-the-loop tests are not required for every CI run.

## Critical behaviors to validate

- reconnect creates a new `stream_id`
- old-session writes are rejected
- raw chunking does not imply frame boundaries
- transport success is separated from protocol-level command success
- `/healthz` and `/metrics` remain available without hardware
- no-hardware CI coverage can validate the service in isolation

## Required harnesses

The service design requires:

- fake-port unit harness
- controllable clock or timer harness where timing behavior is under test
- PTY-backed integration harness
- NATS test harness for publish and subscribe assertions

## Design implications for implementation

To support container-runner CI, the implementation should:

- keep serial-port construction behind an injectable factory
- avoid hard-coding device paths in transport logic
- allow the service to run against a PTY path provided by the test harness
- allow HTTP bind ports and NATS URLs to be injected per test run
- keep timing logic controllable enough to avoid flaky reconnect and timeout tests

Recommended implementation-level dependencies:

- serial runtime library: implementation choice left open, but isolated behind the serial-port abstraction
- PTY test library: `github.com/creack/pty`
- NATS client library compatible with the chosen runtime
- no implementation code outside the concrete adapter layer should depend directly on PTY-specific APIs
