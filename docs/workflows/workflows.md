# Workflows

[Back to README](../README.md)

## Onboarding

The application gates normal navigation until `setup_complete = false` is resolved through the setup wizard.

![Onboarding flow](./images/onboarding-flow.png)

Caption: First-run onboarding sequence for creating the pool profile, optional equipment inventory, RS-485 connectivity, and default schedules.

### Steps

1. Welcome
2. Pool profile
3. Equipment inventory
4. Connect to pool
5. Completion summary

### Outputs

- pool profile created
- optional equipment records created
- default maintenance schedules seeded
- initial weather fetch triggered
- setup marked complete

## Initial implementation workflow

The first implementation target is a minimal end-to-end operational slice that
proves Splash can read live equipment state, present it in the browser, and
perform one real equipment write safely.

### Read path

1. `splash-serial` reads live Pentair RS-485 traffic
2. `splash-protocol` assembles frames and decodes trusted Pentair fields
3. `splash-protocol` emits normalized state for:
   - controller air temperature
   - controller water temperature
   - chlorinator salt level
   - pump RPM
4. API persistence or latest-state projection records those values
5. the browser shows the current values on the initial dashboard or equipment
   view

### Write path

1. the user changes pump speed from the browser
2. the API validates the normalized `set_speed` command against the target pump
3. `splash-api` publishes `protocol.command.intent`
4. `splash-protocol` encodes the direct Pentair pump command and publishes
   `serial.write.request`
5. `splash-serial` writes the bytes to the bus and reports `serial.tx.raw`
6. `splash-protocol` correlates the write and resulting pump-status frames
7. the browser shows pending, transmitted, and completed or failed command
   state

### Initial implementation success criteria

- the browser shows current air temperature
- the browser shows current water temperature
- the browser shows current salt level
- the browser shows current pump RPM
- the browser can change pump RPM through the documented command flow
- the system logs or persists enough state to verify the read path and the
  resulting control action

## Routine chemistry maintenance

### Daily

- Test free chlorine
- Visually inspect the water
- Empty skimmer and pump baskets as needed

### Two to three times per week

- Test pH
- Retest FC after heavy use, high UV, or rain
- Brush pool walls and floor
- Skim debris

### Weekly

- Run a full chemistry test
- Check combined chlorine
- Inspect or clean filter
- Inspect the salt cell

### Monthly or as needed

- Adjust total alkalinity
- Adjust calcium hardness
- Check CYA
- Clean and inspect the salt cell

## Seasonal workflows

### Opening

1. Remove and store the cover
2. Reconnect equipment and fittings
3. Fill to operating level
4. Prime and start the pump
5. Test full chemistry
6. Correct chemistry in sequence
7. SLAM if needed
8. Re-enable automation and verify RS-485 connectivity

### Closing

1. Balance chemistry first
2. Raise FC appropriately before closing
3. Add winterizing chemistry as appropriate
4. Lower water and protect lines if freeze risk exists
5. Drain vulnerable equipment
6. Install cover
7. Optionally disconnect RS-485 hardware for winter shutdown

## SLAM workflow

![SLAM workflow](./images/slam-workflow.png)

Caption: Guided SLAM workflow for raising FC to SLAM level, maintaining it, and confirming the three completion criteria.

### Flow

1. Start SLAM session
2. Calculate FC target from current CYA
3. Raise FC to SLAM level
4. Test and log FC every 2-4 hours
5. Run OCLT
6. Confirm all three pass criteria
7. Complete or abandon session

### Completion criteria

- combined chlorine at or below 0.5 ppm
- water visually clear
- overnight FC loss below 1.0 ppm

## Automation approval workflow

1. Scheduler receives fresh weather data
2. Rules are evaluated against pool, equipment, and weather state
3. Matching rules publish `automation.suggestion.*`
4. API persists a task and notification context
5. User sees a suggestion in Equipment and Tasks
6. User approves or dismisses
7. Approved tasks publish normalized protocol command intent
8. `splash-protocol` encodes the command into raw bytes
9. `splash-serial` transmits the raw bytes to the bus
10. `splash-protocol` correlates the resulting protocol activity and emits `command.result`

### Command lifecycle details

- `splash-api` creates the `command_id`
- the command remains pending until `command.result.{command_id}` reaches a terminal state
- transport success alone does not complete the command
- dry-run commands stop at the encode stage and return a synthetic successful result without bus transmission
- automation suggestions and approval cards should be expressed in normalized command vocabulary, not protocol-specific terminology
- automation suggestions must only target equipment whose effective capabilities support the proposed normalized command

## Protocol Explorer workflow

### Live monitor

- consume decoded protocol frames from `splash-protocol`
- show decoded and raw fields
- filter, pause, and export
- optionally surface transport chunk boundaries for advanced debugging, but frame-level data remains the primary view

### Decoder

- paste hex frame
- validate framing and checksum through `splash-protocol`
- show known fields or unknown-byte positions
- save annotations
- use the same configured protocol plugin as live decoding for the selected pool

### Simulator

- select known command or custom frame
- ask `splash-protocol` to build bytes
- default to dry run
- require explicit confirmation for live send
- surface the normalized command intent, encoded bytes, and final command result stages

### Frame diff

- capture baseline snapshot
- make one controlled controller change
- capture second snapshot
- compare changed bytes using the shared protocol parser
- annotate newly discovered fields
- store diff annotations through the same `protocol_annotations` path used elsewhere

## Protocol stream workflow

1. `splash-serial` establishes a port session and emits `serial.port.status`
2. `splash-serial` emits `serial.rx.raw` for incoming bytes
3. `splash-protocol` assembles frames per `stream_id`
4. `splash-protocol` publishes `protocol.frame.raw` and `protocol.frame.decoded`
5. `splash-protocol` emits normalized subjects such as `equipment.state.*`
6. downstream services and the frontend consume normalized state rather than raw transport chunks

## Normalized control workflow

1. The user interacts with Equipment, Tasks, or Protocol Explorer
2. The API resolves the target equipment's effective capability profile and effective capabilities
3. The API validates the normalized command intent such as `set_speed` or `set_circuit_state` against that effective capability set
4. `splash-protocol` resolves the command against the active plugin and resolved profile
5. The command is encoded and sent through `splash-serial`
6. Result state is surfaced back to the UI through `command.result`

### Capability-aware behavior

- general UI controls should be rendered from effective capabilities rather than only from equipment type
- extended capabilities may appear only for some vendor or model profiles
- Protocol Explorer may surface diagnostic or lower-confidence capabilities that are not promoted into general-purpose UI controls
- if a persisted confirmed capability profile conflicts with current protocol inference, the discrepancy should be visible for diagnostics rather than silently ignored

## Degraded-state workflows

### RS-485 offline

- frontend shows stale equipment state with offline banner
- control actions are disabled
- system recovers automatically when frames resume

### Weather provider stale

- weather card stays visible with staleness indicator
- automation evaluation pauses

### NATS unavailable

- UI shows reconnecting state
- REST reads still work where dependencies allow

### Database unavailable

- API returns degraded or unavailable status
- frontend falls back to startup or recovery messaging

## MagicMirror workflow

The future `MMM-Splash` module is read-only:

- fetches pool, chemistry, equipment, and tasks over REST
- subscribes to live updates over SSE
- does not require new endpoints beyond the documented API surface
