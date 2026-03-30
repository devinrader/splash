# NATS Messaging

[Back to README](../README.md)

## Subject catalog

| Subject | Delivery | Publisher |
| --- | --- | --- |
| `serial.rx.raw` | Core NATS | `splash-serial` |
| `serial.tx.raw` | Core NATS | `splash-serial` |
| `serial.port.status` | Core NATS | `splash-serial` |
| `protocol.frame.raw` | Core NATS | `splash-protocol` |
| `protocol.frame.decoded` | Core NATS | `splash-protocol` |
| `equipment.state.controller` | Core NATS | `splash-protocol` |
| `equipment.state.pump` | Core NATS | `splash-protocol` |
| `equipment.state.chlorinator` | Core NATS | `splash-protocol` |
| `automation.suggestion.pump_schedule` | JetStream | `splash-scheduler` |
| `automation.suggestion.heater` | JetStream | `splash-scheduler` |
| `protocol.command.intent` | Core NATS | `splash-api` |
| `protocol.command.encoded` | Core NATS | `splash-protocol` |
| `serial.write.request` | Core NATS | `splash-protocol` |
| `command.result.{command_id}` | Core NATS | `splash-protocol` |
| `notification.send` | JetStream | `splash-scheduler` or `splash-api` |
| `chemistry.reading` | Core NATS | `splash-api` |
| `weather.updated` | Core NATS | `splash-scheduler` |
| `task.created` | JetStream | `splash-api` |
| `task.updated` | JetStream | `splash-api` |
| `rainfall.recorded` | Core NATS | `splash-api` or `splash-scheduler` |
| `protocol.frame` | Core NATS | `splash-protocol` |

## NATS payload contracts

All payloads are JSON unless otherwise noted. Binary fields are represented as lowercase hex strings.

### `serial.rx.raw`

```json
{
  "serial_instance_id": "uuid",
  "stream_id": "uuid",
  "chunk_id": "uuid",
  "port": "/dev/ttyUSB0",
  "received_at": "2026-03-26T20:00:00Z",
  "bytes_hex": "ff00ffa5...",
  "byte_count": 32
}
```

Rules:

- `serial_instance_id` is the durable identity of the publishing `splash-serial`
  instance and is generated and persisted locally by that service
- `stream_id` changes when the port reconnects
- ordering is preserved only within a single `stream_id`
- chunks preserve native serial read boundaries rather than frame boundaries
- consumers must not assume one `serial.rx.raw` message equals one frame
- chunk size and timing are implementation-dependent and may vary by adapter, kernel, and runtime conditions
- raw transport messages must not require `pool_id`; the RS-485 bus does not
  provide a Splash pool identifier and pool binding belongs above the transport
  layer

### `serial.tx.raw`

```json
{
  "serial_instance_id": "uuid",
  "stream_id": "uuid",
  "command_id": "uuid",
  "written_at": "2026-03-26T20:00:01Z",
  "bytes_hex": "ff00ffa5...",
  "byte_count": 16,
  "write_result": "ok",
  "error_code": null,
  "detail": null
}
```

Allowed `write_result` values:

- `ok`
- `stale_stream`
- `timeout`
- `port_error`
- `rejected`

Rules:

- `ok` means bytes were written to the configured serial port
- `stale_stream` means the request targeted an inactive `stream_id`
- `timeout` means the write attempt exceeded `SERIAL_WRITE_TIMEOUT_MS`
- `port_error` means the adapter or port write failed
- `rejected` means the request was refused before a write attempt for a transport-level reason other than stale stream
- `error_code` should be machine-readable when `write_result` is not `ok`
- `detail` may include a short operator-facing explanation

### `serial.port.status`

```json
{
  "serial_instance_id": "uuid",
  "stream_id": "uuid",
  "status": "connected",
  "port": "/dev/ttyUSB0",
  "reported_at": "2026-03-26T20:00:00Z",
  "detail": "adapter detected"
}
```

Allowed `status` values:

- `connecting`
- `connected`
- `disconnected`
- `error`
- `write_blocked`

### `protocol.frame.raw`

