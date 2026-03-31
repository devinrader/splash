# Observability

[Back to Splash Protocol Service](./README.md)

## Health surface

`splash-protocol` should expose:

- `GET /healthz`
- `GET /metrics`

This HTTP surface should remain available even if NATS or the configuration
provider is unavailable.

### `GET /healthz` contract

`GET /healthz` should return JSON shaped like:

```json
{
  "status": "ok",
  "startup_phase": "running_ok",
  "pool_id": "uuid",
  "active_plugin": "pentair_easytouch",
  "stream_id": "uuid",
  "nats": "ok",
  "configuration": "valid",
  "decode": "ok",
  "commands": "ok",
  "config_error_code": null,
  "decode_error_code": null,
  "command_error_code": null,
  "shutdown_reason": null,
  "last_transition_at": "2026-03-29T18:00:00Z"
}
```

Allowed `status` values:

- `ok`
- `degraded`
- `error`

HTTP behavior:

- `200` for `ok` and `degraded`
- `503` for `error`

Health expectations:

- degraded NATS, provider, or stream state should not remove local health
- active plugin identity should be visible
- decode and command readiness should be distinguishable
- machine-readable error codes should explain the current degraded condition

## Metrics expectations

Prometheus metrics should include at least:

- current active plugin status
- current decode readiness
- current command readiness
- frames assembled
- frames decoded
- frame validation failures
- normalized events published
- commands accepted
- commands encoded
- command results by status
- stream resets observed
- command correlation timeouts

Initial metric names should include:

- `splash_protocol_active_plugin_info`
- `splash_protocol_decode_state`
- `splash_protocol_command_state`
- `splash_protocol_frames_assembled_total`
- `splash_protocol_frames_decoded_total`
- `splash_protocol_frame_validation_failures_total`
- `splash_protocol_normalized_events_total`
- `splash_protocol_commands_total`
- `splash_protocol_command_results_total`
- `splash_protocol_stream_resets_total`
- `splash_protocol_correlation_timeouts_total`

## Logging

`splash-protocol` should emit structured JSON logs.

Important events include:

- service start and shutdown
- NATS connect and disconnect
- plugin registry load
- active plugin selection
- plugin configuration failure
- stream reset and buffer discard
- frame assembly success or discard
- checksum or framing failure
- normalized event publication
- command accept, encode, transmit observation, completion, timeout, and failure

Required base fields:

- `ts`
- `level`
- `service`
- `event`
- `message`
- `startup_phase`
- `serial_instance_id` when known
- `pool_id` when known
- `active_plugin` when known
- `stream_id` when relevant
- `command_id` when relevant
- `error_code` when relevant
- `shutdown_reason` when relevant
- `package_version` or commit identifier when available

### Stable event names

Initial stable event names should include:

- `service.start`
- `service.shutdown`
- `config.invalid`
- `http.listen.started`
- `http.listen.failed`
- `nats.connect.attempt`
- `nats.connect.succeeded`
- `nats.connect.failed`
- `plugin.registry.loaded`
- `plugin.selected`
- `plugin.selection.failed`
- `stream.reset`
- `frame.assembled`
- `frame.buffered`
- `frame.unknown_classified`
- `frame.decoded`
- `frame.decode_failed`
- `event.normalized_published`
- `command.accepted`
- `command.encoded`
- `command.transmit_failed`
- `command.transmitted`
- `command.completed`
- `command.timed_out`

## Protocol Explorer diagnostics

Protocol Explorer should remain a separate runnable consumer surface.

In the initial service design:

- `splash-protocol` should not require a dedicated local decode API beyond
  health and metrics
- Explorer diagnostics should be powered by published protocol-level events and
  command-result events
- loaded stub plugins should still be visible through diagnostics metadata where
  practical
