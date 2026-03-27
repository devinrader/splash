# Assumptions

[Back to README](../README.md)

## Domain assumptions

- ASSUMPTION: The baseline operational pool is an inground plaster or gunite saltwater pool with an SWG.
- ASSUMPTION: Typical active-season water temperature is 78-88 F.
- ASSUMPTION: The pump circulates 8-12 hours per day under normal conditions.
- ASSUMPTION: There is no active algae event, major contamination, or recent large dilution event when baseline recommendations are applied.
- ASSUMPTION: For saltwater pools, typical chemistry targets are pH 7.4-7.6, TA 80-100 ppm, CH 200-350 ppm, CYA 60-80 ppm, and salt 3000-3200 ppm.

## Product assumptions

- ASSUMPTION: Splash serves a single homeowner-managed pool in v1.
- ASSUMPTION: Pool owners are willing to enter chemistry data manually if sensors are not available.
- ASSUMPTION: Users can tolerate suggest-and-approve automation as a trust-building phase before autonomy.
- ASSUMPTION: A responsive web app is sufficient as the primary user interface in v1.

## Technical assumptions

- ASSUMPTION: `splash-core` has enough resources to run PostgreSQL, InfluxDB, NATS, Prometheus, API, scheduler, and frontend together.
- ASSUMPTION: `splash-zero` should avoid Docker due to memory overhead.
- ASSUMPTION: mDNS hostnames such as `splash-core.local` and `splash-zero.local` are available on the LAN.
- ASSUMPTION: Accurate time synchronization is available through `systemd-timesyncd`.
- ASSUMPTION: The Pentair protocol is the initial production protocol and is the default decoder.
- ASSUMPTION: `splash-core` can comfortably host Node.js-based application services in containers.
- ASSUMPTION: The strongest runtime constraint applies to `splash-serial`, not to the rest of the backend.

## Constraints

- v1 is LAN-only and unauthenticated at the application layer
- light mode only
- no dosing calculator in v1
- Hayward and Jandy support are not production-ready
- SSE is the primary live update path and must remain stable for the UI to feel current

## Dependencies

- Weather API access
- RS-485 adapter availability
- PostgreSQL health
- InfluxDB health
- NATS connectivity between `splash-zero` and `splash-core`
- Ansible-managed host provisioning

## Known limitations

- Manual chemistry logging remains the default mode
- Wireframes are referenced but not provided in the source document
- Some appendices are referenced for full payloads and DDL, but the Word file primarily exposes summary-level content in the main body
- Polyglot service packaging introduces multiple toolchains and runtime images to maintain
- TODO: Confirm whether the repository already contains fuller appendix material that should be imported into this canonical set
