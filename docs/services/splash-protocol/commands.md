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