```json
{
  "pool_id": "uuid",
  "stream_id": "uuid",
  "frame_id": "uuid",
  "source_chunk_ids": ["uuid"],
  "protocol_name": "pentair_easytouch",
  "captured_at": "2026-03-26T20:00:02Z",
  "bytes_hex": "ff00ffa5...",
  "framing_status": "valid"
}
```

### `protocol.frame.decoded`

```json
{
  "pool_id": "uuid",
  "stream_id": "uuid",
  "frame_id": "uuid",
  "protocol_name": "pentair_easytouch",
  "decoded_at": "2026-03-26T20:00:02Z",
  "message_type": "controller_status",
  "action_code": "0x02",
  "source_address": "0x10",
  "destination_address": "0x0f",
  "checksum_status": "valid",
  "fields": {
    "water_temp_f": 82,
    "heater_on": false
  },
  "unknown_fields": []
}
```

### `protocol.command.intent`

```json
{
  "pool_id": "uuid",
  "command_id": "uuid",
  "requested_at": "2026-03-26T20:00:03Z",
  "protocol_name": "pentair_easytouch",
  "target": {
    "equipment_id": "uuid",
    "equipment_type": "pump",
    "bus_address": "0x60"
  },
  "command_type": "set_speed",
  "arguments": {
    "rpm": 2800
  },
  "requested_by": "task_approval",
  "dry_run": false
}
```

### `protocol.command.encoded`

```json
{
  "pool_id": "uuid",
  "command_id": "uuid",
  "write_index": 1,
  "write_count": 3,
  "encoded_at": "2026-03-26T20:00:03Z",
  "protocol_name": "pentair_easytouch",
  "bytes_hex": "ff00ffa5...",
  "byte_count": 18,
  "bus_requirements": {
    "requires_idle_ms": 50
  }
}
```

### `serial.write.request`

```json
{
  "pool_id": "uuid",
  "stream_id": "uuid",
  "command_id": "uuid",
  "write_index": 1,
  "write_count": 3,
  "requested_at": "2026-03-26T20:00:03Z",
  "protocol_name": "pentair_easytouch",
  "bytes_hex": "ff00ffa5...",
  "byte_count": 18,
  "bus_requirements": {
    "requires_idle_ms": 50
  }
}
```

Rules:

- `serial.write.request` is the transport-facing outbound write contract consumed by `splash-serial`
- `splash-protocol` is the only service that should publish this subject in v1
- a normalized command may expand into multiple `protocol.command.encoded` and
  `serial.write.request` messages when the plugin requires a short write
  sequence, such as remote-enable, command write, and remote-disable
- `splash-serial` must reject the write if the provided `stream_id` does not match the currently active port session
- `bus_requirements.requires_idle_ms` is a minimum transport requirement that `splash-serial` must enforce before transmitting
- if a write is rejected or fails, `splash-serial` should publish a corresponding `serial.tx.raw` record with a non-`ok` `write_result`

## Identity ownership rules

- `splash-serial` owns the durable `serial_instance_id` carried on raw transport
  subjects
- `splash-protocol` and higher-domain services own `pool_id`
- `pool_id` remains required on protocol, normalized, and API-facing subjects
- a future `splash-core` binding workflow may map one `serial_instance_id` to a
  controller domain or pool, but that mapping is not implied by the raw RS-485
  wire format itself

### `command.result.{command_id}`

```json
{
  "pool_id": "uuid",
  "command_id": "uuid",
  "status": "completed",
  "reported_at": "2026-03-26T20:00:04Z",
  "stage": "response_observed",
  "protocol_name": "pentair_easytouch",
  "detail": "pump acknowledged speed change",
  "related_frame_ids": ["uuid"]
}
```

Allowed `status` values:

- `accepted`
- `encoded`
- `transmitted`
- `completed`
- `timed_out`
- `failed`

## Ownership rules

- `splash-serial` owns transport ordering, bus idleness, and write serialization
- `splash-protocol` owns frame buffering and reconstruction
- `splash-protocol` owns command correlation between encoded writes and observed protocol responses
- `splash-api` and `splash-scheduler` must only emit normalized command intents, never raw protocol frames
- `splash-serial` consumes `serial.write.request`, performs the actual port write, and reports the result through `serial.tx.raw`
