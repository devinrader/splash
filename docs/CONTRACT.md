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

The primary system design authority for Splash is the repository's Gitea wiki.

Within this workspace, the sibling `splash.wiki` repository is the checked-out
local copy of that canonical wiki.

The Gitea wiki is the **authoritative specification** for:
- Product requirements
- Architecture
- Data models
- APIs
- Workflows
- Protocol reference and reverse-engineering findings

This repository-local `splash.platform/docs` directory is retained only for:
- Codex and agent operating contract material
- minimal implementation-facing guardrails that must remain available in the
  workspace even when the wiki is not cloned locally
- pointers into the canonical wiki structure

With the exception of `README.md` and `CONTRACT.md`, no content in
`splash.platform/docs` is an authoritative design source.

Code is an implementation of the design authority, not the source of truth.

---

## Design Documents

The canonical design corpus lives in the Splash Gitea wiki and is available in
this workspace through the sibling `splash.wiki` repository.

Repository-local `splash.platform/docs` should remain intentionally small and
contain only:

- `CONTRACT.md`
- `README.md`
- any other minimal local agent-contract or implementation-guardrail documents
  explicitly kept for workspace use

All broader design-relevant material should migrate to and be maintained in the
wiki, with local edits made in `splash.wiki`.

---

## Core Principles

1. **Design First**
   - All meaningful changes begin in the Gitea wiki
   - In this workspace, that means updating `splash.wiki`
   - Code follows design, not the reverse

2. **Explicitness Over Assumption**
   - If it is not written, it is not decided

3. **Consistency Over Speed**
   - Maintaining system integrity is more important than fast implementation

4. **Single Source of Truth**
   - Do not duplicate canonical design logic outside the wiki unless a local
     Codex/agent contract requires a minimal copy

---

## Implementation Rules

1. All code MUST align with the canonical design authority in the wiki plus the
   local agent contract in `splash.platform/docs`
2. Do NOT implement behavior that is:
   - Undefined in the docs
   - In conflict with the docs

3. If a request introduces new behavior:
   - Propose updates to the appropriate wiki page(s) in `splash.wiki`
   - Wait for approval before implementing

4. If documentation is unclear or incomplete:
   - Ask clarifying questions
   OR
   - Add entries to the appropriate open-questions content in `splash.wiki`

---

## Conflict Handling Protocol

When a conflict is detected:

1. STOP implementation immediately

2. Identify and cite the conflict:
   - File name or wiki page in `splash.wiki`
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

1. Update the relevant wiki pages in `splash.wiki`
2. Ensure consistency across the authoritative wiki content
3. Update repository-local `splash.platform/docs` only when:
   - the local Codex/agent contract changes
   - local workspace guidance must be kept in-repo
   - wiki authority or migration pointers need adjustment
4. Only after documentation is updated:
   - proceed to implementation

---

## Delivery Governance

All code changes must map to an applicable Gitea Issue. All commits must reference the single most relevant issue. Relevant unit and integration tests must be run before commit. Unit and integration coverage must be monitored independently and warned on if either falls below 80%. No commit may be made with less than 100% passing required tests unless Devin gives explicit permission for that specific commit.

Design-document changes belong in `splash.wiki` and may be committed to the
wiki repository when appropriate. Workspace tasks may involve coordinated
changes across both the `splash.platform` and `splash.wiki` repositories.

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
the design-decision section or page in `splash.wiki`

Each decision should include:
- Context
- Decision made
- Alternatives considered
- Tradeoffs

---

## Open Questions

All unresolved items must be tracked in:
the open-questions section or page in `splash.wiki`

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

- the Gitea wiki is the primary system design authority
- `splash.wiki` is the local checked-out copy of that canonical wiki
- local `splash.platform/docs` is a minimal Codex and agent contract, not the
  full design set
- documentation precedes implementation
- Conflicts must be surfaced, not ignored
- Ambiguity must be made explicit
- Consistency is mandatory
