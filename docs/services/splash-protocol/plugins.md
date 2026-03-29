# Plugin Model

[Back to Splash Protocol Service](./README.md)

## Purpose

This document defines how protocol-specific logic is isolated inside
`splash-protocol`.

## Design rule

Vendor and protocol-family specifics should be isolated to plugin libraries.

Recommended layers:

- protocol core library:
  - stream-scoped frame assembly orchestration
  - command-correlation orchestration
  - plugin registry contracts
  - normalized event publication helpers
- protocol plugin libraries:
  - vendor-specific framing
  - checksum rules
  - decode logic
  - encode logic
  - command/response matching hints
- `splash-protocol` service:
  - NATS integration
  - health and metrics
  - configuration-provider integration
  - live plugin selection for the pool

## Multiple loaded plugins

Multiple plugins may be loaded into the process registry.

Rules:

- multiple plugins may exist in-process at the same time
- registry population should come from local discovery of the packaged plugin
  set or plugin directory
- one pool resolves to exactly one active plugin for live traffic
- plugins must not compete to decode the same live stream in normal operation
- plugin switching must be explicit through configuration, not live auto-detection

## Discovery model

Plugin availability and pool selection are separate concerns.

Rules:

- plugin availability should be determined locally at service startup
- local discovery may use built-in packaged plugins, a known plugin directory,
  or both
- pool configuration should only select from discovered plugin ids
- a pool selecting a plugin that is not locally available is a fatal runtime
  condition because the deployment cannot satisfy the configured protocol

## Plugin identity

Plugin identity should follow protocol-family-oriented naming.

Initial documented entries:

- `pentair_easytouch`
- `jandy_aqualink_rs`
- `hayward_omnilogic_local`

V1 support expectations:

- `pentair_easytouch`: implemented and active
- `jandy_aqualink_rs`: explicit stub
- `hayward_omnilogic_local`: explicit stub

## Stub plugin expectations

Stub plugins are useful to validate the multi-protocol platform shape before
full protocol support exists.

Stub plugins should:

- register successfully in the process registry
- expose metadata and plugin identity
- reject live decode and command encode with structured unsupported errors
- support Protocol Explorer capability introspection where practical

## Plugin interface expectations

Each plugin should expose at least:

- identity and version metadata
- protocol-family transport settings
- frame assembly hints
- frame validation
- frame decode
- command encode
- command/response correlation hints
- normalized event mapping

The concrete language shape is implementation-specific, but the service must be
able to treat plugins through a narrow contract boundary.

## Auto-detection

V1 should not rely on protocol auto-detection for live traffic.

Pros of auto-detection:

- could reduce manual configuration
- may help future mixed-platform tooling

Cons:

- ambiguous or incorrect classification is hard to recover from
- startup becomes less deterministic
- multiple protocols could appear superficially plausible on a noisy stream
- live traffic ownership becomes unclear

Recommendation:

- live plugin selection is configuration-driven in v1
- passive detection hints may be added later as diagnostics only
