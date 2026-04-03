# Splash Local Agent Docs

This repository-local `/docs` directory is no longer the full canonical design
set for Splash.

The primary design authority now lives in the Splash repository's Gitea wiki.

This local `/docs` directory is retained for:

- Codex and agent operating contract material
- minimal implementation guardrails that should remain available in the local
  workspace
- a short pointer to the canonical wiki content

## Local authority

Repository-local docs that remain authoritative in-workspace:

- [Design Authority Contract](./CONTRACT.md)
  Local governance for Codex and implementation work

The broader design corpus now lives in the Gitea wiki.

## Reading order for Codex

1. Read [Design Authority Contract](./CONTRACT.md).
2. Read any remaining local implementation-guardrail docs that are explicitly
   required by [AGENTS.md](../AGENTS.md).
3. Use the Gitea wiki as the canonical source for broader product,
   architecture, interface, protocol, and workflow design.

## Canonical Guidance

1. the wiki is canonical
2. local `/docs` exists only for Codex and agent contract material
3. if local `/docs` and the wiki diverge on broader design, the wiki wins

## Editing conventions

- Preserve stable terminology: `splash-core`, `splash-zero`, `Splash API`,
  `Protocol Explorer`, `SLAM`, `WeatherProvider`, `ProtocolDecoder`, and
  `SensorProvider`.
- When source information is incomplete, add `TODO:`, `ASSUMPTION:`, or
  `QUESTION:` rather than inventing behavior.
- Prefer updating the canonical wiki page that owns the topic instead of adding
  new standalone local design notes.
