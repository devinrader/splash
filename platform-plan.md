# Splash Platform Plan

## Purpose

This document is the durable planning record for the Splash workspace. It captures:

- platform goals
- current constraints
- recommended architecture
- package boundaries
- deployment guidance
- milestone roadmap
- open questions and decisions

As planning evolves, this file should be updated instead of relying on chat history alone.

## Current Goals

The platform is intended to support:

1. Documenting pool equipment manufacturer protocols.
2. Reading and writing RS485 commands to directly control equipment.
3. Logging equipment and sensor data for analysis and reporting.
4. Building predictive maintenance and optimization features using algorithms and AI.
5. Maintaining good separation of concerns.
6. Maintaining good testing practices.
7. Supporting multiple user interfaces including CLI, web, and MagicMirror.
8. Logging efficiently into the appropriate database technology.
9. Combining RS485 equipment data with non-RS485 sensor data such as weather.

## Known Equipment

Primary real-world target equipment currently owned and operated:

- Pentair IntelliFlo variable speed pump
- Pentair heat pump
- Pentair chlorinator
- Pentair IntelliBrite lights
- Pentair EasyTouch automation controller, firmware 1.19

## Operating Constraints

- Primary deployment is local-first.
- Remote access is optional and can be enabled through a Cloudflare Tunnel.
- Existing code is currently Node/TypeScript.
- All systems should be capable of running in Docker containers on Raspberry Pi devices.
- Workspace contains a mix of real hardware adapters, protocol parsing code, and simulation code.
- Some packages are prototypes and are not yet aligned under a shared architecture.

## Recommended Product Direction

Treat Splash as a local automation and observability platform, not a single app.

The platform should have one stable core that models devices, state, commands, telemetry, and events. Hardware access, simulators, storage, UI, and analytics should be built around that core through explicit interfaces.

This keeps the system maintainable as the following capabilities grow:

- protocol reverse engineering and documentation
- safe command/control flows
- historical logging and replay
- dashboard and automation UX
- maintenance prediction and AI-assisted recommendations

## Recommended Architecture

### Architectural Layers

1. Protocol libraries
   Pure libraries for frame parsing, command building, checksums, enumerations, protocol docs, and fixtures. These should be manufacturer-specific where needed and contain no HTTP, serial, database, or UI concerns.

2. Transport adapters
   Hardware and simulated transport implementations for RS485 and other sensor sources. These are responsible for port I/O, buffering, timing, retries, connection lifecycle, and read/write streams.

3. Device integration layer
   Manufacturer and controller-specific logic that maps raw protocol messages into device capabilities and command sets. This is where EasyTouch, IntelliFlo, IntelliChlor, and other Pentair families should be represented.

4. Control service
   A long-running process responsible for state tracking, command routing, safety rules, automation hooks, device discovery where possible, and normalized event emission.

5. Ingestion and persistence
   Services or modules responsible for storing raw frames, normalized telemetry, system logs, and configuration/state snapshots.

6. Application layer
   CLI, web UI, MagicMirror plugins, and background jobs. These should consume stable APIs or event streams from the control service rather than talking to serial hardware directly.

7. Analytics and AI
   Forecasting, anomaly detection, maintenance prediction, and optimization features. These should consume normalized historical data and current state, not parse RS485 frames directly.

### Data Model Layers

Keep data in three distinct forms:

1. Raw frames
   Exact bytes, timestamp, source adapter, direction, and capture metadata.

2. Parsed protocol messages
   Manufacturer-specific decoded structures, still close to the original protocol.

3. Normalized domain events
   Equipment state and actions expressed in platform terms such as pump RPM, heater mode, water temperature, chlorinator output, relay status, light program, and alerts.

This separation is important because:

- raw frames are needed for debugging and replay
- parsed messages are needed for protocol validation
- normalized events are needed for UI, storage, analytics, and automation

## Recommended Package Layout

The current workspace should evolve toward something like this:

### Core libraries

- `splash-protocol-core`
  Shared frame types, checksums, codec interfaces, test fixtures, and replay helpers.

