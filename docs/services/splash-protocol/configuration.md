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

For milestone-1 implementation work, `splash-protocol` may use a temporary
environment-backed provider as the concrete configuration-provider
implementation until the fuller PostgreSQL-backed provider exists.

## Expected service-level environment variables

| Variable | Purpose |
| --- | --- |
| `NATS_URL` | NATS connection target on `splash-core` |
| `PROTOCOL_HTTP_BIND` | Bind address for local health and metrics listener |
| `PROTOCOL_COMMAND_TIMEOUT_MS` | Default command-correlation timeout |
| `LOG_LEVEL` | Runtime log verbosity |
| `TZ` | Local timezone for logs and operations context |

## Temporary milestone-1 env-backed provider variables

| Variable | Purpose |
| --- | --- |
| `PROTOCOL_POOL_ID` | Active pool id for the temporary provider |
| `PROTOCOL_SELECTED_PLUGIN` | Active locally discovered plugin id |
| `PROTOCOL_SELECTED_CONFIG_JSON` | JSON object of plugin-specific config |

No fallback configuration source is required for provider outage in v1 beyond
the temporary env-backed provider used in milestone-1 local or early host
bring-up.

When the provider is unavailable, `splash-protocol` should remain alive in a
degraded state and wait for the provider to return valid pool-selected
`protocol_plugin` and `protocol_config`.

## Local plugin discovery expectations

Available plugins are a local runtime concern, not a pool-settings concern.

Rules:

- `splash-protocol` should discover locally installed or packaged plugins at
  startup
- discovery may use a known plugin directory, built-in packaged modules, or
  both
- discovered plugin ids define the set of valid active plugin choices for the
  pool
- a selected plugin missing from the discovered local plugin set is a fatal
  deployment or configuration error

## Configuration-provider expectations

The provider must supply:

- `pool_settings.protocol_plugin`
- `pool_settings.protocol_config`

Provider rules:

- normal operation may read from PostgreSQL-backed configuration
- milestone-1 local and early integration work may use the temporary env-backed
  provider
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
- provider-backed plugin selection that does not resolve to a locally
  discovered plugin is fatal
- invalid plugin config for the selected plugin is fatal
- provider outage is degraded and blocks decode and command behavior until the
  provider returns valid selection and config
- malformed `PROTOCOL_SELECTED_CONFIG_JSON` in the temporary env-backed
  provider is fatal because the configured plugin options cannot be parsed

Examples of fatal static config:

- missing `NATS_URL`
- invalid `PROTOCOL_HTTP_BIND`
- non-numeric or zero `PROTOCOL_COMMAND_TIMEOUT_MS`

Examples of degraded provider config:

- provider unavailable at startup
  while the service waits for valid provider-backed selection and config
- temporary env-backed provider not configured
  while no other concrete provider implementation is available

Examples of fatal provider or selection config:

- unknown `protocol_plugin`
- `protocol_plugin` selected by the pool but not present in the local
  discovered plugin set
- malformed `protocol_config` for the selected plugin
- malformed `PROTOCOL_SELECTED_CONFIG_JSON`

## Example

```dotenv
NATS_URL=nats://splash-nats:4222
PROTOCOL_HTTP_BIND=127.0.0.1:9110
PROTOCOL_COMMAND_TIMEOUT_MS=5000
PROTOCOL_POOL_ID=pool-1
PROTOCOL_SELECTED_PLUGIN=pentair_easytouch
PROTOCOL_SELECTED_CONFIG_JSON={}
LOG_LEVEL=info
TZ=America/New_York
```
