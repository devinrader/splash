import { assert, test } from "vitest";
import {
  ACTIVE_PLATFORM_REQUEST_MAX_COUNT,
  ACTIVE_PLATFORM_REQUEST_MAX_AGE_MS,
  appendActivePlatformRequest
} from "../src/platformRequests";
import type { ActivePlatformRequest } from "../src/viewUtils";

test("appendActivePlatformRequest replaces prior entries with the same command id", () => {
  const current: ActivePlatformRequest[] = [
    {
      commandId: "command-1",
      label: "Original request",
      requestedAt: "2026-06-16T10:00:00.000Z",
      waitingFor: "reply",
      replyType: null
    }
  ];

  const next = appendActivePlatformRequest(
    current,
    {
      commandId: "command-1",
      label: "Updated request",
      waitingFor: "new reply",
      replyType: "controller_datetime"
    },
    "2026-06-16T10:01:00.000Z"
  );

  assert.equal(next.length, 1);
  assert.equal(next[0]?.label, "Updated request");
  assert.equal(next[0]?.requestedAt, "2026-06-16T10:01:00.000Z");
  assert.equal(next[0]?.replyType, "controller_datetime");
});

test("appendActivePlatformRequest prunes stale entries and enforces a bounded buffer", () => {
  const oldEntry: ActivePlatformRequest = {
    commandId: "stale-command",
    label: "Stale request",
    requestedAt: new Date(Date.parse("2026-06-16T10:30:00.000Z") - ACTIVE_PLATFORM_REQUEST_MAX_AGE_MS - 1000).toISOString(),
    waitingFor: "reply",
    replyType: null
  };

  let current: ActivePlatformRequest[] = [oldEntry];
  for (let index = 0; index < ACTIVE_PLATFORM_REQUEST_MAX_COUNT + 5; index += 1) {
    current = appendActivePlatformRequest(
      current,
      {
        commandId: `command-${index}`,
        label: `Request ${index}`,
        waitingFor: "reply",
        replyType: null
      },
      new Date(Date.parse("2026-06-16T10:30:00.000Z") + index * 1000).toISOString()
    );
  }

  assert.equal(current.length, ACTIVE_PLATFORM_REQUEST_MAX_COUNT);
  assert.equal(current.some((entry) => entry.commandId === "stale-command"), false);
  assert.equal(current[0]?.commandId, "command-5");
  assert.equal(current[current.length - 1]?.commandId, `command-${ACTIVE_PLATFORM_REQUEST_MAX_COUNT + 4}`);
});
