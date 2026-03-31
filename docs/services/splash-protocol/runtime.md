# Runtime Model

[Back to Splash Protocol Service](./README.md)

## Process model

`splash-protocol` runs on `splash-core` as a TypeScript or Node.js service.

It should:

- start independently of `splash-serial`
- connect to NATS on `splash-core`
- expose local `GET /healthz` and `GET /metrics`
- maintain per-stream frame-assembly state
- maintain command-correlation state for active commands
- discover a process-local registry of protocol plugins at startup from the
  local packaged plugin set or plugin directory

## Runtime state machine

Primary startup and runtime phases:

- `booting`
- `config_invalid`
- `starting_http`
- `starting_nats`
- `loading_plugins`
- `config_degraded`
- `decode_degraded`
- `command_degraded`
- `running_degraded`
- `running_ok`
- `fatal`
- `shutting_down`

State meanings:

- `booting`: process has started but static configuration has not yet been validated
- `config_invalid`: required service configuration is missing or invalid and the process must exit
- `starting_http`: local health and metrics listener is starting
- `starting_nats`: local HTTP is available and the service is attempting to establish NATS connectivity
- `loading_plugins`: service is constructing the process-local protocol registry
- `config_degraded`: runtime plugin selection or plugin configuration is temporarily unavailable or invalid
- `decode_degraded`: transport traffic may be present, but live decode cannot proceed safely
- `command_degraded`: command encode or command correlation is blocked while decode or config remains degraded
- `running_degraded`: at least one recoverable dependency is degraded, but the process remains alive
- `running_ok`: local HTTP, NATS, active plugin resolution, decode, and command flow are all available
- `fatal`: unrecoverable startup failure requiring process exit
- `shutting_down`: explicit service termination after signal or fatal shutdown handling

## Fatal vs degraded failures

Only unrecoverable service-local failures should terminate the process.

Fatal failures:

- invalid static service configuration
- HTTP bind failure
- plugin registry construction failure caused by invalid built-in code invariants
- selected `protocol_plugin` not present in the locally discovered plugin set
- selected `protocol_config` invalid in a way that prevents safe decode or
  encode and cannot be corrected without a configuration change or restart
- internal invariant failure that leaves safe decode or command behavior impossible

Degraded but non-fatal failures:

- NATS unavailable at startup or runtime
- configuration-provider unavailable
- PostgreSQL unavailable
- active plugin selection unavailable
- serial stream unavailable or stale
- command correlation timeout
- unsupported or malformed protocol frames in live traffic

Rule:

- degraded failures must keep the process alive, keep `/healthz` and `/metrics`
  reachable, and continue retry or wait behavior in the background

## Startup policy

Startup should proceed in this order:

1. validate static service configuration
2. establish local HTTP listener
3. connect to NATS
4. load built-in plugin registry
5. obtain active plugin selection and plugin config through the configuration-provider boundary
6. start stream-processing and command-processing loops
7. transition into `running_ok` or `running_degraded`

Startup outcomes:

- invalid static service configuration:
  - phase becomes `config_invalid`
  - process exits
- HTTP bind failure:
  - phase becomes `fatal`
  - process exits
- NATS unavailable:
  - phase becomes `running_degraded`
  - process stays alive and retries NATS in the background
- configuration provider unavailable:
  - phase becomes `config_degraded`
  - process stays alive
  - live decode and command encode remain blocked until configuration becomes
    available from the provider
- temporary env-backed provider configured:
  - phase may proceed directly to valid active plugin resolution
  - this is acceptable for milestone-1 local and early integrated bring-up
    while the fuller provider implementation does not yet exist
- active plugin selection unavailable:
  - phase becomes `config_degraded`
  - process stays alive
  - live decode and command encode remain blocked until valid selection becomes
    available from the provider
- active plugin unknown among discovered plugins:
  - phase becomes `fatal`
  - process exits because the deployment cannot satisfy the configured pool protocol
- active plugin config invalid:
  - phase becomes `fatal`
  - process exits because safe decode and command behavior cannot proceed from the configured state

## Pool and plugin model

V1 pool rules:

