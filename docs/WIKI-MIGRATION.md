# Splash Wiki Migration Plan

This file is a temporary local migration guide.

The Gitea wiki is now the primary design authority. This document exists only
to help move the current repository-local design corpus into a wiki structure
that is easier to maintain and browse.

## Goals

The migration should:

- make the Gitea wiki the canonical home for broader design material
- keep repository-local `/docs` limited to Codex and agent contract material
- separate stable design from installation-specific findings and
  reverse-engineering evidence
- reduce duplication between service docs, architecture docs, and protocol notes
- preserve enough structure that implementation work remains traceable

## What Stays Local

These should remain in the repository workspace:

- [CONTRACT.md](./CONTRACT.md)
- [README.md](./README.md)
- [WIKI-MIGRATION.md](./WIKI-MIGRATION.md) while migration is active
- [AGENTS.md](/Users/devinrader/Projects/splash/AGENTS.md)

Additional local docs may remain only if they are explicitly needed as
workspace-only Codex or implementation guardrails.

## Wiki Information Architecture

Recommended top-level wiki structure:

1. `Home`
2. `Product`
3. `Architecture`
4. `Interfaces`
5. `Services`
6. `Protocols`
7. `Workflows`
8. `Research`

Recommended child-page structure:

### Home

- project overview
- navigation map
- reading order
- "authoritative design lives here" statement

### Product

- Overview
- Requirements
- Decisions
- Assumptions
- Open Questions
- Glossary

### Architecture

- System Architecture
- Data Model
- Deployment
- Operations
- Resilience
- Protocol Libraries
- Configuration Authority

### Interfaces

- API Design
- REST API
- SSE Events
- NATS Messaging
- Normalized Contracts

### Services

- Splash API
- Splash Frontend
- Splash NATS
- Splash Protocol
- Splash Serial

Each service page should have child sections or subpages for:

- Runtime
- Configuration
- Testing
- Operations / Observability
- CI where applicable

### Protocols

- Protocols Home
- Pentair EasyTouch / IntelliTouch Reference
- Pentair Observed Installation
- Pentair Research Notes
- Protocol Library Boundaries
- Future protocol-family pages for Hayward and Jandy

### Workflows

- Platform Workflows
- Protocol Explorer workflow pages if they grow beyond the main workflows page

### Research

- protocol experiment notes
- installation-specific reverse-engineering logs
- evidence summaries that are not yet stable enough for the canonical reference

## Canonical Split Rules

The wiki should separate content by stability and scope:

- stable and reusable design -> Product / Architecture / Interfaces / Services
- stable protocol reference -> Protocols / Reference
- installation-specific observed facts -> Protocols / Observed Installation
- experiment evidence and unresolved hypotheses -> Research
- unresolved decisions -> Product / Open Questions

Specific rule:

- the protocol reference should describe what we believe the protocol is
- the observed-installation page should describe what this specific EasyTouch
  installation currently looks like
- the research page should explain why we believe the reference and what
  remains unresolved

## Current File-to-Wiki Mapping

### Product

| Current repo file | Target wiki page |
| --- | --- |
| `docs/product/overview.md` | `Product/Overview` |
| `docs/product/requirements.md` | `Product/Requirements` |
| `docs/product/decisions.md` | `Product/Decisions` |
| `docs/product/assumptions.md` | `Product/Assumptions` |
| `docs/product/open-questions.md` | `Product/Open Questions` |
| `docs/product/glossary.md` | `Product/Glossary` |

### Architecture

| Current repo file | Target wiki page |
| --- | --- |
| `docs/architecture/architecture.md` | `Architecture/System Architecture` |
| `docs/architecture/data-model.md` | `Architecture/Data Model` |
| `docs/architecture/deployment.md` | `Architecture/Deployment` |
| `docs/architecture/operations.md` | `Architecture/Operations` |
| `docs/architecture/resilience.md` | `Architecture/Resilience` |
| `docs/architecture/protocol-libraries.md` | `Architecture/Protocol Libraries` |

### Interfaces

| Current repo file | Target wiki page |
| --- | --- |
| `docs/interfaces/api-design.md` | `Interfaces/API Design` |
| `docs/interfaces/api-rest.md` | `Interfaces/REST API` |
| `docs/interfaces/api-events.md` | `Interfaces/SSE Events` |
| `docs/interfaces/messaging-nats.md` | `Interfaces/NATS Messaging` |
| `docs/interfaces/normalized-contracts.md` | `Interfaces/Normalized Contracts` |

### Services

