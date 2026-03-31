# Splash Frontend Testing

[Back to Splash Frontend README](./README.md)

## Testing goals

For the initial milestone, `splash-frontend` should have enough automated
coverage to validate the browser read and control slice without a live backend.

## Required automated coverage

- render latest-state values from a mocked `GET /equipment` response
- update the UI from mocked SSE `equipment.state`, `pump.state`, and
  `command.result` events
- submit pump-speed control through `POST /equipment/:id/control`
- disable repeat submission while a command is pending
- surface API or command failures in the UI
- render a narrow Protocol Explorer panel from mocked protocol frame and bundle
  APIs
- show outbound Explorer diagnostic events such as `protocol.command.encoded`
  and `serial.tx.raw` when present
- create bundle comparison, annotation, and prompt requests through the
  documented API endpoints
- keep the live frame list inside a bounded panel rather than letting new frame
  traffic continually grow page height

## Preferred tooling

- Vitest for unit and component tests
- React Testing Library for UI behavior
- lightweight fetch and `EventSource` mocks rather than a full browser backend

## Milestone-1 test boundaries

- no real NATS dependency
- no real browser automation requirement yet
- no real protocol or serial hardware dependency

## Follow-up work

- broader route coverage after the full navigation model is implemented
- end-to-end browser tests after containerized frontend delivery exists
