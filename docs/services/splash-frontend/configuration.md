# Splash Frontend Configuration

[Back to Splash Frontend README](./README.md)

## Required configuration

The milestone-1 frontend should keep configuration minimal.

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL for `splash-api` requests and SSE |

## Configuration rules

- `VITE_API_BASE_URL` may be empty in deployments where the frontend is served
  behind the same origin as `splash-api`
- the frontend should build URLs for:
  - `GET /equipment`
  - `GET /health`
  - `GET /events`
  - `POST /equipment/:id/control`
- milestone-1 does not require separate feature flags or authentication config

## Validation expectations

- invalid or missing API base configuration should fail clearly in the browser
  rather than producing silent fetch errors
- the frontend should normalize trailing slashes so REST and SSE paths remain
  stable
