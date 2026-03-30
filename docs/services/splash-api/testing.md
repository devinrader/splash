# Testing

[Back to Splash API Service](./README.md)

## Initial test expectations

For the first browser milestone, `splash-api` should have automated coverage
for:

- latest-state projection from normalized NATS events
- REST exposure of latest air temperature, water temperature, salt level, and
  pump RPM
- SSE fanout of equipment state and command-result updates
- pump-speed control validation and `protocol.command.intent` publication
- degraded behavior when NATS is unavailable

## Slice-specific cases

The first slice should explicitly test:

- command creation for `POST /equipment/:id/control`
- rejection of unsupported equipment ids
- rejection of unsupported command types
- equipment-state projection updates from:
  - `equipment.state.controller`
  - `equipment.state.pump`
  - `equipment.state.chlorinator`
- command-result relay to SSE clients
