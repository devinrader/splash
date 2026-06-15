import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, test, vi, assert } from "vitest";
import App from "../src/App";
import { useFrontendStore } from "../src/store";

class FakeEventSource {
  onerror: (() => void) | null = null;
  addEventListener(): void {}
  close(): void {}
}

beforeEach(() => {
  useFrontendStore.setState({
    equipment: {},
    healthStatus: "unknown",
    healthData: null,
    sseStatus: "connecting",
    errorMessage: null,
    command: {
      commandId: null,
      requestedRpm: null,
      status: null,
      detail: null,
      errorCode: null
    }
  });
  vi.stubGlobal("EventSource", FakeEventSource);
});

test("alerts page loads notifications and marks one read", async () => {
  let unreadCalls = 0;

  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith("/equipment")) {
      return response({ data: [], error: null });
    }
    if (input.endsWith("/platform/status")) {
      return response({ overall: "healthy", generatedAt: "2026-06-04T21:00:00.000Z", connectivity: {}, services: [] });
    }
    if (input.includes("/notifications") && (!init || init.method === undefined)) {
      unreadCalls += 1;
      return response({
        data: {
          status: "unread",
          limit: 50,
          notifications: unreadCalls === 1 ? [
            {
              id: "notification-1",
              pool_id: "pool-1",
              type: "chemistry_test_due",
              category: "action_item",
              severity: "warning",
              title: "Chemistry test is due",
              body: "The latest chemistry reading is older than the configured testing interval.",
              read: false,
              source: "system",
              related_entity_type: "chemistry_reading",
              related_entity_id: "reading-1",
              created_at: "2026-06-04T21:00:00.000Z",
              read_at: null,
              acknowledged_at: null,
              resolved_at: null,
              resolution_source: null
            }
          ] : []
        },
        error: null
      });
    }
    if (input.endsWith("/notifications/notification-1/read") && init?.method === "POST") {
      return response({
        data: {
          id: "notification-1",
          pool_id: "pool-1",
          type: "chemistry_test_due",
          category: "action_item",
          severity: "warning",
          title: "Chemistry test is due",
          body: "The latest chemistry reading is older than the configured testing interval.",
          read: true,
          source: "system",
          related_entity_type: "chemistry_reading",
          related_entity_id: "reading-1",
          created_at: "2026-06-04T21:00:00.000Z",
          read_at: "2026-06-04T21:05:00.000Z",
          acknowledged_at: null,
          resolved_at: null,
          resolution_source: null
        },
        error: null
      });
    }
    throw new Error(`Unexpected fetch: ${input}`);
  }));

  render(
    <MemoryRouter initialEntries={["/alerts"]}>
      <App />
    </MemoryRouter>
  );

  await waitFor(() => {
    assert.ok(screen.getByText("Chemistry test is due"));
  });

  fireEvent.click(screen.getByRole("button", { name: "Mark read" }));

  await waitFor(() => {
    assert.ok(screen.getByText("No unread alerts are active right now."));
    assert.ok(screen.getByText("Alert marked as read."));
  });
});

function response(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as Response;
}
