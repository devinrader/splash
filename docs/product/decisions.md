# Decisions

[Back to README](../README.md)

## Product and deployment decisions

- Splash is local-first and self-hosted rather than SaaS-first.
- v1 is free to use and does not include a monetization feature set.
- v1 remote access is deferred; LAN-only operation is the default trust boundary.
- v2 remote access uses Cloudflare Tunnel and Cloudflare Access instead of building native auth first.

## Architecture decisions

- Use a mixed backend stack chosen by service responsibility.
- Use TypeScript/Node.js for `splash-api`, `splash-scheduler`, and `splash-protocol`.
- Use Go for `splash-serial`.
- Use a polyglot monorepo rather than requiring all backend services to share one language toolchain.
- Run containerized services on `splash-core` but keep `splash-serial` as a native binary on `splash-zero`.
- `splash-serial` is a transport-edge service, not the owner of protocol decode and encode.
- `splash-protocol` is the protocol boundary for all vendor-specific framing, checksum, decode, and encode behavior.
- Use NATS as the backbone between services.
- Use JetStream only where message loss would create missed actions.
- Use SSE, not polling, for the primary live frontend update path.

## Data decisions

- Split relational and time-series responsibilities between PostgreSQL and InfluxDB.
- Keep manual chemistry readings indefinitely in PostgreSQL as the durable user log.
- Add `pool_id` to schemas now even though v1 supports only one pool.
- Store approved automation command payloads directly on tasks to avoid rebuilding commands later.
- Do not persist all raw transport or protocol-frame traffic by default; treat it as ephemeral observability data unless an explicit archival feature is added.

## Domain and UX decisions

- v1 automations are suggest-and-approve only.
- CYA-adjusted FC minimums are the authoritative chlorine rule, not a single FC range.
- During SLAM, high FC should not generate standard chlorine alerts.
- Cover state is modeled as an event log, not a mutable current-state column.
- Notifications are not deleted; they are marked read.

## Integration decisions

- `ProtocolDecoder` is loaded by `splash-protocol`, not by `splash-serial`.
- `WeatherProvider` is the abstraction boundary for external weather APIs.
- `SensorProvider` is the abstraction boundary for future chemistry hardware.
- Protocol Explorer should reuse the same decode/encode engine used in production command and frame handling.
- `splash-protocol` owns frame reconstruction buffers and command-response correlation.
- `splash-api` and `splash-scheduler` must operate on normalized events and command intents, not raw vendor packets.
- Normalized equipment events and command types are the primary contract above the protocol layer.
- Protocol plugin identity should be organized around protocol family and variant, not vendor name alone, when a vendor exposes multiple distinct integration surfaces.
- Protocol plugins should resolve one capability profile per equipment instance in v1.
- Capability profiles should be defined in code and docs, not primarily authored as relational records.
- Persist confirmed profile assignment on equipment when chosen or confirmed; otherwise allow runtime inference and generic fallback profiles.
- Do not reduce the normalized platform contract to lowest-common-denominator capabilities; richer vendor-specific features may be exposed as extended normalized capabilities where they map to real user intent.
- The initial capability-profile catalog should be conservative: generic fallbacks for all major equipment classes plus Pentair-family v1 profiles where support is strongest.
- MagicMirror is a separate deliverable that depends on stable read-only API contracts.

## Operational decisions

- Ansible is the provisioning and disaster-recovery mechanism.
- Secrets live in Ansible Vault, not in committed `.env` files.
- Docker log rotation is required because Splash targets embedded hosts with limited storage.
- Prometheus is included for metrics; Grafana is recommended but not required in the base v1 topology.

## Tradeoffs

- LAN trust in v1 reduces implementation scope but leaves local access unauthenticated.
- Using Core NATS for high-frequency telemetry accepts message loss during reconnect windows in exchange for simpler, lighter operation.
- Separating transport (`splash-serial`) from protocol (`splash-protocol`) improves cohesion and testability, but increases distributed-service complexity and NATS contract surface area.
- Using TypeScript for most backend services improves development speed and alignment with the frontend, but introduces a mixed-runtime operational model.
- Keeping Go only at the transport edge optimizes the most hardware-sensitive service without forcing the full backend into a lower-level language.
- Supporting multiple vendor protocols through a plug-in model reduces coupling but pushes complexity into decoder maturity and reverse engineering.
- Keeping dosing math out of v1 reduces risk but limits how prescriptive the chemistry workflows can be.
