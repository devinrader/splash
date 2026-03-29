# Operations and Verification

[Back to README](../README.md)

## Purpose

This document captures testing, observability, and operational guidance that supports the architecture but should not overload the core architecture narrative.

## Testing strategy

- Unit tests cover rule evaluation, protocol decoder logic, chemistry calculations, and API handlers
- Integration tests cover API access to PostgreSQL and InfluxDB, scheduler jobs, and SSE broker behavior
- Integration tests should also cover raw-stream to decoded-event flow through `splash-protocol`
- Hardware-in-the-loop checks validate real raw-byte capture, command round-trip behavior, and adapter reconnect handling
- `splash-serial` tests should cover stream-id rollover, stale write rejection, native read-boundary publishing, and idle-timing enforcement

## Logging and metrics

- services should use structured JSON logging appropriate to their runtime
- ASSUMPTION: TypeScript services will use a structured logger such as `pino`, while `splash-serial` will use `zerolog`
- Docker log rotation is required to avoid unbounded growth on embedded storage
- Prometheus scrapes service metrics
- the most valuable first alert is RS-485 frame rate dropping to zero
- `splash-serial` should expose Prometheus metrics for connection state, reconnect count, bytes read, bytes written, write failures, and current stream age
- `splash-serial` should expose `GET /healthz` and `GET /metrics` over its local HTTP listener
- `splash-protocol` should expose `GET /healthz` and `GET /metrics` over its local HTTP listener
- `splash-protocol` should expose metrics for frame decode success or failure, normalized event publication, command-result status, and command-correlation timeouts

## Backup and recovery

- PostgreSQL is backed up daily with `pg_dump`
- InfluxDB is backed up weekly
- backup retention target is 30 daily PostgreSQL backups and 4 weekly InfluxDB backups
- off-device copy is recommended but manual in v1
- Ansible-based restore is the intended disaster-recovery path

## Operational notes

- Prometheus metrics are included in the architecture, while Grafana is recommended but not part of the base v1 topology
- mDNS reliability should be validated on the target LAN, with reserved-IP fallback documented if needed
