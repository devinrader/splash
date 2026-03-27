# Requirements

[Back to README](../README.md)

## Functional requirements

| Area | v1 requirements |
| --- | --- |
| Water chemistry | Log manual or sensor readings, trend chemistry over time, support chlorine and saltwater pools, prompt users to test water, record rainfall as chart context |
| Equipment management | Track equipment inventory, runtime, faults, and maintenance reminders; support equipment control through RS-485 where available |
| Seasonal workflows | Provide guided opening and closing checklists customized by pool type, region, and equipment |
| Predictive automation | Generate suggested pump and heater actions based on weather and pool state; require user approval before execution |
| Pool cover tracking | Record cover on/off events with cover type and use them to interpret chemistry and UV behavior |
| SLAM workflow | Guide the user through SLAM initiation, FC target calculation, periodic logging, OCLT, and completion criteria |
| Protocol Explorer | Provide live frame monitoring, decode tools, simulation, frame diffing, and annotation for RS-485 reverse engineering |
| Onboarding | Gate the app behind a setup wizard until pool profile and baseline setup are complete |
| Notifications | Persist and display maintenance, chemistry, seasonal, automation, and equipment-fault notifications |
| MagicMirror | Expose a read-only integration surface over REST and SSE for a future `MMM-Splash` module |

## Functional detail

### Chemistry

- Track pH, free chlorine, total alkalinity, calcium hardness, cyanuric acid, salt, and rainfall
- Allow partial chemistry entries
- Warn when both pH and free chlorine are omitted from a manual reading
- Show ideal ranges, alerts, SLAM shading, cover events, and rainfall markers on trend charts
- Use CYA-adjusted free chlorine minimums instead of relying on a single FC target

### Equipment

- Support inventory records for pump, filter, heater, lights, cleaner, and chlorinator
- Show live equipment state through SSE
- Expose command controls with loading state until `command.result`
- Log maintenance history and surface upcoming service dates
- Resolve each controllable equipment instance to zero or one capability profile in v1
- Validate UI controls and normalized commands against effective per-equipment capabilities rather than equipment type alone
- Ship an initial capability-profile catalog that includes generic fallbacks and Pentair-family v1 profiles for controller circuits, pumps, heaters, and chlorinators

### Automation

- Evaluate weather-driven rules after each weather update
- Publish automation suggestions to NATS
- Require approve or dismiss actions from the user
- Prevent duplicate suggestions with minimum re-suggestion intervals
- Include an explainable reason string with each suggestion

### Seasonal and SLAM

- Store checklist definitions, checklist steps, and checklist completion history
- Track active SLAM sessions with all three completion criteria
- Suppress normal FC alerts during an active SLAM
- Increase chemistry-prompt cadence while SLAM is active

### Diagnostics and advanced tooling

- Stream raw RS-485 frames
- Decode known frames and annotate unknown fields
- Support dry-run command simulation by default
- Require explicit confirmation for any live command transmission
- Centralize protocol decode and encode in a dedicated protocol service rather than spreading packet logic across API and scheduler
- Load protocol implementations through configuration-driven plugins
- Reuse the same protocol decode and encode engine for Protocol Explorer and production command handling
- Define explicit raw-transport, protocol-frame, and normalized-command contracts between services
- Ensure command lifecycle tracking distinguishes encode, transmit, and protocol-level completion states
- Maintain authoritative reference documentation for all known pool-equipment communication protocols, including supported, partial, and planned integrations
- Support profile-based capability mapping so protocol plugins can expose richer vendor-specific capabilities without collapsing to a lowest common denominator
- Preserve native serial read boundaries in the raw transport contract rather than introducing frame-aware buffering in `splash-serial`
- Define an explicit transport-facing outbound write contract from `splash-protocol` to `splash-serial`

## Non-functional requirements

### Reliability

- Recover automatically from temporary RS-485 disconnects
- Recover automatically from NATS disconnects
- Degrade gracefully when weather data, InfluxDB, or SSE becomes stale
- Keep the app usable for read and manual-entry workflows during partial outages
- Reject stale transport write requests after serial reconnect rather than risking writes on a replaced port session

### Performance and platform constraints

- Run on Raspberry Pi hardware
- Keep `splash-serial` lightweight enough for a Pi Zero 2W
- Use Docker Compose on `splash-core`
- Use a native Go binary with `systemd` on `splash-zero`
- Keep `splash-serial` observability lightweight through a minimal local HTTP health and metrics surface

### Maintainability

- Use a polyglot monorepo that supports TypeScript/Node.js services alongside Go for `splash-serial`
- Keep protocols behind a pluggable `ProtocolDecoder`
- Keep weather behind a pluggable `WeatherProvider`
- Keep future chemistry sensors behind a pluggable `SensorProvider`
- Favor stable event contracts and repository patterns over tight coupling
- Prefer TypeScript for JSON-heavy application services and Go only where constrained-hardware transport needs justify it
- Keep raw transport concerns, protocol concerns, and product-workflow concerns separated by contract

### Security and safety

- Treat live RS-485 command transmission as a sensitive action
- Keep LAN-only operation in v1
- Use Cloudflare Access for v2 remote access rather than building application auth first
- Store secrets in Ansible Vault

### Language and runtime fit

- `splash-serial` must remain lightweight enough for Pi Zero 2W deployment and is expected to use Go
- `splash-api`, `splash-scheduler`, and `splash-protocol` should favor TypeScript/Node.js for faster development, shared types, and better alignment with frontend and Protocol Explorer work

## Dependencies

- PostgreSQL
- InfluxDB
- NATS with JetStream
- USB-to-RS-485 adapter
- Weather provider API key
- Docker and Docker Compose on `splash-core`
- Ansible for provisioning and disaster recovery

## Risks

- RS-485 protocol variability across vendors and controller generations
- CYA-adjusted chemistry rules being misunderstood if surfaced without context
- SSE stability through remote-access layers such as Cloudflare Tunnel
- Embedded-device storage and log growth on Raspberry Pi deployments
- Future multi-pool support not yet implemented despite `pool_id`-ready schemas
- mDNS reliability varying by router and LAN environment
- Chemistry-sensor compatibility and ingestion reliability
- InfluxDB sustained-write performance on Raspberry Pi hardware

## Constraints

- v1 is single-pool despite multi-pool-friendly schema design
- No application-layer authentication in v1 LAN mode
- Light mode only in v1
- Full dosing math is deferred to v2
- Hayward and Jandy support are planned but not fully implemented