- `splash-protocol-pentair`
  Pentair-specific frame parsing, command building, protocol docs, enumerations, and fixtures.

- `splash-domain`
  Normalized equipment models, event schemas, command schemas, and shared types.

### Adapters and simulation

- `splash-transport-rs485`
  Real serial adapter for USB/RS485 hardware.

- `splash-sim-pentair`
  Simulated Pentair bus, device responders, deterministic fixtures, and fault scenarios.

- `splash-sensor-ingest`
  Non-RS485 sensor adapters such as local weather, ambient sensors, or utility integrations.

### Services

- `splash-control-service`
  Main local daemon or service that owns device state, bus interactions, command execution, and event publication.

- `splash-ingest-service`
  Optional service for persistence and event fan-out if separation becomes useful.

### Apps

- `splash-cli`
  Direct command and inspection tools for development and operations.

- `splash-dash`
  Web dashboard for monitoring, controls, and history.

- `splash-magicmirror`
  Optional MagicMirror integration.

### Protocol/device-specific plugins

- `splash-command-processors/*`
  These can evolve into device-family-specific plugins or command translators, but should be aligned behind shared interfaces and shared test fixtures.

## Recommended Technology Choices

### Short-term recommendation

Stay with TypeScript for the first major cleanup and architecture pass.

Reasons:

- existing code is already in Node/TypeScript
- iteration speed is high while protocol understanding is still evolving
- good ecosystem support for serial, HTTP, SSE/WebSocket, and test tooling
- easier to refactor the existing prototypes into coherent packages without a language migration at the same time
- deployment remains straightforward on Raspberry Pi with multi-arch Docker images

### Medium-term recommendation

Use a polyglot approach only if there is a clear reason.

Suggested fit by concern:

- TypeScript:
  protocol work, local services, CLI, dashboard backend/frontend, automation logic, integration code
- Python:
  optional notebooks, model experiments, forecasting prototypes, maintenance analytics exploration
- Rust or Go:
  only if you later need a highly robust low-footprint edge daemon or stronger guarantees around concurrency and packaging

There is no immediate need to migrate away from TypeScript to achieve the platform goals.

## Service Design Recommendation

Recommended initial shape:

- one main local `control-service`
- one web dashboard app
- one CLI app
- one or more protocol and simulator libraries

Do not start with many distributed services. For a local-first pool automation system, a modular monolith is the right starting point.

Recommended responsibilities of `control-service`:

- own the RS485 bus connection
- manage read/write sequencing
- expose a command API
- publish normalized equipment state/events
- persist or forward telemetry
- enforce safety and rate-limiting rules
- coordinate simulator vs real transport mode

This service can later be split if needed, but it should begin as the authoritative runtime core.

## Deployment Constraint: Raspberry Pi + Docker

Raspberry Pi container deployment is a first-class requirement, not an afterthought.

This has several architectural implications:

- prefer components that run well on ARM
- avoid dependencies that are difficult to build or maintain on Raspberry Pi
- keep base images small and predictable
- assume limited CPU, memory, disk, and I/O compared to desktop/server hardware
- isolate hardware access cleanly so serial device permissions and mappings are explicit in Docker

Recommended deployment model:

- one main `control-service` container with access to the RS485 USB device
- separate optional containers for dashboard, database, and supporting services
- `docker-compose` for local orchestration on Raspberry Pi

Containerization guidance:

- build and publish multi-arch images, especially `linux/arm64`
- prefer Debian-based images over Alpine when native modules or serial libraries become painful
- keep runtime images minimal and use multi-stage builds
- pass serial devices explicitly using Docker device mappings
- persist data through volumes rather than container-local state

Raspberry Pi operational guidance:

- keep write-heavy logging bounded and configurable to protect SD cards
- prefer external SSD storage for long-term telemetry retention where possible
- expose health endpoints for container restarts and watchdog behavior
- design services to recover cleanly from serial disconnects and container restarts

Database guidance under Raspberry Pi constraints:

