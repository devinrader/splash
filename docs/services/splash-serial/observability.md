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
  "stream_id": "uuid",
  "serial_device": "/dev/ttyUSB0",
  "connection_state": "connected",
  "nats": "ok",
  "configuration": "valid"
}
```

Allowed `status` values:

- `ok`
- `degraded`
- `error`

HTTP behavior:

- `200` for `ok` and `degraded`
- `503` for `error`

## Health expectations

Local health should reflect:

- whether the service process is alive
- whether the serial adapter is connected
- whether reconnect is in progress
- whether writes are currently blocked or waiting on idle timing
- whether required configuration is valid

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

Metric guidance:

- use gauges for current state and stream age
- use counters for reconnects, bytes, and failures
- include labels only where they materially improve operability
- ASSUMPTION: `write_result` is the primary label for `splash_serial_write_failures_total`

## Logging

`splash-serial` should emit structured JSON logs.

Important log events include:

- service start and shutdown
- adapter open and close
- reconnect attempts
- write rejections due to stale `stream_id`
- write timeout or adapter errors
- configuration validation failures

## Relationship to NATS status

NATS remains part of the platform event model through:

- `serial.port.status`
- `serial.rx.raw`
- `serial.tx.raw`

But direct service health and Prometheus scraping must not depend on NATS publication succeeding.

## Observability dependencies

- local health and metrics do not depend on PostgreSQL, InfluxDB, API, or scheduler availability
- NATS state may influence degraded health reporting, but must not remove access to `GET /healthz` or `GET /metrics`
- Prometheus scraping is an external operational dependency, not a runtime requirement for the daemon to function

## Local bind expectation

- `SERIAL_HTTP_BIND` should default to loopback, such as `127.0.0.1:9108`
- LAN exposure of the health or metrics listener is out of scope unless explicitly added to the design later
