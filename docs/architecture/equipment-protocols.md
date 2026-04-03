# Equipment Protocols

This repository-local page is no longer the canonical protocol reference.

Canonical wiki pages:
- `Protocols/Pentair EasyTouch / IntelliTouch Reference`
- `Protocols/Pentair Observed Installation`
- `Research/Pentair EasyTouch Reverse Engineering`

Current local rule:
- use the Gitea wiki for protocol-family reference, observed installation state,
  and reverse-engineering notes
- treat this file only as a migration pointer during the wiki transition

Local guardrail reminder:
- for live controller configuration writes, the equipment remains the primary
  source of configuration truth
- Splash must fetch a fresh live configuration read before constructing any live
  config write