- PostgreSQL is still a good initial default if write rates are moderate
- start with one database unless a clear workload split justifies more
- add time-series extensions or secondary stores only after real telemetry volume is understood

## First Deployable Architecture

The first deployable system should be a local-first Raspberry Pi stack with a small number of containers and a narrow, reliable feature set.

### Initial container layout

Recommended initial containers:

- `splash-control-service`
  Owns the RS485 USB adapter, reads and parses traffic, maintains live equipment state, exposes a local API, and optionally issues commands.

- `splash-dash`
  Optional web UI container that talks only to `splash-control-service`.

- `postgres`
  Stores configuration, command history, alerts, and normalized telemetry.

- `cloudflared`
  Optional remote access tunnel for the dashboard or API.

The first release should avoid additional infrastructure such as message brokers, caches, and multiple internal services unless real constraints justify them.

### Container responsibility boundaries

`splash-control-service` should be the only container with direct hardware access.

That service should own:

- serial device access
- protocol parsing and encoding
- normalized state
- command authorization
- command execution
- telemetry persistence writes
- health and diagnostics endpoints

`splash-dash` should own:

- local operator UI
- status pages
- manual control workflows
- history views
- configuration pages

It should not talk to the serial bus directly or contain protocol-specific logic.

### Docker runtime assumptions

Recommended production assumptions for the Raspberry Pi target:

- Docker Compose orchestration
- `linux/arm64` image support as the primary target
- bind-mounted or named Docker volumes for data
- explicit USB serial device mapping into `splash-control-service`
- restart policies enabled for long-running services

### Suggested Compose shape

The first production Compose stack should roughly include:

- `control-service`
  ports:
  local API only
  devices:
  mapped RS485 USB adapter such as `/dev/ttyUSB0`
  volumes:
  app data, frame capture, logs

- `postgres`
  volumes:
  database data

- `dash`
  ports:
  local web UI

- `cloudflared` optional
  depends on whether remote access is enabled

### Local network and API recommendation

Expose a small local API from `splash-control-service`.

Recommended first interfaces:

- HTTP REST for configuration, current state, command submission, and diagnostics
- SSE or WebSocket for live state/event updates
- local-only binding by default, with optional remote access through Cloudflare Tunnel

Recommended initial API groups:

- `/health`
- `/devices`
- `/state`
- `/events`
- `/commands`
- `/fixtures`
- `/config`

### Recommended first release scope

The first serious release should be read-mostly with tightly limited command support.

Recommended feature scope for release 1:

- connect to the RS485 adapter
- capture and timestamp raw frames
- parse and classify Pentair traffic
- build normalized live state for known equipment
- persist current state and telemetry
- expose CLI and web read-only views
- support replay of captured traffic
- optionally allow a very small safe command subset behind an explicit control flag

Examples of acceptable early write support:

- request pump status refresh if protocol supports it
- select a light mode only if command semantics are well understood
- issue a limited set of low-risk control commands with audit logging

Examples of write support that should wait:

- broad automation loops
- multi-device coordinated actions
- anything that is not yet well understood at the protocol level

### Recommended first command policy

The platform should support three runtime modes:

- observe-only
  reads bus traffic, parses it, and logs it; no writes

- guarded-control
  allows a small approved command subset with audit logging and rate limits

- full-control
  reserved for later after protocol confidence and operational confidence are higher

The default production mode should be `observe-only` until the command path is proven.

### Storage layout recommendation

For Raspberry Pi deployment, keep storage predictable and durable:

- PostgreSQL for app state and normalized telemetry
- rotating file-based raw frame capture for replay and debugging
- bounded retention and compression for frame archives

Suggested local volume categories:

- database data
- application config
- raw frame archives
- exported fixtures
- operational logs

### Hardware access recommendation

The RS485 USB adapter should be exposed only to `splash-control-service`.

Operational requirements:

- container user must have permission to open the serial device
- serial device path should be configurable
- startup should fail clearly if the device is unavailable
- reconnect logic should tolerate unplug/replug events
- health endpoints should distinguish app health from serial-link health

### Observability recommendation

The first deployable version should include operational visibility from day one.

