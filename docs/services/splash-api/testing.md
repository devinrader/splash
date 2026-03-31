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
- saved frame-bundle capture from recent protocol and transport traffic
- retrieval of saved frame bundles through REST
- comparison of two saved bundles with byte-change reporting for hex fields
- confidence-aware annotation creation and retrieval for saved bundles
- operator-prompt creation and retrieval for saved bundles

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
- bundle capture that preserves both `protocol.frame.raw` and
  `protocol.frame.decoded` events from the recent buffer
- bundle capture and Explorer SSE fanout that may also preserve
  `protocol.command.encoded` and `serial.tx.raw` for diagnostic request flows
- bundle comparison that highlights changed byte offsets for `bytes_hex` or
  `payload_hex`
- annotation validation for required bundle target, field name, byte range, and
  confidence value
- prompt validation for required bundle target, prompt text, rationale, and
  expected input type
