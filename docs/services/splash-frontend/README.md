# Splash Frontend Service

[Back to Services Index](../README.md)

## Purpose

`splash-frontend` is the browser-facing React application on `splash-core`.

For the initial implementation milestone, it is responsible for the minimum
browser slice required by [Product Overview](../../product/overview.md) and
[Product Requirements](../../product/requirements.md):

- display current air temperature
- display current water temperature
- display current salt level
- display current pump RPM
- allow the operator to change pump RPM

## Runtime role

`splash-frontend` is a read and control client of `splash-api`.

It should:

- fetch the latest equipment snapshot from `GET /equipment`
- open `GET /events` for live updates
- render the milestone-1 latest-state surface
- submit pump-speed commands through `POST /equipment/:id/control`
- surface command pending, completion, and failure state to the operator
- expose a narrow developer-facing Protocol Explorer view that consumes the
  shared `splash-api` protocol endpoints without bypassing the documented API
- allow developer-oriented diagnostic actions such as manual Remote Layout and
  raw frame sends through the documented Protocol Explorer API routes

It should not:

- talk to NATS directly
- decode protocol frames
- own command correlation
- implement equipment scheduling in the milestone-1 slice

## Initial slice assumptions

- the initial slice may be a single-page app rather than the full long-term
  navigation tree
- the UI should still preserve the long-term visual direction described in the
  product docs: calm, clear, trustworthy, and responsive
- the initial slice may rely on the milestone-1 `splash-api` equipment bridge
  rather than the future repository-backed equipment inventory
- the first frontend Protocol Explorer slice may be a developer-oriented
  secondary panel rather than the full long-term standalone screen

## Primary references

- [Architecture](../../architecture/architecture.md)
- [REST API Contract](../../interfaces/api-rest.md)
- [SSE Event Contract](../../interfaces/api-events.md)
- [Product Overview](../../product/overview.md)
- [Product Requirements](../../product/requirements.md)
