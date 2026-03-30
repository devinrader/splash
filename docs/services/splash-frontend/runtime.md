# Splash Frontend Runtime

[Back to Splash Frontend README](./README.md)

## Runtime model

`splash-frontend` runs on `splash-core` as a browser-delivered web app built
with React, TypeScript, and Vite.

The initial milestone runtime is intentionally narrow:

1. fetch the current latest-state snapshot from `splash-api`
2. render the current controller, pump, and chlorinator readouts needed for the
   first milestone
3. open SSE for live updates
4. submit pump-speed control requests through the REST API
5. reflect command lifecycle state in the browser

## Data flow

1. browser loads `splash-frontend`
2. frontend calls `GET /equipment`
3. frontend hydrates local state from the REST response
4. frontend opens `EventSource` to `GET /events`
5. frontend merges incoming `equipment.state`, `pump.state`, and
   `command.result` events into client state
6. operator submits a pump-speed change
7. frontend sends `POST /equipment/:id/control`
8. frontend shows pending state until `command.result` resolves the action

## Event handling rules

- initial state comes from REST, not SSE replay
- SSE is authoritative for live in-session updates
- on SSE disconnect or reconnect, the frontend should refetch `GET /equipment`
  to resynchronize with the latest server state
- `ready` SSE events are connection-level only and do not update equipment UI

## UI expectations

- render a responsive milestone-1 dashboard for desktop and mobile
- show the latest known air temperature, water temperature, salt level, and
  pump RPM
- show when latest values are unavailable rather than inventing defaults
- disable pump-speed submission while a prior control request is unresolved
- show degraded API state when `/health` reports degraded or when SSE is not
  connected

## Command UX rules

- the pump-speed control should target the API-facing pump id exposed by
  `GET /equipment`
- the operator enters RPM as an integer
- the UI should preserve the last requested RPM while the command is pending
- `command.result` should clear pending state and show success or failure
- if no matching completion arrives before the API reports timeout or failure,
  the UI should show the latest command state without guessing success
