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
| `/protocol/decode` | `POST` | Decode a raw frame |
| `/protocol/annotations` | `GET`, `POST` | Protocol annotations |
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
