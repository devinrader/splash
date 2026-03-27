# SSE Events

[Back to README](../README.md)

## SSE contracts

The frontend opens `GET /events` and receives named event types.

| Event | Source | Use |
| --- | --- | --- |
| `equipment.state` | NATS `equipment.state.controller` | Latest controller state |
| `pump.state` | NATS `equipment.state.pump` | Pump metrics |
| `chemistry.reading` | `POST /chemistry` | New chemistry log |
| `task.created` | NATS `task.created` | Add task to UI |
| `task.updated` | NATS `task.updated` | Update task in place |
| `notification.created` | notification persistence | Increment inbox |
| `command.result` | NATS `command.result.{command_id}` | Resolve pending control actions |
| `weather.updated` | NATS `weather.updated` | Refresh weather UI |
| `cover.updated` | `POST /pool/cover` | Update cover state and charts |
| `rainfall.recorded` | NATS `rainfall.recorded` | Add rainfall marker |

Wire format:

```text
event: weather.updated
data: {"pool_id":"...","temp_f":82.0}

```

## Frontend integration pattern

1. Fetch initial state from REST.
2. Open `EventSource` against `/events`.
3. Route incoming events into Zustand slices.
4. On disconnect, let `EventSource` reconnect.
5. On reconnect, refetch REST endpoints to resynchronize missed changes.

## Design notes

- SSE is the browser-facing live-update channel
- internal services should use NATS, not SSE
- event naming should stay stable even if internal protocol plugins change
