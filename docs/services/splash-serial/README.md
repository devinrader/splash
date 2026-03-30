# Splash Serial Service

[Back to README](../../README.md)

## Purpose

This directory contains the service-specific design for `splash-serial`.

`splash-serial` is the transport-edge daemon that owns RS-485 port access on `splash-zero`. It is intentionally narrower than `splash-protocol` and should remain focused on serial lifecycle, raw transport publication, write execution, and transport observability.

## Scope

This service design complements, but does not replace:

- [System Architecture](../../architecture/architecture.md)
- [Deployment Architecture](../../architecture/deployment.md)
- [Resilience and Health](../../architecture/resilience.md)
- [Operations and Verification](../../architecture/operations.md)
- [NATS Messaging](../../interfaces/messaging-nats.md)

## Service documents

- [Runtime Model](./runtime.md)
  Process model, serial session lifecycle, reconnect behavior, and ownership boundaries.
- [Transport Contract](./transport.md)
  Raw read semantics, outbound write handling, stream identity, and bus-idle enforcement.
- [Configuration](./configuration.md)
  Environment variables, defaults, and validation expectations.
- [Observability](./observability.md)
  Health, metrics, logging, and service-status expectations.
- [Testing](./testing.md)
  Test strategy for unit, integration, and hardware-in-the-loop validation.
- [CI Runner Usage](./ci.md)
  Gitea Actions runner label, image, and workflow assumptions for no-hardware CI.

## Core responsibilities

- open and manage the serial adapter
- publish raw serial ingress as `serial.rx.raw`
- consume `serial.write.request` and perform actual writes
- publish write results as `serial.tx.raw`
- publish transport status through `serial.port.status`
- generate and persist a durable `serial_instance_id`
- enforce write serialization and bus-idle timing
- expose local `GET /healthz` and `GET /metrics`
- support a fully automated no-hardware test path for CI

## Dependencies

### Direct runtime dependencies

- configured serial adapter device such as `/dev/ttyUSB0`
- local runtime configuration file at `/etc/splash/splash-serial.env`
- NATS reachability to `splash-core`
- `systemd` service management on `splash-zero`
- local network connectivity between `splash-zero` and `splash-core`

### Consumed interfaces

- `serial.write.request` from `splash-protocol`

### Provided interfaces

- `serial.rx.raw`
- `serial.tx.raw`
- `serial.port.status`
- `GET /healthz`
- `GET /metrics`

The raw transport subjects must carry `serial_instance_id` because the serial
edge owns transport identity. `pool_id` remains a higher-layer domain concern
resolved on `splash-core`.

### Explicit non-dependencies

`splash-serial` should not require these services to start or continue basic transport operation:

- PostgreSQL
- InfluxDB
- frontend availability
- REST API availability
- scheduler availability

## Explicit non-responsibilities

- frame reconstruction
- checksum validation
- payload decode
- normalized event generation
- command success determination beyond transport write result
- vendor-specific protocol logic

Those concerns belong to `splash-protocol`.
