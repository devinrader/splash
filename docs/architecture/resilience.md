# Resilience and Health

[Back to README](../README.md)

## Purpose

This document defines how Splash behaves under dependency failure, disconnect, and degraded runtime conditions.

## Resilience model

### RS-485 disconnect

- Serial loop retries every 10 seconds
- Raw ingress stops at the transport boundary
- Protocol decode pauses automatically because no new raw bytes arrive
- UI shows stale data and offline state instead of failing hard
- a new `stream_id` is created when the port reconnects
- stale `serial.write.request` messages targeting the prior `stream_id` must be rejected rather than written

### NATS disconnect

- Clients auto-reconnect
- JetStream consumers resume from durable offsets
- Core NATS telemetry may drop during outages by design
- `splash-serial` local health and metrics endpoints should remain available even when NATS is unavailable

### Database issues

- PostgreSQL failures return `503`-style errors
- InfluxDB writes retry and may be dropped after retry exhaustion
- Startup ordering depends on Compose health checks

### Frontend disconnect

- SSE reconnects automatically
- Frontend refetches canonical REST state on reconnect

## Health expectations

- transport issues should degrade protocol and UI freshness, not crash the platform
- protocol-plugin misconfiguration should surface as degraded health rather than silent failure
- database and messaging dependency issues should be visible through health endpoints and UI state
- `splash-serial` should expose direct local health independent of NATS event publication
- write-blocked or idle-wait states should be visible in both `serial.port.status` and local health or metrics output

## Recovery rules

- recovery should be automatic wherever possible
- terminal command failure must be explicit through `command.result`
- stale state must be visually distinguishable from fresh live state
- reconnect must reset transport session identity so downstream protocol buffers can safely discard partial state from the old stream
