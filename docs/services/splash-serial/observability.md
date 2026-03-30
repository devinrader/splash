# Observability

[Back to Splash Serial Service](./README.md)

## Health surface

`splash-serial` should expose:

- `GET /healthz`
- `GET /metrics`

This HTTP surface should remain available even if NATS is unavailable.

### `GET /healthz` contract

`GET /healthz` should return JSON shaped like:

```json
{
  "status": "ok",
  "startup_phase": "running_ok",
  "stream_id": "uuid",
  "serial_device": "/dev/ttyUSB0",
  "connection_state": "connected",
  "nats": "ok",
  "configuration": "valid",
  "serial_error_code": null,
  "nats_error_code": null,
  "shutdown_reason": null,
  "last_transition_at": "2026-03-28T16:54:01Z"
}
```

Allowed `status` values:

- `ok`
- `degraded`
- `error`

HTTP behavior:

- `200` for `ok` and `degraded`
- `503` for `error`

Additional health-field expectations:

- `startup_phase`: current runtime phase such as `booting`, `starting_http`, `serial_degraded`, `running_degraded`, or `running_ok`
- `serial_error_code`: machine-readable serial failure code when the serial side is degraded
- `nats_error_code`: machine-readable NATS failure code when the NATS side is degraded
- `shutdown_reason`: the most recent explicit shutdown reason, or `null` while running
- `last_transition_at`: timestamp of the most recent state transition

## Health expectations

Local health should reflect:

- whether the service process is alive
- whether the serial adapter is connected
- whether reconnect is in progress
- whether writes are currently blocked or waiting on idle timing
- whether required configuration is valid
- whether the NATS dependency is currently connected
- the current startup/runtime phase
- the most recent machine-readable dependency error code when degraded

## Metrics expectations

Prometheus metrics should include at least:

- current connection state
- reconnect count
- bytes read
- bytes written
- write failures
- current stream age

### Metric contract

Initial metric names should be:

- `splash_serial_connection_state`
- `splash_serial_reconnect_total`
- `splash_serial_bytes_read_total`
- `splash_serial_bytes_written_total`
- `splash_serial_write_failures_total`
- `splash_serial_stream_age_seconds`
- `splash_serial_serial_failures_total`
- `splash_serial_nats_failures_total`
- `splash_serial_loop_exits_total`
- `splash_serial_shutdowns_total`

Metric guidance:

- use gauges for current state and stream age
- use counters for reconnects, bytes, and failures
- include labels only where they materially improve operability
- ASSUMPTION: `write_result` is the primary label for `splash_serial_write_failures_total`
- `error_code` should be the primary label for serial and NATS failure counters
- `loop` should be the primary label for unexpected loop exits
- `reason` should be the primary label for shutdown counters

## Logging

`splash-serial` should emit structured JSON logs.

Important log events include:

- service start and shutdown
- adapter open and close
- reconnect attempts
- write rejections due to stale `stream_id`
- write timeout or adapter errors
- configuration validation failures
- background loop start
- background loop exit with loop name and reason
- shutdown reason
- serial EOF and serial disconnect classification
- NATS failure classification
- build or package version at startup

Required log fields should include:

- `service`
- `event`
- `stream_id` when present
- `serial_device`
- `loop` when relevant
- `connection_state`
- `startup_phase`
- `error_code`
- `shutdown_reason`
- `package_version` or commit identifier when available

### Logging contract

`splash-serial` logs should be emitted as one JSON object per line.

Required base fields on every log event:

- `ts`: RFC3339 timestamp in UTC
- `level`: `debug`, `info`, `warn`, or `error`
- `service`: always `splash-serial`
- `event`: stable event name
- `message`: human-readable summary
- `startup_phase`: current runtime phase
- `serial_device`: configured serial device path when known
- `package_version`: package version, commit id, or both when available

Optional structured fields used when relevant:

- `stream_id`
- `loop`
- `connection_state`
- `nats_url`
- `error_code`
- `error`
- `shutdown_reason`
- `detail`
- `last_transition_at`

Rules:

- logs should be written to stdout or stderr for capture by `systemd` and `journalctl`
- transport retries should log structured retry events rather than free-form repeated messages
- repeated retry loops should prefer stable event names and error codes so journald queries remain useful
- unexpected panics should be recovered at goroutine boundaries where practical and logged with stack information before process exit

### Event names

Initial stable event names should include:

- `service.start`
- `service.shutdown`
- `config.invalid`
- `http.listen.started`
- `http.listen.failed`
- `serial.connect.attempt`
- `serial.connect.succeeded`
- `serial.connect.failed`
- `serial.session.ended`
- `serial.read.error`
- `serial.reconnect.scheduled`
- `nats.connect.attempt`
- `nats.connect.succeeded`
- `nats.connect.failed`
- `nats.connection.closed`
- `loop.start`
- `loop.exit`
- `loop.unexpected_exit`
- `write.rejected`
- `write.timeout`
- `write.port_error`

