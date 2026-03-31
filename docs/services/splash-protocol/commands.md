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

- Pentair controller-managed pump-circuit `set_speed`

The first Explorer-only diagnostic command should be:

- Pentair manual Remote Layout page request

Initial scope rules:

- target equipment type: `pump`
- protocol plugin: `pentair_easytouch`
- target path: controller-managed EasyTouch pump circuit
- command family: normalized `set_speed`

ASSUMPTION: the initial `set_speed` implementation targets the EasyTouch
controller-mediated circuit-speed path rather than direct IntelliFlo pump
remote-control writes.

## Initial Pentair controller-mediated write sequence

For the first supported live `set_speed` path, `splash-protocol` should:

1. resolve the controller-managed circuit that owns the target pump speed
2. use controller system-status decoding to confirm the relevant circuit
   assignment and control clues before command encode
3. encode the Pentair controller write needed to update that circuit speed
4. if required, issue or correlate the circuit activation flow that causes the
   controller to apply the new speed

Rules:

- the sequence should remain part of one normalized command lifecycle
- controller-status circuit discovery is a prerequisite, not an optional hint,
  for the first controller-managed implementation
- all writes in the sequence should carry the same `command_id`
- `protocol.command.encoded` and `serial.write.request` may emit one message per
  encoded transport write while still representing one normalized command
- the plugin should attach `bus_requirements.requires_idle_ms = 50`
- unsupported Pentair direct-pump and non-controller write families remain out
  of scope for this first slice

ASSUMPTION: the initial live implementation depends on captured EasyTouch
circuit-speed command and confirmation frames rather than the earlier direct
IntelliFlo Program 1 RPM inference.

## Deferred direct-pump scenarios

The following scenarios are explicitly deferred beyond the first controller-
managed milestone slice:

1. pumps with no EasyTouch-managed circuits assigned
2. pumps not connected through an EasyTouch controller path
3. standalone or no-controller deployments where Splash must issue direct pump
   writes and keep the requested RPM in effect itself

Those scenarios require separate frame capture, protocol design, and operator
workflow decisions. They should not weaken the initial controller-managed
command model.

## Manual Remote Layout diagnostic request

Protocol Explorer may trigger a manual Pentair Remote Layout request without
pretending it is a normalized equipment-control action.

Initial rules:

- protocol plugin: `pentair_easytouch`
- command type: `request_remote_layout_page`
- destination: controller `0x10`
- source: Splash remote or client address
- frame:
  - protocol byte `0x01`
  - action `0xe1`
  - payload `[page_index]`
- initial completion rule:
  - complete once the transport write is observed successfully
  - later `0x21` response correlation is tracked separately as protocol mapping
    work, not required for this first diagnostic slice

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

For the initial controller-managed pump-circuit `set_speed` path:

- `transmitted` means all required controller write frames for the command were
  acknowledged by `serial.tx.raw` with `write_result = ok`
- `completed` means later controller and pump-status observations confirm that
  the requested circuit speed is in effect

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
