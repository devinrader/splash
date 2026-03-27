# Operations

[Back to Splash NATS Service](./README.md)

## Health expectations

`splash-nats` is a critical platform dependency.

Operational expectations:

- clients should reconnect automatically
- JetStream consumers should resume from durable offsets where configured
- temporary NATS unavailability should degrade live state freshness rather than crashing the platform

## Observability

Operators should monitor at least:

- service availability
- client connection count
- JetStream health
- storage growth for JetStream state
- reconnect patterns from dependent services

## Recovery behavior

When `splash-nats` is unavailable:

- Core NATS traffic may be dropped during the outage window by design
- JetStream-backed work should resume after reconnect
- `splash-serial` local health should remain visible even if NATS is unavailable
- API and UI behavior should surface degraded live-state conditions

## Operational notes

- `splash-nats` should remain lightweight and local-first for v1
- NATS is a backbone dependency, not a substitute for PostgreSQL or InfluxDB
- if JetStream state grows materially, retention and storage policy should be revisited explicitly in the design