- the platform is single-pool in v1
- one pool resolves to exactly one active protocol plugin at a time
- multiple protocol plugins may be loaded into the process registry at once
- only the active plugin may process live traffic for the pool

Explorer rules:

- Protocol Explorer may use any loaded plugin for offline decode, diff, or simulate workflows
- live traffic processing must remain deterministic and use only the active plugin

## Stream ownership

`splash-protocol` is stateful per active `stream_id`.

Rules:

- frame assembly state is scoped to one active `stream_id`
- when `stream_id` changes, all partial frame buffers from the old stream must be
  reclassified as unknown data for that old stream rather than silently dropped
- command correlation state targeting the old stream must be marked stale or failed
- live decode must not combine bytes from different streams

Transport identity rules:

- raw transport subjects should be keyed by `serial_instance_id` and `stream_id`
- `pool_id` is not required on raw `serial.*` subjects
- milestone-1 may process a single active `serial_instance_id` through the
  env-backed provider path
- a later binding workflow may associate `serial_instance_id` with a pool or
  controller domain before decode and command flow proceed

## Decode flow

Live decode flow:

1. consume `serial.rx.raw`
2. route the chunk to the active plugin runtime for the selected pool and stream
3. reconstruct frames from native transport chunk boundaries
   - frame assembly may need to recognize multiple frame families on the same
     RS-485 stream, such as Pentair controller/pump frames and Intellichlor
     chlorinator frames
4. validate framing and checksum rules
5. publish `protocol.frame.raw`
6. publish `protocol.frame.buffered` for bytes still retained in the decode buffer
7. publish `protocol.frame.unidentified` for bytes classified as unknown
8. publish `protocol.frame.decoded`
9. publish normalized `equipment.state.*` events when the decoded frame maps to normalized state

Decoder invariant:

- `splash-protocol` must not silently drop or ignore receive-side bytes
- every received byte must be represented as one of:
  - a known assembled frame
  - buffered bytes awaiting more input
  - unknown bytes
- for Pentair `FF 00 FF A5` frames, only protocol bytes `0x00` and `0x01` are
  valid; any other value must be classified as unknown frame type rather than
  decoded as Pentair protocol traffic

Minimum normalized outputs in the initial service design:

- controller state
- pump state
- chlorinator state

Partial normalized publication rule:

- when a recognized protocol message maps to a normalized event but only a
  subset of fields is confidently understood, `splash-protocol` may publish a
  partial normalized event using only the trusted fields
- unknown or untrusted fields should be omitted from the normalized event
  rather than guessed
- the corresponding `protocol.frame.decoded` payload should continue to surface
  the remaining raw or unknown protocol data for diagnostics

## Command flow

Live command flow:

1. consume `protocol.command.intent`
2. validate that command encoding is currently available
3. encode the command through the active plugin
4. publish `protocol.command.encoded`
5. publish `serial.write.request`
6. consume `serial.tx.raw`
7. update command-correlation state
8. publish `command.result.{command_id}` transitions until `completed`, `timed_out`, or `failed`

ASSUMPTION: the default command-correlation timeout is `5000ms` unless a plugin
defines a stricter command family expectation.

## Configuration-provider boundary

`splash-protocol` should not hard-code PostgreSQL as its only configuration
source for pool selection or plugin configuration.

Design requirement:

- locally available plugins should be discovered by the service from the local
  packaged plugin set or plugin directory
- pool-level active plugin selection and plugin config should be obtained
  through a configuration-provider abstraction
- the provider may read from PostgreSQL in normal operation
- the milestone-1 concrete provider may read from explicit env vars
- the runtime should support degraded startup when PostgreSQL is unavailable
- degraded startup means the service stays alive while decode and command flow
  remain blocked until the provider can return a valid pool-selected plugin and
  config

## Loop expectations

Long-lived runtime loops include:

- HTTP serving
- NATS connectivity
- transport-stream processing
- command-intent processing
- command-result correlation housekeeping

Rules:

- no long-lived loop should exit cleanly during normal operation except during explicit shutdown
- unexpected clean loop exits must be logged and surfaced through degraded health
- loss of the HTTP surface is fatal
- loss of NATS, config provider, or live stream state is degraded, not fatal
