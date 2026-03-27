# API Design

[Back to README](../README.md)

## Purpose

This document is the entry point for Splash interface contracts.

The platform now separates interface definitions by contract type so they can evolve independently without overloading a single file.

## Contract map

- [api-rest.md](./api-rest.md)
  REST resources, envelope rules, request and response examples, and health/setup endpoints.

- [api-events.md](./api-events.md)
  SSE event contracts, frontend event consumption rules, and reconnect behavior.

- [messaging-nats.md](./messaging-nats.md)
  NATS subject catalog, JetStream/Core NATS delivery rules, transport/protocol message contracts, and command lifecycle messaging.

- [normalized-contracts.md](./normalized-contracts.md)
  Normalized equipment events, normalized command vocabulary, and the contract boundary above protocol decoding.

## Design rules

- REST is for request/response interactions and initial state fetches
- SSE is for browser-facing live updates
- NATS is for internal service messaging
- normalized contracts are the primary application-level interface above the protocol layer

## Cross-document rules

- `splash-api` and `splash-scheduler` should depend on normalized contracts, not raw protocol packets
- Protocol Explorer may consume both protocol-level and normalized contracts because diagnostics are part of its purpose
- Changes to contract shape should be reflected in the appropriate focused document, not duplicated across multiple docs
