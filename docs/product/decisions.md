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
- Prefer package-based artifacts for deployable services, even when the final runtime is containerized.
- Run most application services on `splash-core` under Docker Compose, but treat the container image as a deployment wrapper around a versioned packaged service build.
- Keep `splash-serial` as a native `systemd`-managed service on `splash-zero`, installed from an OS package rather than by copying an ad hoc binary.
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
- `splash-protocol` should discover locally available protocol plugins from the packaged plugin set or plugin directory, while pool configuration selects one active plugin and supplies pool-specific plugin config.
- a pool selecting a plugin that is not locally available is an unrecoverable deployment or configuration error and should be treated as fatal.
- `WeatherProvider` is the abstraction boundary for external weather APIs.
- `SensorProvider` is the abstraction boundary for future chemistry hardware.
- Protocol Explorer should reuse the same decode/encode engine used in production command and frame handling.
- `splash-protocol` owns frame reconstruction buffers and command-response correlation.
- `splash-api` and `splash-scheduler` must operate on normalized events and command intents, not raw vendor packets.
- Normalized equipment events and command types are the primary contract above the protocol layer.
- `splash-serial` should generate and persist a durable `serial_instance_id`
  for raw transport identity, while `splash-core` owns any later binding of
  that edge identity to a controller domain or Splash pool.
- The initial `splash-api` milestone may use a minimal local equipment catalog
  bridge to preserve `/equipment/:id/control` without blocking on the full
  PostgreSQL-backed equipment repository implementation.
- The initial `splash-frontend` milestone may be a single-page dashboard that
  consumes `GET /equipment`, `GET /health`, and `GET /events` before the full
  long-term navigation tree is implemented.
- Milestone-1 development may run `splash-frontend`, `splash-api`,
  `splash-protocol`, and NATS on a developer machine while keeping
  `splash-serial` deployed on the hardware host that owns the live RS-485
  adapter.
- The milestone-1 `splash-protocol` concrete configuration provider may be a
  temporary env-backed implementation so the initial local and host-integrated
  slice can run before the full PostgreSQL-backed provider exists.
- Protocol plugin identity should be organized around protocol family and variant, not vendor name alone, when a vendor exposes multiple distinct integration surfaces.
- Protocol plugins should resolve one capability profile per equipment instance in v1.
- Capability profiles should be defined in code and docs, not primarily authored as relational records.
- Persist confirmed profile assignment on equipment when chosen or confirmed; otherwise allow runtime inference and generic fallback profiles.
- Do not reduce the normalized platform contract to lowest-common-denominator capabilities; richer vendor-specific features may be exposed as extended normalized capabilities where they map to real user intent.
- The initial capability-profile catalog should be conservative: generic fallbacks for all major equipment classes plus Pentair-family v1 profiles where support is strongest.
- MagicMirror is a separate deliverable that depends on stable read-only API contracts.

## Operational decisions

- Ansible is the provisioning and disaster-recovery mechanism.
- Gitea package publishing is the preferred internal distribution path for service artifacts.
- Every merge to `main` publishes a new prerelease artifact for the affected service.
- Semver tags publish stable release artifacts.
- Package namespace should start under `devinrader`, with package names matching service names where practical.
- Target hosts should consume published artifacts through Ansible rather than building locally.
- Package-installed configuration is sample-only by default; Ansible renders the live environment-specific config.
- Keep the most recent 25 published versions per service or channel to support rollback.
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
