# Command Flow

[Back to Splash Protocol Service](./README.md)

## Purpose

This document defines how `splash-protocol` handles outbound command intent and
result correlation.

## Input contract

`splash-protocol` consumes `protocol.command.intent`.

It must:

- validate that an active plugin exists for the pool
- validate that plugin configuration supports the command
- encode the command into protocol bytes
- publish `protocol.command.encoded`
- publish `serial.write.request`
- track command state until transmit confirmation and completion or timeout

## Initial supported live command

The first live command supported by `splash-protocol` is:

- Pentair direct pump `set_speed`

Initial scope rules:

- target equipment type: `pump`
- protocol plugin: `pentair_easytouch`
- target bus address: direct IntelliFlo pump range such as `0x60`
- command family: normalized `set_speed`

ASSUMPTION: the initial `set_speed` implementation targets the direct Pentair
pump RS-485 path and uses the currently documented remote-control plus direct
RPM-write sequence rather than broader EasyTouch controller-mediated equipment
write flows.

## Initial Pentair direct pump write sequence

For the first supported live `set_speed` path, `splash-protocol` should:

1. enable remote control on the target pump
2. send the direct RPM write for the supported Pentair pump command path
3. disable remote control on the target pump

Rules:

- the sequence should remain part of one normalized command lifecycle
- all writes in the sequence should carry the same `command_id`
- `protocol.command.encoded` and `serial.write.request` may emit one message per
  encoded transport write while still representing one normalized command
- the plugin should attach `bus_requirements.requires_idle_ms = 50`
- unsupported Pentair write families remain out of scope for this first slice

ASSUMPTION: the initial direct RPM write uses the currently documented Pentair
pump command path for Program 1 RPM while we validate additional captures for
manual or controller-mediated speed control behavior.

## EasyTouch interaction for direct pump control

The initial direct IntelliFlo `set_speed` slice must be documented as a
best-effort direct pump command path, not as a guarantee that the requested RPM
will remain in effect while EasyTouch still owns pump scheduling or circuit
activation.

If the operator goal is "set RPM directly and have it stick," the currently
documented options are:

1. disable EasyTouch pump control
   - remove the pump from controller-managed circuits or disable the relevant
     EasyTouch schedules
   - direct Splash-issued RPM commands are most likely to persist in this mode
2. override continuously
   - re-send the requested RPM every few seconds
   - this can work by competing with EasyTouch, but it is operationally messy
     and should not be treated as the preferred steady-state design
3. use EasyTouch properly
   - change the controller-managed circuit speed and activate the circuit that
     owns the pump
   - this is the cleanest supported long-term model and requires broader
     controller-mediated write support than the initial direct-pump slice
4. physically isolate the pump
   - disconnect the pump RS-485 link from EasyTouch and connect only the
     Splash-controlled bus path
   - this gives Splash full control but changes the physical deployment

Rules:

- a successful `serial.tx.raw` result means bytes reached the bus, not that the
  controller will keep the pump at the requested RPM
- a direct-pump `completed` result should rely on observed follow-up pump state,
  not on transport success alone
- future controller-mediated pump control should be preferred over perpetual
  direct-RPM competition with EasyTouch

## Result stages

Command result progression should use `command.result.{command_id}`.

Expected states:

- `accepted`
- `encoded`
- `transmitted`
- `completed`
- `timed_out`
- `failed`

Expected stage meanings:

- `accepted`: intent was received and passed initial validation
- `encoded`: plugin successfully encoded the command
- `transmitted`: `serial.tx.raw.write_result = ok` was observed for the command
- `completed`: matching protocol evidence confirmed the intended command effect
- `timed_out`: no matching response or confirmation was observed before timeout
- `failed`: plugin validation failed, encode failed, stream went stale, or transport returned a non-`ok` terminal result

For the initial direct pump `set_speed` path:

- `transmitted` means all required writes in the remote-enable, speed-write,
  and remote-disable sequence were acknowledged by `serial.tx.raw` with
  `write_result = ok`
- `completed` means a later pump-status observation confirms the requested RPM

## Correlation ownership

`splash-protocol` owns correlation between:

- `protocol.command.intent`
- `protocol.command.encoded`
- `serial.write.request`
- `serial.tx.raw`
- subsequent decoded response or status frames

Transport success does not imply protocol success.

Rules:

- `serial.tx.raw.write_result = ok` means bytes reached the transport layer
- only `splash-protocol` may determine whether the command actually completed
- stale-stream, timeout, rejected, or port-error transport results should become failed command states unless the command is retried through a new stream
- if any write in a multi-write command sequence fails, the whole normalized
  command should transition to `failed`

## Correlation window

Command state should be held in memory until:

- a terminal result is reached
- the active `stream_id` changes
- the command timeout elapses

ASSUMPTION: the default correlation timeout is `5000ms`, with plugin-specific
overrides allowed later.

## Stream changes

If the active `stream_id` changes while commands are pending:

- pending commands for the prior stream must not remain silently active
- command results should transition to `failed` with a machine-readable stale-stream or stream-reset reason
- a later retry must create a new command flow against the new stream

## Minimum bus requirements

The plugin may attach protocol-specific transport requirements to
`serial.write.request.bus_requirements`.

In v1 this primarily includes:

- `requires_idle_ms`

Rules:

- the plugin may recommend or require the minimum bus-idle wait
- `splash-serial` remains the owner of actual bus-idle enforcement

## Dry-run behavior

Dry-run command intent should:

- validate through the active plugin
- publish `protocol.command.encoded`
- avoid publishing `serial.write.request`
- publish a non-terminal or explicit dry-run command result as appropriate

ASSUMPTION: the first implementation may treat dry-run as `accepted` plus
`encoded` without a transmit stage, while a richer dry-run result shape can be
added later if needed.
