# Open Questions

[Back to README](../README.md)

## Protocol and hardware

- QUESTION: What are the unresolved byte mappings in the Pentair `0x02` controller status message, especially heater-setpoint-related bytes called out by the source?
- QUESTION: Should controller type be auto-detected from bus framing, or remain an explicit configuration choice in v1?
- QUESTION: What is the exact production path and timeline for Hayward support?
- QUESTION: What is the exact production path and timeline for Jandy support?

## API and schema completeness

- QUESTION: Where are the appendix-level request and response schemas that the source references for API details?
- QUESTION: What are the exact DDL definitions for `pool_circuits` and `pool_settings` if those tables are part of the intended canonical schema?
- TODO: Add exact payload examples for REST, SSE, and NATS once the appendix material or implementation source is reviewed.

## Product behavior

- QUESTION: Should setup-step progress ever be server-side, or is frontend-only wizard state an intentional long-term design choice?
- QUESTION: Should automation suggestions remain task-backed forever, or eventually become a separate first-class suggestion model?
- QUESTION: What is the exact rule for when a chemistry prompt becomes high priority versus informational?

## UX and design

- TODO: Replace the wireframe placeholder with actual low-fidelity screen artifacts.
- QUESTION: Should the mobile navigation be a bottom tab bar for all primary routes, or a collapsed menu plus a reduced quick-action set?
- QUESTION: Is the selected typography stack final, given the source mentions `Inter or system-ui` rather than a single mandated stack?

## Operations and security

- QUESTION: Is LAN-only unauthenticated access acceptable beyond v1 for households with guest devices on the same network?
- QUESTION: Should Cloudflare Tunnel be the only supported remote-access pattern, or should VPN/Tailscale-style alternatives be documented?
- QUESTION: How should off-device backups be automated in a future version?
- QUESTION: What exact InfluxDB retention-policy setup commands should provisioning apply so the documented data lifecycle is enforceable?
- QUESTION: What is the preferred v2 Web Push architecture: direct browser push via the Cloudflare endpoint or a third-party relay service?

## Data and analytics

- QUESTION: When dosing math is introduced, what formulas and validation strategy will be used for each chemical type?
- QUESTION: What calibration process will be used to move automation rule thresholds from seed values to installation-specific values?
- QUESTION: How much historical data is required before predictive automation moves beyond rule-based suggestions?

## Build spikes explicitly called out by the source

- TODO: Validate the chosen Go serial library on Raspberry Pi Zero 2W with the real USB adapter and EasyTouch controller.
- TODO: Validate InfluxDB 2.7 write and query performance on Raspberry Pi 4 under continuous telemetry load.
- TODO: Validate `cloudflared` on Pi 4/5 and confirm SSE stability through Cloudflare proxying.
- TODO: Validate end-to-end Web Push VAPID flow for future browser notifications.
- TODO: Validate that `splash-core.local` and `splash-zero.local` resolve reliably from all participating devices.