### Log-level guidance

Recommended levels:

- `info`:
  - service start and shutdown
  - successful serial connects
  - successful NATS connects
  - expected reconnect scheduling
- `warn`:
  - degraded dependency conditions such as serial EOF, serial open failure, DNS failure, TCP connect failure, or NATS auth failure
  - stale-stream write rejection
  - unexpected clean loop exit
- `error`:
  - fatal startup failure
  - HTTP bind failure
  - internal invariant failure
  - unrecovered panic
- `debug`:
  - high-frequency diagnostic details that would otherwise flood logs in steady-state retry loops

### Example log events

Service start:

```json
{
  "ts": "2026-03-28T20:54:40Z",
  "level": "info",
  "service": "splash-serial",
  "event": "service.start",
  "message": "starting splash-serial",
  "startup_phase": "booting",
  "serial_device": "/dev/ttyUSB0",
  "nats_url": "nats://splash-core.local:4222",
  "package_version": "0.0.0~main.20260328203901+1fcdbf9"
}
```

Serial connect failure:

```json
{
  "ts": "2026-03-28T20:54:40Z",
  "level": "warn",
  "service": "splash-serial",
  "event": "serial.connect.failed",
  "message": "serial adapter connect failed",
  "startup_phase": "serial_degraded",
  "serial_device": "/dev/ttyUSB0",
  "connection_state": "error",
  "error_code": "serial_open_failed",
  "error": "open /dev/ttyUSB0: no such file or directory",
  "package_version": "0.0.0~main.20260328203901+1fcdbf9"
}
```

NATS DNS failure:

```json
{
  "ts": "2026-03-28T20:54:40Z",
  "level": "warn",
  "service": "splash-serial",
  "event": "nats.connect.failed",
  "message": "nats connect failed",
  "startup_phase": "running_degraded",
  "serial_device": "/dev/ttyUSB0",
  "nats_url": "nats://splash-core.local:4222",
  "error_code": "nats_dns_failed",
  "error": "lookup splash-core.local on 10.0.40.1:53: no such host",
  "package_version": "0.0.0~main.20260328203901+1fcdbf9"
}
```

Unexpected loop exit:

```json
{
  "ts": "2026-03-28T20:54:51Z",
  "level": "warn",
  "service": "splash-serial",
  "event": "loop.unexpected_exit",
  "message": "background loop exited cleanly during runtime",
  "startup_phase": "running_degraded",
  "serial_device": "/dev/ttyUSB0",
  "loop": "session",
  "error_code": "unexpected_loop_exit",
  "package_version": "0.0.0~main.20260328203901+1fcdbf9"
}
```

Graceful shutdown:

```json
{
  "ts": "2026-03-28T20:55:10Z",
  "level": "info",
  "service": "splash-serial",
  "event": "service.shutdown",
  "message": "shutting down splash-serial",
  "startup_phase": "shutting_down",
  "serial_device": "/dev/ttyUSB0",
  "shutdown_reason": "signal",
  "package_version": "0.0.0~main.20260328203901+1fcdbf9"
}
```

## Error-code taxonomy

`splash-serial` should expose stable machine-readable error codes in health, logs, and metrics where practical.

Initial codes should include:

- `config_invalid`
- `http_bind_failed`
- `serial_open_failed`
- `serial_permission_denied`
- `serial_read_eof`
- `serial_read_error`
- `serial_disconnected`
- `nats_dns_failed`
- `nats_connect_failed`
- `nats_auth_failed`
- `nats_closed`
- `unexpected_loop_exit`

## Deferred enhancement: active NATS endpoint visibility

If ordered NATS failover is added later, observability should expand to show:

- the currently selected active NATS endpoint
- the configured endpoint priority order
- the endpoint chosen during the most recent reconnect attempt
- whether the current session was established through failover rather than the
  first-priority endpoint

That observability is deferred with the failover feature itself.

These codes are intended for operational diagnosis and should remain stable once implemented.

## Relationship to NATS status

NATS remains part of the platform event model through:

- `serial.port.status`
- `serial.rx.raw`
- `serial.tx.raw`

But direct service health and Prometheus scraping must not depend on NATS publication succeeding.

If NATS is unavailable at startup or becomes unavailable later:

- `GET /healthz` should remain reachable
- `GET /metrics` should remain reachable
- health should report a degraded dependency state for NATS rather than crashing the process
- the service should continue retrying NATS in the background
- logs and metrics should identify the NATS failure class with a machine-readable error code

## Observability dependencies

- local health and metrics do not depend on PostgreSQL, InfluxDB, API, or scheduler availability
- NATS state may influence degraded health reporting, but must not remove access to `GET /healthz` or `GET /metrics`
- Prometheus scraping is an external operational dependency, not a runtime requirement for the daemon to function

## Local bind expectation

- `SERIAL_HTTP_BIND` should default to loopback, such as `127.0.0.1:9108`
- LAN exposure of the health or metrics listener is out of scope unless explicitly added to the design later