Recommended built-in diagnostics:

- service health
- serial device status
- last frame received timestamp
- parse error counters
- command counters
- database write status
- replay mode status

### Security recommendation

Even in a local-first environment, command authority should be explicit.

Recommended first controls:

- default local-only API binding
- explicit configuration to enable remote access
- simple authentication for dashboard and command endpoints once remote access exists
- separate permissions for observe-only vs command access
- full audit log for issued commands

## Recommended Framework Choices

For the initial platform implementation:

- runtime:
  Node.js LTS
- language:
  TypeScript
- HTTP API:
  Fastify or Express
- validation:
  Zod
- database access:
  Prisma, Drizzle, or a lightweight SQL layer
- test runner:
  Vitest
- end-to-end API tests:
  supertest or native HTTP integration tests
- frontend:
  Next.js or Vite React if and when `splash-dash` becomes active

Current recommendation:

- use Fastify for `splash-control-service`
  It is a good fit for structured APIs, validation, and health endpoints on constrained hardware.
- use Vitest for new packages
- use Zod for normalized event and command schemas

## Recommended Repo Restructure

The workspace should move toward a clearer package structure once implementation resumes.

Recommended target shape:

- `apps/control-service`
- `apps/dash`
- `apps/cli`
- `packages/protocol-core`
- `packages/protocol-pentair`
- `packages/domain`
- `packages/transport-rs485`
- `packages/sim-pentair`
- `packages/test-fixtures`

The current package names can be migrated incrementally. There is no need for a disruptive rewrite before work resumes.

## First Implementation Roadmap

Recommended execution order for the first deployable Raspberry Pi release:

1. Normalize workspace structure and naming.
2. Extract Pentair parsing and framing logic into dedicated libraries.
3. Define domain models for devices, live state, commands, telemetry, and alerts.
4. Build the RS485 transport abstraction for real and simulated adapters.
5. Build a deterministic Pentair simulator and fixture-replay workflow.
6. Implement `splash-control-service` in observe-only mode.
7. Add PostgreSQL persistence and retention policies.
8. Add CLI inspection commands.
9. Add a minimal dashboard.
10. Add guarded-control support for a very small safe command subset.

## Decision Recommendation

Current recommendation for the first production milestone:

- target `read-only observability on Raspberry Pi` as the first serious release

Reasoning:

- it captures real traffic and protocol knowledge safely
- it validates Docker and Raspberry Pi deployment early
- it establishes fixture capture and replay workflows
- it enables dashboard and logging work without waiting for command safety decisions
- it reduces the risk of issuing unsafe or poorly understood live commands too early

## Interface Recommendations

Define stable interfaces early:

- `Transport`
  read raw frames, write raw frames, connect, disconnect, health

- `ProtocolCodec`
  parse raw frames into protocol messages, encode commands into frames

- `DeviceAdapter`
  map protocol messages to normalized state and map normalized commands back to protocol actions

- `EventStore`
  persist raw frames, parsed messages, and normalized events

- `SensorAdapter`
  ingest non-RS485 data into normalized events

If these interfaces are stable, simulators and real hardware can share the same higher-level code paths.

## Persistence Recommendation

Use different storage for different workloads.

Recommended split:

- relational database:
  devices, equipment inventory, configuration, schedules, users, automation rules, command history

- time-series database or time-series optimized relational schema:
  telemetry, temperatures, pump readings, chlorinator output, weather, derived metrics

- raw archive storage:
  optional file/object storage for captured raw frames and replay sessions

Suggested pragmatic starting point:

- PostgreSQL first
  It is flexible enough to support relational data and moderate time-series workloads initially.
- Add TimescaleDB later if telemetry volume or query patterns justify it.
- Keep raw frame capture in files or compressed blobs at first if full archival replay is needed.

## Testing Strategy

Testing should be separated by confidence level and runtime dependency:

1. Unit tests
   Checksums, framing, codecs, command builders, normalizers, and device adapters.

2. Fixture tests
   Captured Pentair traffic, known-good command examples, and reverse-engineered protocol samples.