| Current repo file | Target wiki page |
| --- | --- |
| `docs/services/splash-api/README.md` | `Services/Splash API` |
| `docs/services/splash-api/runtime.md` | `Services/Splash API/Runtime` |
| `docs/services/splash-api/configuration.md` | `Services/Splash API/Configuration` |
| `docs/services/splash-api/testing.md` | `Services/Splash API/Testing` |
| `docs/services/splash-frontend/README.md` | `Services/Splash Frontend` |
| `docs/services/splash-frontend/runtime.md` | `Services/Splash Frontend/Runtime` |
| `docs/services/splash-frontend/configuration.md` | `Services/Splash Frontend/Configuration` |
| `docs/services/splash-frontend/testing.md` | `Services/Splash Frontend/Testing` |
| `docs/services/splash-nats/README.md` | `Services/Splash NATS` |
| `docs/services/splash-nats/runtime.md` | `Services/Splash NATS/Runtime` |
| `docs/services/splash-nats/operations.md` | `Services/Splash NATS/Operations` |
| `docs/services/splash-nats/streams-and-subjects.md` | `Services/Splash NATS/Streams and Subjects` |
| `docs/services/splash-protocol/README.md` | `Services/Splash Protocol` |
| `docs/services/splash-protocol/runtime.md` | `Services/Splash Protocol/Runtime` |
| `docs/services/splash-protocol/configuration.md` | `Services/Splash Protocol/Configuration` |
| `docs/services/splash-protocol/commands.md` | `Services/Splash Protocol/Command Flow` |
| `docs/services/splash-protocol/plugins.md` | `Services/Splash Protocol/Plugins` |
| `docs/services/splash-protocol/observability.md` | `Services/Splash Protocol/Observability` |
| `docs/services/splash-protocol/testing.md` | `Services/Splash Protocol/Testing` |
| `docs/services/splash-protocol/ci.md` | `Services/Splash Protocol/CI` |
| `docs/services/splash-serial/README.md` | `Services/Splash Serial` |
| `docs/services/splash-serial/runtime.md` | `Services/Splash Serial/Runtime` |
| `docs/services/splash-serial/configuration.md` | `Services/Splash Serial/Configuration` |
| `docs/services/splash-serial/transport.md` | `Services/Splash Serial/Transport` |
| `docs/services/splash-serial/observability.md` | `Services/Splash Serial/Observability` |
| `docs/services/splash-serial/testing.md` | `Services/Splash Serial/Testing` |
| `docs/services/splash-serial/ci.md` | `Services/Splash Serial/CI` |

### Workflows

| Current repo file | Target wiki page |
| --- | --- |
| `docs/workflows/workflows.md` | `Workflows/Platform Workflows` |

### Protocols / Research

| Current repo file | Target wiki page | Notes |
| --- | --- | --- |
| `docs/architecture/equipment-protocols.md` | split | This file should be split across canonical protocol reference, observed installation, and research notes |

Recommended split for `equipment-protocols.md`:

- `Protocols/Pentair EasyTouch Reference`
  - frame format
  - checksum rules
  - action catalog
  - validated payload layouts
  - stable value mappings
- `Protocols/Pentair Observed Installation`
  - current EasyTouch 8 equipment snapshot
  - current circuits
  - current custom names
  - current pump-slot assignments
  - current valve settings
- `Research/Pentair EasyTouch Reverse Engineering`
  - before/after experiment notes
  - unresolved bytes
  - evidence trails and competing hypotheses

## Migration Order

Recommended migration order:

1. Create the wiki home and top-level navigation pages.
2. Migrate Product pages.
3. Migrate Architecture pages.
4. Migrate Interfaces pages.
5. Migrate Service pages.
6. Split and migrate `equipment-protocols.md`.
7. Move unresolved items into the wiki's Open Questions and Research pages.
8. Remove or shrink local repo copies once the wiki pages are confirmed.

## Migration Rules

While migrating:

- prefer moving stable pages with minimal wording changes first
- split oversized pages only when doing so makes the resulting wiki structure
  clearer
- do not lose installation-specific evidence; move it to a dedicated observed
  installation or research page
- do not keep duplicate canonical copies in both places longer than necessary
- when a page is migrated, leave a short local pointer only if the workspace
  still needs one

## Immediate Next Steps

1. Create the wiki top-level page structure.
2. Create the protocol split pages before moving more Pentair material.
3. Migrate the current repo docs category by category.
4. Reduce local `/docs` to:
   - contract material
   - migration guide
   - minimal implementation guardrails
