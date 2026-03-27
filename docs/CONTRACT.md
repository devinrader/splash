# Design Authority Contract

[Back to README](./README.md)

## Purpose
This document defines how system design decisions are created, validated, and enforced.

The goal is to ensure:
- The system remains coherent and consistent
- Design decisions are explicit and traceable
- Implementation always follows documented intent

---

## Source of Truth

All system design decisions are defined in the `/docs` directory.

These documents are the **authoritative specification** for:
- Architecture
- Data models
- APIs
- Workflows
- Requirements

Code is an implementation of these documents — not the source of truth.

---

## Design Documents

The `/docs` directory includes (but is not limited to):

- `product/overview.md`
- `product/requirements.md`
- `architecture/architecture.md`
- `architecture/data-model.md`
- `interfaces/api-design.md`
- `workflows/workflows.md`
- `product/decisions.md`
- `product/assumptions.md`
- `product/open-questions.md`

All design-relevant information must live in these documents.

---

## Core Principles

1. **Design First**
   - All meaningful changes begin in `/docs`
   - Code follows design, not the reverse

2. **Explicitness Over Assumption**
   - If it is not written, it is not decided

3. **Consistency Over Speed**
   - Maintaining system integrity is more important than fast implementation

4. **Single Source of Truth**
   - Do not duplicate design logic outside `/docs`

---

## Implementation Rules

1. All code MUST align with `/docs`
2. Do NOT implement behavior that is:
   - Undefined in the docs
   - In conflict with the docs

3. If a request introduces new behavior:
   - Propose updates to the appropriate document(s)
   - Wait for approval before implementing

4. If documentation is unclear or incomplete:
   - Ask clarifying questions
   OR
   - Add entries to `product/open-questions.md`

---

## Conflict Handling Protocol

When a conflict is detected:

1. STOP implementation immediately

2. Identify and cite the conflict:
   - File name (e.g., `architecture.md`)
   - Section or concept (e.g., "Service Boundaries")

3. Explain:
   - What the request is asking
   - Why it conflicts with the current design

4. Provide resolution options:
   a) Update the design (recommended)
   b) Explicitly override the design (requires confirmation)

5. Default behavior:
   - BLOCK implementation until resolved

---

## New Feature Protocol

When a request introduces new functionality:

1. Identify which documents are affected
2. Propose updates to those documents
3. Clearly describe:
   - What is being added
   - Why it is needed
   - How it fits into the existing system

4. Wait for confirmation before implementing

---

## Documentation Update Requirements

For any meaningful change:

1. Update relevant `/docs` files
2. Ensure consistency across all documents
3. Add or update:
   - Requirements
   - Architecture
   - Data model
   - APIs (if applicable)

4. Only after documentation is updated:
   - Proceed to implementation

---

## Delivery Governance

All code changes must map to an applicable Gitea Issue. All commits must reference the single most relevant issue. Relevant unit and integration tests must be run before commit. Unit and integration coverage must be monitored independently and warned on if either falls below 80%. No commit may be made with less than 100% passing required tests unless Devin gives explicit permission for that specific commit.

---

## Ambiguity Handling

When encountering ambiguity:

- Add annotations using:
  - `TODO:` → work to be done
  - `ASSUMPTION:` → inferred but not confirmed
  - `QUESTION:` → requires clarification

- Do NOT silently resolve ambiguity
- Do NOT invent requirements

---

## Decision Tracking

All significant design decisions must be recorded in:
`decisions.md`

Each decision should include:
- Context
- Decision made
- Alternatives considered
- Tradeoffs

---

## Open Questions

All unresolved items must be tracked in:
`product/open-questions.md`

This file is a required checkpoint before major implementation work.

---

## Allowed Exceptions

Implementation may proceed without prior documentation update ONLY IF:

- The change is trivial (e.g., typo, formatting, minor refactor)
AND
- It does not affect system behavior, interfaces, or structure

If unsure → treat as non-trivial

---

## Enforcement

This contract must be enforced at all times.

If any request violates these rules:
- It must be challenged
- It must not be implemented until resolved

---

## Summary

- `/docs` is the system design authority
- Documentation precedes implementation
- Conflicts must be surfaced, not ignored
- Ambiguity must be made explicit
- Consistency is mandatory
