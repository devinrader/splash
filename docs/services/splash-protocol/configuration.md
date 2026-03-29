# Configuration

[Back to Splash Protocol Service](./README.md)

## Runtime source

`splash-protocol` should load service-level runtime configuration from its
runtime environment.

Plugin availability should be discovered locally from the packaged plugin set
or plugin directory.

Pool-selected plugin identity and plugin-specific options should be obtained
through a configuration-provider abstraction rather than being treated as
static service env alone.

## Expected service-level environment variables

| Variable | Purpose |
| --- | --- |
| `NATS_URL` | NATS connection target on `splash-core` |
| `PROTOCOL_HTTP_BIND` | Bind address for local health and metrics listener |
| `PROTOCOL_COMMAND_TIMEOUT_MS` | Default command-correlation timeout |
| `LOG_LEVEL` | Runtime log verbosity |
| `TZ` | Local timezone for logs and operations context |

Optional future bootstrap variables may exist for degraded startup support, but
the concrete fallback source for pool-selected plugin identity and
`protocol_config` is intentionally left open in this design pass.

## Local plugin discovery expectations

Available plugins are a local runtime concern, not a pool-settings concern.

Rules:

- `splash-protocol` should discover locally installed or packaged plugins at
  startup
- discovery may use a known plugin directory, built-in packaged modules, or
  both
- discovered plugin ids define the set of valid active plugin choices for the
  pool
- missing plugin implementations degrade live decode and command handling
  instead of crashing the service

## Configuration-provider expectations

The provider must supply:

- `pool_settings.protocol_plugin`
- `pool_settings.protocol_config`

Provider rules:

- normal operation may read from PostgreSQL-backed configuration
- provider-backed plugin selection must resolve only against locally discovered
  plugin ids
- runtime should not hard-fail solely because the backing database is
  temporarily unavailable
- stale or unavailable provider data must degrade decode or command behavior
  rather than crashing the service

## Validation expectations

Static service configuration should be validated at startup.

Validation rules:

- `NATS_URL` is required
- `PROTOCOL_HTTP_BIND` is required and must parse as a valid host:port bind target
- `PROTOCOL_COMMAND_TIMEOUT_MS` is required and must be greater than `0`

Validation outcomes:

- invalid static service configuration is fatal
- invalid provider-backed plugin selection or plugin config is degraded, not fatal

Examples of fatal static config:

- missing `NATS_URL`
- invalid `PROTOCOL_HTTP_BIND`
- non-numeric or zero `PROTOCOL_COMMAND_TIMEOUT_MS`

Examples of degraded provider config:

- unknown `protocol_plugin`
- `protocol_plugin` selected by the pool but not present in the local
  discovered plugin set
- malformed `protocol_config` for the selected plugin
- provider unavailable at startup

## Example

```dotenv
NATS_URL=nats://splash-nats:4222
PROTOCOL_HTTP_BIND=127.0.0.1:9110
PROTOCOL_COMMAND_TIMEOUT_MS=5000
LOG_LEVEL=info
TZ=America/New_York
```
