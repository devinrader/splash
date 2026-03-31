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
6. expose a narrow Protocol Explorer panel that:
   - streams `GET /protocol/frames`
   - creates saved bundles
   - compares saved bundles
   - reads and creates annotations and prompts
   - submits manual Remote Layout page requests
   - submits manual raw frame sends
   - shows outbound diagnostic request events such as `protocol.command.encoded`
     and `serial.tx.raw` when present

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

Protocol Explorer flow:

1. browser opens `GET /protocol/frames`
2. frontend shows recent raw, decoded, and outbound diagnostic protocol events
3. operator saves one or more frame bundles through `POST /protocol/bundles`
4. frontend compares saved bundles through `POST /protocol/bundles/compare`
5. frontend reads or creates annotations and prompts through
   `/protocol/annotations` and `/protocol/prompts`
6. frontend may send manual Remote Layout or raw frame diagnostic requests

Cross-origin local development rule:

- when `splash-frontend` is served from a local Vite dev origin such as
  `http://127.0.0.1:3000` and `splash-api` is served from
  `http://127.0.0.1:8080`, the API must emit CORS headers so the browser can
  use both REST and SSE successfully

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

## Explorer UX rules

- the first frontend Protocol Explorer slice may be secondary to the milestone
  dashboard rather than a top-level navigation destination
- the Explorer should distinguish:
  - live protocol events
  - saved bundles
  - bundle diffs
  - annotations
  - operator-needed prompts
- the live frame list should stay inside a bounded scroll region so ongoing
  frame traffic does not continuously increase overall page height
- manual Remote Layout and raw-frame send actions should remain clearly labeled
  as diagnostic-only
- raw-frame send should preserve the operator-provided lowercase hex exactly and
  should not imply protocol-level success when the transport write succeeds
- the first slice may stay intentionally developer-oriented and does not need
  the full long-term product navigation treatment yet
