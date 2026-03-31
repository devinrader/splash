# Open Questions

[Back to README](../README.md)

## Protocol and hardware

- QUESTION: What are the unresolved byte mappings in the Pentair `0x02` controller status message, especially heater-setpoint-related bytes called out by the source?
- QUESTION: Does Pentair `0x02` use a three-byte circuit-status layout where payload bytes `2`, `3`, and `4` represent circuits `1-8`, `9-16`, and `17+` respectively, and if so what are the exact bit-to-circuit assignments on the target EasyTouch controller?
- QUESTION: On EasyTouch specifically, does live circuit state stop at payload byte `3`, with payload bytes `4+` usually unused for live circuit status, and what controlled controller experiments are needed to verify byte `3` assignments?
- QUESTION: Is zero-based payload byte `9` in Pentair `0x02` the controller mode field on EasyTouch, and what are the exact observed values for idle, pool, spa, and active feature-circuit states?
- QUESTION: For the EasyTouch `0x02` mode byte at zero-based payload index `9`, are the current working flags complete: `0x01` run mode, `0x04` temp unit, `0x08` freeze protection, and `0x10` timeout?
- QUESTION: For the EasyTouch `0x02` mode byte at zero-based payload index `9`, are the updated working flags correct: `0x01` service mode, `0x04` Celsius mode, `0x08` freeze protection active, and `0x80` timeout mode?
- QUESTION: Is zero-based payload byte `10` in Pentair `0x02` the heater on or off status field on EasyTouch, and beyond the current working values `0x03` off and `0x0f` on, are there any additional heater-state values for heating, cooldown, or fault conditions?
- QUESTION: Is zero-based payload byte `10` in Pentair `0x02` actually a broader valve or body-routing state field with observed values such as `0x03` pool, `0x0f` spa, `0x30` heater-related, and `0x33` solar-related?
- QUESTION: Is zero-based payload byte `12` in Pentair `0x02` a delayed or protected-state bitfield, and what exact conditions correspond to values such as `0x40` and higher?
- QUESTION: Are zero-based payload bytes `14` and `15` pool and spa water temperature on EasyTouch, and if so how does that interact with separate notes claiming payload byte `15` can represent heater active state?
- QUESTION: Are zero-based payload bytes `16` and `17` EasyTouch firmware major and minor version indicators?
- QUESTION: Are zero-based payload bytes `18` and `19` air temperature and solar temperature in Fahrenheit?
- QUESTION: Is zero-based payload byte `22` the EasyTouch pool and spa heat-setting field with low two bits for pool and next two bits for spa?
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
