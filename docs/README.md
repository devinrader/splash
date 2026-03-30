# Splash Design System

This directory is the canonical design system and platform specification for Splash, derived from `splash.docx` and normalized for ongoing development by humans and AI agents.

## Organization

The documentation is grouped by role so related material stays together:

- `product/`
  Product intent, requirements, decisions, assumptions, and unresolved questions
- `architecture/`
  System structure, data model, and pool-equipment communication protocol references
- `interfaces/`
  REST, SSE, NATS, and normalized application-level contracts
- `services/`
  Service-specific design docs for implementation-facing component behavior
- `workflows/`
  User, automation, operational, and protocol-driven flows
- `images/`
  Extracted diagrams used by the markdown docs

## Recommended reading order

1. Start with [Product Overview](./product/overview.md) for the platform vision and scope.
2. Read [Product Requirements](./product/requirements.md) for functional and non-functional expectations.
3. Read [System Architecture](./architecture/architecture.md) for service boundaries, deployment topology, and protocol ownership.
4. Read [Data Model](./architecture/data-model.md) and [Equipment Protocol Reference](./architecture/equipment-protocols.md) for persistence and device communication design.
5. Read [Interface Design](./interfaces/api-design.md) and the linked contract documents for REST, SSE, NATS, and normalized contracts.
6. Read [Splash NATS Service](./services/splash-nats/README.md) for the event-backbone service design and durability rules.
7. Read [Splash Serial Service](./services/splash-serial/README.md) for the transport-service design that sits under the protocol layer.
8. Read [Splash Protocol Service](./services/splash-protocol/README.md) for the decode, normalize, and command-correlation layer that sits above transport.
9. Read [Workflows](./workflows/workflows.md) for end-to-end behavior across onboarding, automation, SLAM, and degraded states.

## Document index

### Product

- [Product Overview](./product/overview.md)
  Product vision, scope, users, roadmap, and UX direction.
- [Platform Glossary](./product/glossary.md)
  Shared reference vocabulary for platform, equipment, protocol, sensor, chemistry, and workflow terms.
- [Product Requirements](./product/requirements.md)
  Functional requirements, non-functional requirements, constraints, risks, and dependencies.
- [Design Decisions](./product/decisions.md)
  Explicit decisions, tradeoffs, and architectural positioning.
- [Assumptions and Constraints](./product/assumptions.md)
  Working assumptions, operating constraints, and known limitations.
- [Open Questions](./product/open-questions.md)
  Unresolved design questions, spikes, and follow-up items.

### Architecture

- [System Architecture](./architecture/architecture.md)
  Service structure, deployment model, plugin loading, resilience, testing, and operational guidance.
- [Deployment Architecture](./architecture/deployment.md)
  Host layout, runtime placement, configuration loading, and external integration placement.
- [Resilience and Health](./architecture/resilience.md)
  Failure handling, degraded states, and recovery expectations.
- [Operations and Verification](./architecture/operations.md)
  Testing strategy, logging, metrics, backup/recovery, and operational guidance.
- [Data Model](./architecture/data-model.md)
  PostgreSQL entities, InfluxDB measurements, chemistry thresholds, and persistence rules.
- [Equipment Protocol Reference](./architecture/equipment-protocols.md)
  Pool-equipment communication protocols, vendor comparisons, frame characteristics, and reverse-engineering status.
- [Protocol Libraries](./architecture/protocol-libraries.md)
  Library-layer boundaries between the `splash-protocol` service, protocol core logic, and vendor-specific plugins.

### Interfaces

- [Interface Design Overview](./interfaces/api-design.md)
  Entry point for interface contracts and contract boundaries.
- [REST API Contract](./interfaces/api-rest.md)
  REST resources, envelope rules, health behavior, and request/response examples.
- [SSE Event Contract](./interfaces/api-events.md)
  Browser-facing live event types and reconnect behavior.
- [NATS Messaging Contract](./interfaces/messaging-nats.md)
  Internal messaging subjects, payloads, and ownership rules.
- [Normalized Domain Contract](./interfaces/normalized-contracts.md)
  Normalized equipment events and command vocabulary above the protocol layer.

### Services

- [Splash NATS Service](./services/splash-nats/README.md)
  Service-specific design index for the platform message backbone on `splash-core`.
- [Splash Serial Service](./services/splash-serial/README.md)
  Service-specific design index for the RS-485 transport daemon on `splash-zero`.
- [Splash Protocol Service](./services/splash-protocol/README.md)
  Service-specific design index for the protocol decode, normalize, and command service on `splash-core`.
- [Splash API Service](./services/splash-api/README.md)
  Service-specific design index for the browser-facing REST and SSE service on `splash-core`.

### Workflows

- [Platform Workflows](./workflows/workflows.md)
  Onboarding, maintenance, seasonal, automation, protocol, and degraded-state workflows.

## Supporting artifacts

- `docs/images/` contains all diagrams extracted from the Word document and referenced from the relevant markdown files.

## Editing conventions

- Preserve stable terminology: `splash-core`, `splash-zero`, `Splash API`, `Protocol Explorer`, `SLAM`, `WeatherProvider`, `ProtocolDecoder`, and `SensorProvider`.
- When source information is incomplete, add `TODO:`, `ASSUMPTION:`, or `QUESTION:` rather than inventing behavior.
- Prefer updating the focused document that owns the topic instead of adding new standalone design notes.
