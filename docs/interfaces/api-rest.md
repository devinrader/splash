# REST API

[Back to README](../README.md)

## API principles

- Base URL on LAN: `http://splash-core.local:8080`
- All request and response bodies are JSON
- Timestamps are ISO 8601 UTC
- All responses use an envelope shape

```json
{
  "data": {},
  "error": null
}
```

## REST resources

| Resource | Methods | Purpose |
| --- | --- | --- |
| `/pool` | `GET`, `PUT` | Pool profile |
| `/equipment` | `GET`, `POST` | Equipment inventory |
| `/equipment/:id` | `GET`, `PUT`, `DELETE` | Equipment record |
| `/equipment/:id/control` | `POST` | Equipment control command |
| `/chemistry/latest` | `GET` | Latest chemistry reading |
| `/chemistry/history` | `GET` | Chemistry history |
| `/chemistry` | `POST` | Manual chemistry reading, optionally with `rainfall_inches` |
| `/rainfall` | `POST` | Standalone rainfall event |
| `/rainfall/history` | `GET` | Rainfall history |
| `/tasks` | `GET` | Filterable task list |
| `/tasks/:id/complete` | `POST` | Complete task |
| `/tasks/:id/dismiss` | `POST` | Dismiss task |
| `/tasks/:id/approve` | `POST` | Approve automation task |
| `/tasks/:id/snooze` | `POST` | Snooze task |
| `/schedules` | `GET`, `POST` | Maintenance schedules |
| `/schedules/:id` | `PUT`, `DELETE` | Schedule mutation |
| `/seasonal` | `GET` | Active seasonal checklist |
| `/seasonal/:id/start` | `POST` | Start checklist |
| `/seasonal/:id/steps/:step_id/complete` | `POST` | Complete checklist step |
| `/notifications` | `GET` | Notification inbox |
| `/notifications/:id/read` | `POST` | Mark read |
| `/notifications/read-all` | `POST` | Mark all read |
| `/pool/cover` | `GET`, `POST` | Current cover state and update |
| `/pool/cover/history` | `GET` | Cover event history |
| `/slam` | `GET` | SLAM sessions |
| `/slam/start` | `POST` | Start SLAM |
| `/slam/:id/criterion` | `POST` | Mark a SLAM criterion |
| `/slam/:id/complete` | `POST` | Complete SLAM |
| `/slam/:id/abandon` | `POST` | Abandon SLAM |
| `/protocol/frames` | `GET` as SSE | Live RS-485 frame stream |
| `/protocol/bundles` | `GET`, `POST` | Saved Protocol Explorer frame bundles |
| `/protocol/bundles/:id` | `GET` | One saved Protocol Explorer frame bundle |
| `/protocol/bundles/compare` | `POST` | Compare two saved Protocol Explorer frame bundles |
| `/protocol/decode` | `POST` | Decode a raw frame |
| `/protocol/annotations` | `GET`, `POST` | Protocol annotations |
| `/protocol/prompts` | `GET`, `POST` | Operator-assisted decoding prompts |
| `/protocol/remote-layout/request` | `POST` | Manual Pentair Remote Layout page request |
| `/protocol/raw-frame/send` | `POST` | Manual raw protocol frame send for Explorer diagnostics |
| `/protocol/simulate` | `POST` | Dry-run or live-send protocol command |
| `/settings` | `GET`, `PUT` | User preferences |
| `/events` | `GET` as SSE | Main frontend event stream |
| `/health` | `GET` | Service and dependency health |
| `/setup/status` | `GET` | Onboarding status |
| `/setup/complete` | `POST` | Finalize onboarding |

## Health contract

`GET /health` returns dependency-aware service state:

```json
{
  "status": "ok",
  "dependencies": {
    "postgres": "ok",
    "influxdb": "ok",
    "nats": "ok"
  },
  "uptime_seconds": 3600
}
```

`status` may be `ok`, `degraded`, or an HTTP `503` response if the service cannot operate.

## API design notes

