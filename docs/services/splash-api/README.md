# Splash API Service

[Back to Docs Index](../../README.md)

## Purpose

`splash-api` is the browser-facing service on `splash-core`.

It owns:

- REST resources
- SSE event fanout
- latest-state projection for frontend reads
- normalized command intent publication
- envelope responses and dependency-aware health

For the initial implementation slice, `splash-api` only needs to expose the
minimum live equipment read and pump-speed control surface required by
milestone 1.

## Initial slice scope

The first `splash-api` implementation should support:

- latest air temperature
- latest water temperature
- latest salt level
- latest pump RPM
- browser pump-speed control through `/equipment/:id/control`
- SSE updates for the same state and command-result flow

## Initial design constraint

The full PostgreSQL-backed equipment and repository layer is not required
before the first browser milestone.

For the initial slice:

- `splash-api` may use a minimal equipment catalog bridge to resolve a stable
  API-facing `equipment_id` to the direct Pentair pump bus address
- this bridge exists so the API can preserve the documented
  `/equipment/:id/control` route shape without blocking on the full persistence
  slice
- the bridge must be explicitly temporary and replaceable by the future
  repository-backed equipment model

See:

- [Runtime](./runtime.md)
- [Configuration](./configuration.md)
- [Testing](./testing.md)
