# Splash Local Agent Docs

This repository-local `/docs` directory is no longer the full canonical design
set for Splash.

The primary design authority now lives in the Splash repository's Gitea wiki.

This local `/docs` directory is retained for:

- Codex and agent operating contract material
- minimal implementation guardrails that should remain available in the local
  workspace
- migration notes and pointers to the canonical wiki content

## Local authority

Repository-local docs that remain authoritative in-workspace:

- [Design Authority Contract](./CONTRACT.md)
  Local governance for Codex and implementation work
- [Wiki Migration Plan](./WIKI-MIGRATION.md)
  Temporary local plan for moving the broader design corpus into the Gitea wiki

Additional local docs may remain temporarily during migration, but they should
be treated as secondary unless they are explicitly identified as local
Codex/agent-contract material.

## Reading order for Codex

1. Read [Design Authority Contract](./CONTRACT.md).
2. Read any remaining local implementation-guardrail docs that are explicitly
   required by [AGENTS.md](../AGENTS.md).
3. Use the Gitea wiki as the canonical source for broader product,
   architecture, interface, protocol, and workflow design.

## Migration guidance

As documentation moves to the wiki:

1. the wiki should be treated as canonical
2. repo-local copies should be reduced or removed unless they are needed for:
   - Codex and agent rules
   - local implementation guardrails
   - migration pointers
3. if a local doc and the wiki diverge, the wiki wins unless the local doc is a
   declared Codex/agent-contract exception

## Editing conventions

- Preserve stable terminology: `splash-core`, `splash-zero`, `Splash API`,
  `Protocol Explorer`, `SLAM`, `WeatherProvider`, `ProtocolDecoder`, and
  `SensorProvider`.
- When source information is incomplete, add `TODO:`, `ASSUMPTION:`, or
  `QUESTION:` rather than inventing behavior.
- Prefer updating the canonical wiki page that owns the topic instead of adding
  new standalone local design notes.