- The onboarding wizard is frontend-driven and only persists actual domain objects plus `POST /setup/complete`
- Automation approval executes prebuilt normalized command intent rather than reconstructing protocol frames in the API
- Error and degraded-state UX should derive from SSE connection state and API responses rather than dedicated polling endpoints
- The initial implementation should expose enough latest-state and control
  surface to support a browser view of air temperature, water temperature, salt
  level, and pump RPM plus a controller-managed pump-circuit RPM control action
- the first Protocol Explorer implementation slice may expose `/protocol/frames`
  before broader protocol decode, annotation, and simulator endpoints are fully
  implemented
- the first saved-frame-bundle slice may remain in-memory and non-persistent as
  long as it captures recent `protocol.frame.raw` and `protocol.frame.decoded`
  traffic for one controlled experiment window
- the first annotation slice may also remain in-memory and API-local as long as
  annotations carry explicit confidence and target saved bundles or frame
  positions rather than pretending to be durable protocol truth
- the first operator-prompt slice may remain in-memory and API-local as long as
  prompts are explicitly tied to saved bundles and unresolved decoding work
- later Protocol Explorer API slices should support collaborative decoding by
  exposing annotation confidence, saved frame comparisons, and operator-needed
  prompts without bypassing the shared protocol engine
- the first manual Remote Layout request slice may expose one Explorer-only
  route that accepts a single page index and triggers a protocol-diagnostic
  request through `splash-protocol`
- the first manual raw-frame send slice may expose one Explorer-only route that
  accepts explicit lowercase hex bytes and forwards them through
  `splash-protocol` without rewriting checksums or other frame fields
- `/protocol/frames` may include outbound diagnostic traffic such as
  `protocol.command.encoded` and `serial.tx.raw` so Explorer can show the exact
  request bytes that were written, not only received bus frames
- browser-facing API routes should emit CORS headers compatible with the
  frontend deployment origin, including the local developer topology where the
  frontend and API run on different loopback ports

## Example payloads

### `GET /pool`

```json
{
  "data": {
    "id": "0d0d6c6e-7c38-4c0c-9e6d-d4c6c3f4d0f1",
    "name": "Backyard Pool",
    "pool_type": "inground",
    "water_type": "saltwater",
    "surface_type": "plaster",
    "volume_gallons": 18000,
    "surface_area_sqft": 420,
    "zip_code": "28052",
    "latitude": 35.2621,
    "longitude": -81.1873,
    "timezone": "America/New_York",
    "setup_complete": true
  },
  "error": null
}
```

### `POST /chemistry`

Request:

```json
{
  "ph": 7.5,
  "free_chlorine": 5.8,
  "total_alkalinity": 90,
  "calcium_hardness": 260,
  "cyanuric_acid": 70,
  "salt_level": 3100,
  "rainfall_inches": 0.25,
  "source": "manual",
  "recorded_at": "2026-03-26T19:30:00Z"
}
```

Response:

```json
{
  "data": {
    "id": "7b22a40f-f3e0-4ac6-8d6d-f3cb4b4d4f7d",
    "pool_id": "0d0d6c6e-7c38-4c0c-9e6d-d4c6c3f4d0f1",
    "ph": 7.5,
    "free_chlorine": 5.8,
    "source": "manual",
    "recorded_at": "2026-03-26T19:30:00Z"
  },
  "error": null
}
```

### `GET /settings`

```json
{
  "data": {
    "pool_id": "0d0d6c6e-7c38-4c0c-9e6d-d4c6c3f4d0f1",
    "chemistry_prompt_interval_days": 3,
    "maintenance_reminder_lead_days": 7,
    "notification_preferences": {
      "in_app": true,
      "email": false,
      "push": false
    },
    "weather_provider": "tomorrowio",
    "protocol_plugin": "pentair_easytouch",
    "protocol_config": {
      "controller_type": "easytouch",
      "controller_address": "0x10"
    },
    "sensor_provider": "manual",
    "sensor_config": {}
  },
  "error": null
}
```

### `POST /protocol/bundles`

Request:

```json
{
  "label": "pool-high-before-change"
}
```

Response:

```json
{
  "data": {
    "id": "d4d9ec0e-8295-43be-9bcf-f6c1c6cc9b5f",
    "label": "pool-high-before-change",
    "frame_count": 12,
    "created_at": "2026-03-30T19:15:00Z"
  },
  "error": null
}
```

