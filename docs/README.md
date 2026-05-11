# Splash Local Agent Docs

This repository-local `/docs` directory is not the full canonical design set
for Splash.

With the exception of this `README.md` and [`CONTRACT.md`](./CONTRACT.md), no
content in `splash.platform/docs` is the authoritative source for Splash design
documents.

The primary design authority lives in the Splash repository's Gitea wiki.
Within this local workspace, that authority is available as the sibling
`splash.wiki` repository, which is the checked-out local copy of the canonical
wiki.

This local `/docs` directory is retained for:

- Codex and agent operating contract material
- minimal implementation guardrails that should remain available in the local
  workspace
- a short pointer to the canonical wiki content in `splash.wiki`

## Local authority

Repository-local docs that remain authoritative in `splash.platform/docs`:

- [Design Authority Contract](./CONTRACT.md)
  Local governance for Codex and implementation work

The broader design corpus lives in the Gitea wiki and is available locally in
the sibling `splash.wiki` repository.

## Reading order for Codex

1. Read [Design Authority Contract](./CONTRACT.md).
2. Read any remaining local implementation-guardrail docs that are explicitly
   required by [AGENTS.md](../AGENTS.md).
3. Use `splash.wiki` as the local checked-out copy of the canonical wiki for
   broader product,
   architecture, interface, protocol, and workflow design.

## Canonical Guidance

1. the wiki is canonical
2. `splash.wiki` is the local checked-out copy of that canonical wiki in this
   workspace
3. local `splash.platform/docs` exists only for Codex and agent contract
   material, except for `README.md` and `CONTRACT.md`
4. if local `splash.platform/docs` and the wiki diverge on broader design, the
   wiki wins

## Editing conventions

- Preserve stable terminology: `splash-core`, `splash-zero`, `Splash API`,
  `Protocol Explorer`, `SLAM`, `WeatherProvider`, `ProtocolDecoder`, and
  `SensorProvider`.
- When source information is incomplete, add `TODO:`, `ASSUMPTION:`, or
  `QUESTION:` rather than inventing behavior.
- Prefer updating the canonical wiki page in `splash.wiki` that owns the topic
  instead of adding new standalone local design notes in `splash.platform`.
