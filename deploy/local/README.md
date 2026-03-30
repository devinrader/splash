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

Start the local NATS broker:

```bash
docker compose -f deploy/local/docker-compose.milestone1.yml up -d
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

## Host serial note

The host-side `splash-serial` instance must still point to a reachable NATS
broker. For local milestone bring-up, that means updating the host
`NATS_URL` to the developer machine address rather than `splash-core.local`.