### `GET /protocol/bundles/:id`

Response:

```json
{
  "data": {
    "id": "d4d9ec0e-8295-43be-9bcf-f6c1c6cc9b5f",
    "label": "pool-high-before-change",
    "created_at": "2026-03-30T19:15:00Z",
    "frames": [
      {
        "event": "protocol.frame.raw",
        "captured_at": "2026-03-30T19:14:58Z",
        "payload": {
          "frame_id": "frame-1",
          "bytes_hex": "ff00ffa5"
        }
      },
      {
        "event": "protocol.frame.decoded",
        "captured_at": "2026-03-30T19:14:58Z",
        "payload": {
          "frame_id": "frame-1",
          "action_code": "0x02"
        }
      }
    ]
  },
  "error": null
}
```

### `POST /protocol/bundles/compare`

Request:

```json
{
  "baseline_bundle_id": "d4d9ec0e-8295-43be-9bcf-f6c1c6cc9b5f",
  "comparison_bundle_id": "ad7c11db-e6bb-4a8b-b986-1e7bb30bc0f3"
}
```

### `POST /protocol/annotations`

Request:

```json
{
  "bundle_id": "d4d9ec0e-8295-43be-9bcf-f6c1c6cc9b5f",
  "frame_index": 0,
  "field_name": "payload_hex",
  "byte_start": 2,
  "byte_end": 3,
  "confidence": "inferred",
  "label": "likely circuit id",
  "notes": "Changes when Pool High is edited."
}
```

### `POST /protocol/prompts`

Request:

```json
{
  "bundle_id": "d4d9ec0e-8295-43be-9bcf-f6c1c6cc9b5f",
  "frame_index": 0,
  "field_name": "payload_hex",
  "prompt": "What circuit was active when this frame was captured?",
  "why": "This byte range changes with pump-circuit edits.",
  "input_type": "controller_menu_state",
  "operator_response": null
}
```

### `POST /protocol/raw-frame/send`

Request:

```json
{
  "protocol_name": "pentair_easytouch",
  "bytes_hex": "ff00ffa5011022e1010001ba"
}
```

Rules:

- Explorer-only diagnostic route
- accepts explicit lowercase hex bytes only
- does not normalize, recalculate, or rewrite protocol fields in the first
  slice
- returns transport-acceptance only; protocol-level meaning is determined later
  from observed receive-side traffic

Response:

```json
{
  "data": {
    "id": "4d889762-e77b-46b5-b9e7-f261f61a2110",
    "bundle_id": "d4d9ec0e-8295-43be-9bcf-f6c1c6cc9b5f",
    "frame_index": 0,
    "field_name": "payload_hex",
    "prompt": "What circuit was active when this frame was captured?",
    "why": "This byte range changes with pump-circuit edits.",
    "input_type": "controller_menu_state",
    "operator_response": null,
    "status": "open",
    "created_at": "2026-03-30T20:20:00Z",
    "resolved_at": null
  },
  "error": null
}
```

Response:

```json
{
  "data": {
    "id": "bc1ecfe3-80be-4875-a56b-4da0f246b15f",
    "bundle_id": "d4d9ec0e-8295-43be-9bcf-f6c1c6cc9b5f",
    "frame_index": 0,
    "field_name": "payload_hex",
    "byte_start": 2,
    "byte_end": 3,
    "confidence": "inferred",
    "label": "likely circuit id",
    "notes": "Changes when Pool High is edited.",
    "created_at": "2026-03-30T20:05:00Z"
  },
  "error": null
}
```

Response:

```json
{
  "data": {
    "baseline_bundle_id": "d4d9ec0e-8295-43be-9bcf-f6c1c6cc9b5f",
    "comparison_bundle_id": "ad7c11db-e6bb-4a8b-b986-1e7bb30bc0f3",
    "frame_pairs": [
      {
        "index": 0,
        "baseline_event": "protocol.frame.raw",
        "comparison_event": "protocol.frame.raw",
        "changed_fields": [
          {
            "field": "bytes_hex",
            "byte_changes": [
              {
                "byte_index": 9,
                "baseline": "01",
                "comparison": "02"
              }
            ]
          }
        ]
      }
    ]
  },
  "error": null
}
```
