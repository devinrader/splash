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
- maintain a durable `serial_instance_id` that survives restarts on the same
  host installation

## Runtime state machine

`splash-serial` should follow an explicit runtime state model.

Primary startup and runtime phases:

- `booting`
- `config_invalid`
- `starting_http`
- `starting_serial`
- `serial_degraded`
- `nats_degraded`
- `running_degraded`
- `running_ok`
- `fatal`
- `shutting_down`

State meanings:

- `booting`: process has started but has not yet completed configuration validation
- `config_invalid`: required configuration is missing or invalid; process must exit and rely on service restart only after configuration is corrected
- `starting_http`: configuration is valid and the local health and metrics listener is being established
- `starting_serial`: HTTP listener is available and the service is attempting to establish a serial session
- `serial_degraded`: serial hardware is unavailable or unstable, but the process remains alive and retries in the background
- `nats_degraded`: NATS is unavailable or misconfigured, but the process remains alive and retries in the background
- `running_degraded`: at least one recoverable dependency is degraded, but the daemon is still serving local health and metrics
- `running_ok`: local HTTP is available, serial is connected, and NATS is connected
- `fatal`: the process has encountered an unrecoverable startup failure and should exit
- `shutting_down`: explicit service termination after signal or unrecoverable failure handling

## Fatal vs degraded failures

`splash-serial` must distinguish between unrecoverable startup failures and recoverable dependency failures.

Fatal failures:

- invalid configuration
- HTTP bind failure for `SERIAL_HTTP_BIND`
- internal invariant failures that leave the service unable to provide safe transport behavior or local observability

Degraded but non-fatal failures:

- serial adapter missing at startup
- serial adapter permission or open failures
- serial adapter EOF or disconnect after a successful connect
- repeated serial reconnect flapping
- NATS DNS failures
- NATS TCP connection failures
- NATS authentication or protocol failures
- NATS disconnect after initial connect

Rule:

- only fatal failures may terminate the process automatically
- degraded failures must keep the process alive, keep `/healthz` and `/metrics` reachable, and continue retry behavior in the background

## Startup failure policy

Startup should proceed in this order:

1. validate configuration
2. establish the local HTTP listener
3. begin serial and NATS background loops
4. transition into `running_ok` or `running_degraded` depending on dependency availability

Startup outcomes:

- configuration invalid:
  - phase becomes `config_invalid`
  - health listener is not started
  - process exits
- HTTP bind failure:
  - phase becomes `fatal`
  - process exits
- serial unavailable at startup:
  - phase becomes `serial_degraded`
  - process stays alive
  - health and metrics stay available
  - serial reconnect attempts continue in the background
- NATS unavailable at startup:
  - phase becomes `nats_degraded`
  - process stays alive
  - health and metrics stay available
  - NATS reconnect attempts continue in the background
- both serial and NATS unavailable:
  - phase becomes `running_degraded`
  - process stays alive
  - local observability stays available
  - both reconnect loops continue independently

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

## Deferred enhancement: sticky prioritized NATS endpoints

Future enhancement direction:

- `splash-serial` may later accept a prioritized list of NATS endpoints instead
  of one `NATS_URL`
- the service would attempt those endpoints in order until one connects
- after a successful connection, the service should stay on the currently
  connected endpoint while it remains healthy
- the service should not automatically fail back to a higher-priority endpoint
  during a healthy active connection
- endpoint selection should be reconsidered only after disconnect or reconnect

This is deferred enhancement work rather than current behavior.

## Session model

A port session is the active runtime binding between `splash-serial` and the configured serial adapter.

Each active session has:

- one durable `serial_instance_id`
- one `stream_id`
- one configured serial device path
- one connection state
- one read loop
- one serialized write path

## `serial_instance_id`

`serial_instance_id` is the durable identity of one installed `splash-serial`
instance.

Rules:

- it is generated locally by `splash-serial` on first successful startup
- it must be persisted to local disk and reused across restarts
- it must be published on `serial.rx.raw`, `serial.tx.raw`, and
  `serial.port.status`
- failure to read or persist the configured durable identity store is a fatal
  startup condition because the service cannot safely maintain transport
  identity across restarts
- `serial_instance_id` is not a `pool_id` and must not be inferred from the
  RS-485 wire protocol

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

Repeated serial reconnect flapping should remain a degraded state rather than automatically escalating to fatal process exit.

## Unexpected loop exits

The daemon is expected to run multiple long-lived background loops for:

- local HTTP serving
- serial session lifecycle
- write-request handling
- NATS connection lifecycle

Rules:

- no background loop should return cleanly during normal operation except during explicit shutdown
- an unexpected clean loop exit must be treated as an internal error condition, logged explicitly, and surfaced through degraded health
- an unexpected clean loop exit must not by itself terminate the process unless it removes the local HTTP health and metrics surface or otherwise breaks a fatal invariant
- recoverable loops should be restarted or transitioned into background retry behavior instead of allowing the process to end silently

## Serial failure handling

Serial failure handling must distinguish between startup failure, runtime disconnect, and transient instability.

Serial startup failures:

- missing device
- permission denied
- open failure

Required behavior:

- classify as degraded
- publish `serial.port.status`
- expose machine-readable error information in local health
- retry on the configured reconnect interval

Runtime serial failures:

- `io.EOF`
- explicit port close
- read failure
- adapter unplug or reset

Required behavior:

- terminate the active session
- publish a transport-visible disconnect or error state
- clear the prior active `stream_id`
- retry on the configured reconnect interval
- create a new `stream_id` after a successful reconnect

`io.EOF` should be treated as a degraded transport disconnect, not as a fatal process condition.

## NATS failure handling

All NATS startup and runtime failures should remain degraded rather than fatal in v1.

Examples:

- DNS lookup failure
- TCP connect failure
- authentication failure
- runtime disconnect or reconnecting state

Required behavior:

- keep the local HTTP surface alive
- keep serial lifecycle behavior active
- expose a degraded NATS dependency state through health and metrics
- continue reconnect attempts in the background

NATS authentication or configuration failures should still remain degraded in v1, even though operator intervention may be required to recover.

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
