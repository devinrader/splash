# Runtime Model

[Back to Splash API Service](./README.md)

## Process model

`splash-api` runs on `splash-core` as a TypeScript or Node.js service.

It should:

- expose LAN REST and SSE endpoints
- connect to NATS
- maintain an in-memory latest-state projection for the initial equipment slice
- publish normalized `protocol.command.intent`
- expose local dependency-aware health

## Initial runtime responsibilities

For the first browser milestone, `splash-api` should:

1. consume normalized equipment events:
   - `equipment.state.controller`
   - `equipment.state.pump`
   - `equipment.state.chlorinator`
2. maintain latest values for:
   - air temperature
   - water temperature
   - salt level
   - pump RPM
3. expose those values through REST
4. fan them out through SSE
5. accept pump-speed control requests and publish `protocol.command.intent`
6. consume `command.result.{command_id}` and relay command progress through SSE
7. expose a first Protocol Explorer frame-bundle slice by:
   - buffering recent `protocol.frame.raw` and `protocol.frame.decoded` events
   - allowing a client to save a bundle from that recent buffer
   - returning saved bundles through REST

## Initial equipment catalog bridge

The first API slice may use a minimal local equipment catalog bridge rather than
the full PostgreSQL-backed inventory model.

Rules:

- the bridge should expose a stable API-facing `equipment_id`
- the bridge should map that id to:
  - `equipment_type`
  - `protocol_name`
  - direct pump `bus_address`
- the bridge should be limited to the initial milestone equipment targets
- the bridge should be replaceable by the later repository-backed equipment
  model without changing the public REST route shape

ASSUMPTION: the initial bridge will define one pump entry for the direct Pentair
IntelliFlo target used by the milestone-1 `set_speed` path.

ASSUMPTION: the first slice may also use a static configured `pool_id` for
command publication and latest-state projection until the repository-backed pool
model exists.

## Degraded behavior

The service should stay alive but degrade when:

- NATS is unavailable
- no latest equipment state has been observed yet
- command-result updates are temporarily unavailable

The service should fail fast when:

- static service configuration is invalid
- the HTTP bind fails

## Initial route expectations

The first slice should at least support:

- `GET /equipment`
- `POST /equipment/:id/control`
- `GET /events`
- `GET /health`
- `GET /protocol/frames`
- `GET /protocol/bundles`
- `POST /protocol/bundles`
- `GET /protocol/bundles/:id`

Rules:

- `GET /equipment` may return the minimal bridged equipment model plus latest
  live state needed for the milestone
- `POST /equipment/:id/control` should only accept the normalized pump
  `set_speed` action in the first slice
- command ids should be created by `splash-api`
- command progress should be exposed through SSE `command.result`
- the first saved-frame-bundle slice may remain in-memory and non-persistent
  while Protocol Explorer is still a local protocol-discovery tool
