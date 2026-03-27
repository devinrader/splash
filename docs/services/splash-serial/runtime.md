# Runtime Model

[Back to Splash Serial Service](./README.md)

## Process model

`splash-serial` runs as a native Go daemon on `splash-zero` under `systemd`.

It should:

- start independently of Docker
- be installed from an OS package rather than a manually copied binary
- load runtime configuration from `/etc/splash/splash-serial.env`
- connect to NATS on `splash-core`
- own a single active serial port session in v1

## Runtime dependencies

The runtime model assumes:

- one configured serial adapter is available to the process
- the service can reach NATS on `splash-core`
- `systemd` handles restart behavior
- Prometheus or local operators may access the local HTTP health and metrics listener

If NATS is unavailable at startup:

- `splash-serial` should still start
- local health and metrics should remain available
- health should report a degraded NATS dependency state
- NATS connection attempts should continue in the background until a connection is established
- serial-port lifecycle may continue independently of NATS availability

ASSUMPTION: in v1, background NATS reconnect attempts may reuse the existing
`SERIAL_RECONNECT_INTERVAL_MS` timing until a dedicated NATS reconnect setting
is added to the design

## Session model

A port session is the active runtime binding between `splash-serial` and the configured serial adapter.

Each active session has:

- one `stream_id`
- one configured serial device path
- one connection state
- one read loop
- one serialized write path

## `stream_id`

`stream_id` is the transport session identity used to distinguish old and new port sessions.

Rules:

- a new `stream_id` is created every time the serial port reconnects
- ordering guarantees only apply within one `stream_id`
- downstream consumers must treat a changed `stream_id` as a session reset
- stale write requests targeting an old `stream_id` must be rejected

## Lifecycle states

Expected transport lifecycle states:

- `connecting`
- `connected`
- `disconnected`
- `error`
- `write_blocked`

These states are surfaced through `serial.port.status` and should also influence local health and metrics.

## Reconnect behavior

When the adapter or port becomes unavailable:

- the active session is terminated
- `serial.port.status` should reflect the degraded state
- reconnect attempts should continue on the configured interval
- a successful reconnect must create a new `stream_id`

## Responsibility boundary

`splash-serial` owns:

- port lifecycle
- read loop
- write loop
- write ordering
- bus-idle enforcement
- transport observability

`splash-serial` does not own:

- frame buffering
- protocol decode
- protocol encode
- command-response correlation

Those remain in `splash-protocol`.

## Serial-port abstraction

`splash-serial` should isolate adapter I/O behind a narrow serial-port interface.

Design intent:

- runtime code should depend on an abstract port boundary rather than directly on a concrete serial library in most of the service logic
- this abstraction should support a real adapter implementation and one or more test doubles
- transport behavior should be testable without requiring physical hardware for every test
- the service should also isolate time-dependent behavior behind a controllable clock or timer boundary where practical so reconnect, timeout, and idle-delay logic can be tested deterministically

## Service relationship summary

Upstream dependency:

- `splash-protocol` publishes `serial.write.request`

Downstream dependency:

- `splash-protocol` consumes `serial.rx.raw`, `serial.tx.raw`, and `serial.port.status`

Operational consumer:

- Prometheus or local operators consume `GET /metrics` and `GET /healthz`