3. Simulator integration tests
   End-to-end flows with fake serial devices and expected state transitions.

4. Hardware-in-the-loop tests
   Controlled validation against real equipment and adapters.

5. Replay tests
   Feed previously captured raw frame logs into the parser and control pipeline to validate regressions.

High priority testing rule:

Every protocol bug fixed in the future should come with a fixture or replay test so the knowledge becomes durable.

## Safety and Control Recommendations

Because this platform will eventually issue live equipment commands, design for safety early:

- separate read-only observation mode from active control mode
- require explicit enablement for write operations
- log all commands with timestamps and operator/source
- add command rate limiting and deduplication
- define safe defaults for startup and reconnect behavior
- treat controller-originated state as authoritative unless a control workflow intentionally overrides it

## UI Strategy

Support multiple UIs, but avoid putting business logic in them.

Recommended split:

- CLI for diagnostics, protocol exploration, direct control, and development
- web dashboard for everyday monitoring, manual control, trends, and configuration
- MagicMirror for passive status display and alerts

All UIs should talk to the same service and same normalized domain model.

## Sensor Expansion Strategy

Non-RS485 data should be modeled as peers to equipment telemetry, not bolted on ad hoc.

Examples:

- local weather APIs
- on-site air temperature and humidity
- water chemistry sensors
- power monitoring
- flow or pressure sensors

Each sensor source should publish normalized observations into the same event pipeline used by equipment state.

## Recommended Milestones

### Milestone 1: Foundation and cleanup

- define package boundaries
- create shared domain and protocol interfaces
- clean up current workspace naming and entry points
- make simulator and real serial adapter share transport abstractions
- document Pentair framing assumptions and known device families

### Milestone 2: Pentair protocol baseline

- build reliable Pentair frame parser and encoder
- capture and store real traffic fixtures
- document EasyTouch, IntelliFlo, IntelliChlor, heat pump, and IntelliBrite message patterns
- create replayable fixture tests

### Milestone 3: Local control service

- implement a local control-service
- support read-only live monitoring first
- add command issuance for a small safe subset of equipment controls
- expose CLI commands and a local API

### Milestone 4: Persistence and dashboard

- store normalized events and selected raw traffic
- build the first useful dashboard views
- show current equipment state, recent history, and alerts

### Milestone 5: Automation and prediction

- add rule-based automations
- ingest weather and additional sensors
- experiment with maintenance prediction and optimization workflows

## Immediate Next Recommendations

Recommended near-term focus:

1. Decide on the modular monolith service shape and package names.
2. Extract protocol logic out of app packages into shared libraries.
3. Build one clean RS485 transport abstraction.
4. Build one deterministic Pentair simulator package.
5. Stand up a read-only local control-service before broad write support.

## Current Workspace Notes

As of 2026-03-24:

- `splash-server` and `splash-relay` compile.
- `splash-pentair-virtual` does not currently compile.
- the workspace appears to be mid-rename from `splash-mock` to `splash-pentair-virtual`
- some packages and paths are still prototype-level and not yet aligned with a shared architecture

These are implementation details, not planning blockers.

## Open Questions

Questions still to settle:

- What should the first production milestone be:
  protocol documentation, read-only monitoring, or safe write control?
- Should the first dashboard be server-rendered, SPA, or a simple local admin UI?
- How much command authority should the platform have when EasyTouch is already acting as controller?
- Should raw frame capture be on by default or opt-in?
- What is the target deployment form:
  Raspberry Pi, mini PC, Docker host, or mixed?

## Decision Log

### 2026-03-24

- Primary equipment target is Pentair.
- Initial supported equipment includes IntelliFlo, heat pump, chlorinator, IntelliBrite, and EasyTouch 1.19.
- Deployment direction is local-first.
- Raspberry Pi Docker deployment is a hard platform requirement.
- Optional remote access may be enabled through Cloudflare Tunnel.
- Current recommendation is to remain on TypeScript during the first architecture cleanup.
- Current recommendation is to start with a modular monolith centered on a local `control-service`.
