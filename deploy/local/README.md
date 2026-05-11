# Local Milestone 1 Bring-Up

This directory documents the preferred local development topology for the
milestone-1 Splash slice.

## Topology

- `splash-frontend` runs on the developer machine
- `splash-api` runs on the developer machine
- `splash-protocol` runs on the developer machine
- NATS runs locally on the developer machine
- `splash-serial` remains on the hardware host because it needs the live FTDI
  or RS-485 TTY device

## Why this split exists

The milestone-1 browser slice is easiest to iterate locally, but serial
hardware access is still host-bound. The supported development pattern is:

1. run NATS locally on the developer machine
2. point the host `splash-serial` instance at the developer machine `NATS_URL`
3. run `splash-protocol`, `splash-api`, and `splash-frontend` locally

## Local NATS

Start the local NATS broker directly:

```bash
nats-server -a 127.0.0.1 -p 4222 -m 8222
```

This exposes:

- `4222` for NATS client traffic
- `8222` for NATS monitoring

## Example service configuration

Example env files are provided for:

- `splash-protocol`
- `splash-api`
- `splash-frontend`

Copy the relevant example values into your local shell or `.env` tooling before
running the services.

## Local service commands

```bash
cd services/splash-protocol && npm install && npm run dev
cd services/splash-api && npm install && npm run dev
cd services/splash-frontend && npm install && npm run dev
```

## Local helper script

To start documented local NATS plus `splash-protocol`, `splash-api`, and
`splash-frontend` in one step:

```bash
deploy/local/start-splash-api-local.sh
```

Notes:

- the script loads `deploy/local/splash-api.env.example` by default
- the script loads `deploy/local/splash-protocol.env.example` by default
- the script loads `deploy/local/splash-frontend.env.example` by default
- the frontend bind defaults to `127.0.0.1:3000` unless `FRONTEND_HTTP_BIND`
  is set in the frontend env file or shell
- the script starts a native `nats-server` process instead of Docker
- set `SPLASH_API_ENV_FILE=/path/to/custom.env` to use different API settings
- set `SPLASH_PROTOCOL_ENV_FILE=/path/to/custom.env` to use different protocol settings
- set `SPLASH_FRONTEND_ENV_FILE=/path/to/custom.env` to use different frontend settings
- set `NATS_SERVER_BIN=/path/to/nats-server` to override the NATS binary path
- `nats-server` binds to `0.0.0.0` by default so the remote `splash-serial`
  host can publish into the local broker
- set `NATS_BIND_HOST=127.0.0.1` if you want to restrict NATS to local-only use
- if the configured API port is already in use, the script stops with a clear
  error rather than starting on an unexpected port
- if the configured frontend port is already in use, the script stops with a
  clear error rather than starting on an unexpected port
- the host `splash-serial` instance still must point at this machine's
  `NATS_URL` or no protocol frames will reach the local API
- the script keeps `splash-frontend` and `splash-protocol` in the background and
  then runs `splash-api` in the foreground

## Prometheus and Grafana

The first local observability slice is RS485-first:

- `splash-serial` exports transport counters and connection-state metrics on
  `/metrics`
- `splash-protocol` exports protocol-service metrics on `/metrics`
- `splash-api` exports browser-facing RS485 rate summaries and aggregated
  platform-service status on `/metrics`

An example Prometheus scrape file is provided at:

```bash
deploy/local/prometheus.rs485.yml
```

Default targets in that file assume:

- `splash-api` on `127.0.0.1:8080`
- `splash-protocol` on `127.0.0.1:9109`
- `splash-serial` on `splash-zero.local:9108`

Adjust the `splash-serial` target if your hardware host uses a different
address.

Recommended first Grafana views:

- RS485 receive messages per second
- RS485 transmit messages per second
- serial connection-state gauge
- reconnect count
- aggregated service status for `splash-serial`, `splash-protocol`, and NATS

## Local coverage commands

Use the service-local coverage scripts to generate reports without changing the
existing test runners:

```bash
cd services/splash-api && npm run coverage
cd services/splash-protocol && npm run coverage
cd services/splash-frontend && npm run coverage
```

Notes:

- `splash-api` and `splash-protocol` use `c8` on top of Node's built-in test
  runner
- `splash-frontend` uses Vitest V8 coverage
- backend reports include terminal summary output plus `lcov` artifacts under
  each service's coverage directory

## Host serial note

The host-side `splash-serial` instance must still point to a reachable NATS
broker. For local milestone bring-up, that means updating the host
`NATS_URL` to the developer machine address rather than `splash-core.local`.
