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

1. the user changes pump-circuit RPM from the browser
2. the API validates the normalized `set_speed` command against the target
   controller-managed pump circuit
3. `splash-api` publishes `protocol.command.intent`
4. `splash-protocol` encodes the Pentair controller-mediated circuit-speed
   command path and publishes `serial.write.request`
5. `splash-serial` writes the bytes to the bus and reports `serial.tx.raw`
6. `splash-protocol` correlates the write and resulting controller and
   pump-status frames
7. the browser shows pending, transmitted, and completed or failed command
   state

NOTE: milestone 1 should prefer controller-cooperative EasyTouch circuit-speed
control rather than direct IntelliFlo RPM writes. Direct pump-only control and
no-controller scenarios remain later follow-up work.

### Initial implementation success criteria

- the browser shows current air temperature
- the browser shows current water temperature
- the browser shows current salt level
- the browser shows current pump RPM
- the browser can change pump-circuit RPM through the documented command flow
- the system logs or persists enough state to verify the read path and the
  resulting control action

## Equipment scheduling direction

Splash is intended to become the scheduling authority for normal pool-equipment
operation rather than leaving day-to-day schedules in the EasyTouch
controller.

Target direction:

- Splash should own pump-speed scheduling once the scheduling slice is
  implemented
- controller-native EasyTouch schedules should become unnecessary for normal
  operation
- the initial implementation milestone does not require schedule replacement,
  but future scheduling work should be planned toward this outcome

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
- clearly distinguish:
  - known fields
  - inferred fields
  - unknown bytes
  - operator-needed questions

Initial implementation note:

- the first Protocol Explorer slice may begin with a live frame stream only
  through `/protocol/frames`
- decode, annotation, diff, and simulator tooling may follow after the live
  stream is available for protocol discovery

### Watch session

1. the operator or assistant starts a watch session explicitly
2. Splash records all live Explorer frame events into that session from that
   point forward
3. the operator performs one controller or equipment action
4. the operator or assistant stops the watch session
5. Splash returns the exact captured frame set so it can be displayed,
   summarized, or compared later

Rules:

- watch sessions should capture receive-side and outbound Explorer events
- watch sessions should not depend on the rolling recent-frame buffer after they
  start
- the first slice may remain in-memory and local to `splash-api`

### Manual Remote Layout request

- the operator chooses a page index in Protocol Explorer
- `splash-api` publishes a diagnostic `protocol.command.intent`
- `splash-protocol` encodes a Pentair Remote Layout request:
  - protocol byte `0x01`
  - destination `0x10`
  - action `0xe1`
  - payload `[page_index]`
- `splash-serial` writes the request to the bus
- later controller `0x21` traffic is inspected through the live frame stream
  and saved bundles

### Manual raw frame send

- the operator pastes an explicit lowercase hex frame into Protocol Explorer
- `splash-api` publishes a diagnostic `protocol.command.intent`
- `splash-protocol` treats the bytes as an Explorer-only raw write request
- `splash-serial` writes the exact bytes to the bus without checksum or field
  rewriting in the first slice
- Explorer inspects:
  - `protocol.command.encoded`
  - `serial.tx.raw`
  - any later receive-side response traffic

Guardrails:

- this path is diagnostic-only and not promoted into normal dashboard or task
  controls
- malformed hex must be rejected before publish
- the first slice should complete on transport acknowledgement only

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

Initial frame-diff slice:

- compare two saved frame bundles by frame position
- highlight changed byte offsets for hex-bearing fields such as `bytes_hex` or
  `payload_hex`
- keep unchanged fields visible as context
- defer smarter frame matching or protocol-aware correlation until later

### Collaborative decoding loop

1. capture a baseline frame bundle
2. make one controlled controller or equipment change
3. capture the comparison frame bundle
4. have Splash highlight bytes or fields that are:
   - known
   - inferred
   - still unknown
5. have Splash explicitly call out what operator input is needed, such as:
   - controller menu state
   - circuit names
   - configured RPM values
   - observed equipment behavior
6. save annotations and confidence levels with the frame bundle
7. update production decoders only after the inferred fields are validated

This collaborative loop is the preferred workflow for unresolved Pentair tasks
such as `#43`, `#60`, and `#61`.

### Initial saved bundle slice

The first saved-frame-bundle implementation may stay deliberately narrow:

- `splash-api` keeps a recent in-memory buffer of live `protocol.frame.raw` and
  `protocol.frame.decoded` events
- the operator or Explorer client creates a saved frame bundle by snapshotting
  the buffered events for a short controlled experiment window
- the saved bundle is retrievable through REST for later diff or annotation
  work
- the first slice does not need persistent storage or long-term retention

### Initial annotation slice

- annotations should target a saved bundle plus frame position and field name
- annotations should carry explicit confidence:
  - `known`
  - `inferred`
  - `unknown`
- annotations should support byte ranges rather than only one byte offset
- the first slice may remain in-memory and API-local before PostgreSQL-backed
  `protocol_annotations` exists

### Initial operator prompt slice

- prompts should target a saved bundle and a frame position
- prompts should explain why operator input is needed
- prompts should declare the expected input type, such as:
  - `controller_menu_state`
  - `equipment_behavior`
  - `circuit_name`
  - `configured_rpm`
- prompts may include an operator response in the first slice, but do not need
  a separate task or notification workflow yet
- the first slice may remain in-memory and API-local

## Future virtual pool workflow

Future platform work may support a virtual pool mode where the user can create a
simulated pool backed by mock equipment instead of real RS-485 hardware.

Target uses:

- browser and API demos without physical equipment
- protocol and command experimentation in a safe simulated environment
- UI and workflow validation before deployment to a real pool

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
