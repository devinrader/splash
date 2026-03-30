# Configuration

[Back to Splash Serial Service](./README.md)

## Runtime source

`splash-serial` loads runtime configuration from `/etc/splash/splash-serial.env`.

## Expected environment variables

| Variable | Purpose |
| --- | --- |
| `NATS_URL` | NATS connection target on `splash-core` |
| `SERIAL_DEVICE` | Serial adapter device path such as `/dev/ttyUSB0` |
| `SERIAL_RECONNECT_INTERVAL_MS` | Reconnect cadence after adapter or port failure |
| `SERIAL_WRITE_TIMEOUT_MS` | Maximum duration for one write attempt |
| `SERIAL_HTTP_BIND` | Bind address for local health and metrics listener |
| `SERIAL_DEFAULT_IDLE_MS` | Fallback bus-idle minimum when no stricter per-write value is supplied |
| `SERIAL_INSTANCE_ID_FILE` | Optional path to the persisted durable `serial_instance_id` file |
| `LOG_LEVEL` | Runtime log verbosity |
| `TZ` | Local timezone for logs and operations context |

`SERIAL_INSTANCE_ID_FILE` should default to a service-owned writable path such
as `/var/lib/splash/splash-serial/instance-id` when not explicitly configured.

## Deferred enhancement: ordered NATS failover

V1 uses a single required `NATS_URL`.

Future enhancement direction:

- `splash-serial` may later support an ordered `NATS_URLS` list
- endpoints would be attempted in priority order until one connects
- once connected, the service should stay on the current healthy endpoint and
  must not automatically fail back to a higher-priority endpoint while the
  current connection remains healthy
- the ordered list would be re-evaluated only after disconnect or reconnect

This behavior is intentionally deferred because it changes:

- transport configuration shape
- runtime failover semantics
- health, metrics, and logging expectations for the active NATS endpoint

## Validation expectations

Configuration should be validated at startup.

Invalid configuration should:

- surface clearly in logs
- surface a machine-readable `config_invalid` error code
- prevent unsafe transport behavior
- fail startup

Validation rules:

- `NATS_URL` is required
- `SERIAL_DEVICE` is required
- `SERIAL_RECONNECT_INTERVAL_MS` is required and must be greater than `0`
- `SERIAL_WRITE_TIMEOUT_MS` is required and must be greater than `0`
- `SERIAL_HTTP_BIND` is required and must parse as a valid host:port bind target
- `SERIAL_DEFAULT_IDLE_MS` is required and must be greater than or equal to `0`
- `SERIAL_INSTANCE_ID_FILE` may be omitted only when the implementation default
  path is available and writable
- the resolved instance-id path must be readable after first initialization and
  writable when the durable identity file does not yet exist

Startup behavior:

- missing required transport configuration should fail startup rather than start in a partially configured state
- invalid optional logging or formatting configuration may degrade startup behavior, but must not silently alter transport safety
- invalid configuration is a fatal startup condition because it is not recoverable without configuration change and service restart

Examples:

- missing `SERIAL_DEVICE`
- malformed `NATS_URL`
- non-numeric reconnect or timeout values
- invalid `SERIAL_HTTP_BIND`

## Example

```dotenv
NATS_URL=nats://splash-nats:4222
SERIAL_DEVICE=/dev/ttyUSB0
SERIAL_RECONNECT_INTERVAL_MS=10000
SERIAL_WRITE_TIMEOUT_MS=2000
SERIAL_HTTP_BIND=127.0.0.1:9108
SERIAL_DEFAULT_IDLE_MS=50
SERIAL_INSTANCE_ID_FILE=/var/lib/splash/splash-serial/instance-id
LOG_LEVEL=info
TZ=America/New_York
```
