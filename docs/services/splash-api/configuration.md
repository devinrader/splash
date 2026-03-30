# Configuration

[Back to Splash API Service](./README.md)

## Static service configuration

The initial `splash-api` slice should support:

| Variable | Purpose |
| --- | --- |
| `API_POOL_ID` | Single-pool identifier used by the initial API slice |
| `NATS_URL` | NATS connection target |
| `API_HTTP_BIND` | Local HTTP bind address |
| `LOG_LEVEL` | Structured log verbosity |
| `TZ` | Service timezone |

## Initial equipment bridge configuration

The first slice may include a minimal local equipment bridge configuration for
the direct pump target.

Required bridge fields:

- `equipment_id`
- `equipment_type`
- `protocol_name`
- `bus_address`

ASSUMPTION: the first implementation may hard-code or use a simple local config
for one direct pump target while the full repository-backed equipment catalog is
still pending.

ASSUMPTION: the first implementation may use a static `API_POOL_ID` because the
full repository-backed pool model is not yet required for the initial browser
milestone.
