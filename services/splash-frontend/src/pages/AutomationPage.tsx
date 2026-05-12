import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { fetchControllerSchedules } from "../api";
import { Card } from "../components/mockUi";
import { AUTOMATION_TABS, getActiveAutomationTab } from "../navigation";
import type { ControllerScheduleRecord, ControllerSchedulesData } from "../types";

const AUTOMATION_SUMMARY = {
  schedules: 4,
  rules: 3,
  scenes: 2,
  triggers: 5
};

const UPCOMING_AUTOMATION = [
  { title: "Morning Circulation", summary: "Pool Mode: Circulate · Tomorrow 8:00 AM" },
  { title: "Evening Lights", summary: "Light Circuit: On · Fri 7:30 PM" },
  { title: "Cleaner Run", summary: "Paused until Thursday morning review" }
];

const RECENT_ACTIVITY = [
  { title: "Freeze guard watch armed", detail: "Trigger remains ready because tonight's low is forecast below 35°F.", tone: "Watch" },
  { title: "Spa Heat schedule queued", detail: "Next seasonal run is Friday at 6:00 PM for evening warmup.", tone: "Ready" },
  { title: "Cleaner Run paused", detail: "Operator paused the schedule pending basket cleaning and pressure check.", tone: "Paused" }
];

const RULE_ROWS = [
  { name: "Freeze protection", condition: "Air temperature <= 35°F", action: "Raise pump speed and force circulation", status: "Armed" },
  { name: "High UV sanitizer support", condition: "UV index remains elevated for 2h", action: "Recommend chlorination review", status: "Monitoring" },
  { name: "Rain response", condition: "Rainfall forecast exceeds 0.5 in", action: "Prepare chemistry follow-up task", status: "Ready" }
];

const SCENE_ROWS = [
  { name: "Spa Mode", action: "Valves to spa, heater enabled, pump boosted", summary: "Reusable grouped action for quick spa startup." },
  { name: "Evening Swim", action: "Lights on, pump quiet profile, heater hold", summary: "Operator-friendly grouped state for after-hours use." }
];

const TRIGGER_ROWS = [
  { source: "Weather", state: "Forecast low 34°F", meaning: "Freeze rule can activate overnight." },
  { source: "Equipment", state: "Pump circuit available", meaning: "Speed-change actions can be proposed safely." },
  { source: "Chemistry", state: "Salt reading stale", meaning: "Advisory automation stays informative rather than autonomous." },
  { source: "Schedule Window", state: "Weekend evening block", meaning: "Lighting and spa-related schedules may run." }
];

const LOG_ROWS = [
  { when: "Today 2:05 PM", source: "Schedule", result: "Cleaner Run paused", detail: "Operator paused schedule from the automation workspace." },
  { when: "Today 9:00 AM", source: "Rule", result: "Rain response suggestion published", detail: "Task created for chemistry retest after forecasted rain." },
  { when: "Yesterday 7:30 PM", source: "Schedule", result: "Evening Lights executed", detail: "Controller-managed lighting schedule completed successfully." }
];

function formatMinutesAfterMidnight(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "Unknown";
  }

  const normalizedMinutes = ((value % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function formatScheduleDays(bitmask: number | null | undefined): string {
  if (typeof bitmask !== "number") {
    return "Unknown";
  }
  if ((bitmask & 0x7f) === 0x7f) {
    return "Sun-Sat";
  }

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].filter((_, index) => ((bitmask & 0x7f) & (1 << index)) !== 0);
  return labels.length > 0 ? labels.join(", ") : "None";
}

function describeScheduleName(row: ControllerScheduleRecord): string {
  return typeof row.schedule_id === "number" ? String(row.schedule_id) : "";
}

function describeScheduleAction(row: ControllerScheduleRecord): string {
  if (row.frame_type === "easytouch_egg_timer") {
    return `Circuit ${row.circuit_id ?? "?"} egg timer`;
  }

  const circuit = row.circuit_id ?? "?";
  const kind = row.schedule_type_label === "run_once_or_egg_timer_controlled" ? "Run Once" : "Repeat";
  return `Circuit ${circuit} · ${kind}`;
}

function describeScheduleTime(row: ControllerScheduleRecord): string {
  if (row.frame_type === "easytouch_egg_timer") {
    return `${row.egg_timer_run_time_minutes ?? "Unknown"} min runtime`;
  }

  return `${formatMinutesAfterMidnight(row.start_time_minutes)} - ${formatMinutesAfterMidnight(row.end_time_minutes)}`;
}

function formatScheduleNextRun(value: string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    return "Unknown";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(new Date(timestamp));
}

export function AutomationPage() {
  const location = useLocation();
  const activeTab = getActiveAutomationTab(location.pathname);
  const [controllerSchedules, setControllerSchedules] = useState<ControllerSchedulesData | null>(null);
  const [controllerSchedulesError, setControllerSchedulesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetchControllerSchedules();
        if (!cancelled) {
          setControllerSchedules(response.data);
          setControllerSchedulesError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setControllerSchedulesError(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="automation-page-shell">
      <div className="automation-tabs" role="tablist" aria-label="Automation tabs">
        {AUTOMATION_TABS.map((tab) => (
          <NavLink
            key={tab.id}
            id={`automation-tab-${tab.id}`}
            className={`automation-tab ${activeTab === tab.id ? "automation-tab-active" : ""}`}
            to={tab.path}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`automation-panel-${tab.id}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <div id={`automation-panel-${activeTab}`} className="automation-tab-panel" role="tabpanel" aria-labelledby={`automation-tab-${activeTab}`}>
        <Routes>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<AutomationOverviewTab />} />
          <Route
            path="schedules"
            element={<AutomationSchedulesTab controllerSchedules={controllerSchedules} controllerSchedulesError={controllerSchedulesError} />}
          />
          <Route path="rules" element={<AutomationRulesTab />} />
          <Route path="scenes" element={<AutomationScenesTab />} />
          <Route path="triggers" element={<AutomationTriggersTab />} />
          <Route path="logs" element={<AutomationLogsTab />} />
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Routes>
      </div>
    </section>
  );
}

function AutomationOverviewTab() {
  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-overview">
        <Card title="Automation Overview" status="Seeded milestone slice" className="automation-card-hero">
          <p className="panel-copy">
            The Overview tab gives the operator a fast read on how Splash automation is currently structured. It summarizes schedules, rules,
            scenes, and triggers while surfacing the next planned activity and the most recent notable changes.
          </p>
        </Card>
        <Card title="Summary">
          <div className="mock-summary-grid">
            <div><strong>{AUTOMATION_SUMMARY.schedules}</strong><span>Schedules</span></div>
            <div><strong>{AUTOMATION_SUMMARY.rules}</strong><span>Rules</span></div>
            <div><strong>{AUTOMATION_SUMMARY.scenes}</strong><span>Scenes</span></div>
            <div><strong>{AUTOMATION_SUMMARY.triggers}</strong><span>Triggers</span></div>
          </div>
        </Card>
      </div>

      <div className="automation-grid automation-grid-two-column">
        <Card title="Upcoming Automation">
          <div className="automation-record-list" role="list" aria-label="upcoming automation events">
            {UPCOMING_AUTOMATION.map((item) => (
              <div className="automation-record-row" key={item.title} role="listitem">
                <strong>{item.title}</strong>
                <span>{item.summary}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Recent Activity">
          <div className="automation-record-list" role="list" aria-label="recent automation activity">
            {RECENT_ACTIVITY.map((item) => (
              <div className="automation-record-row" key={item.title} role="listitem">
                <div className="automation-record-heading">
                  <strong>{item.title}</strong>
                  <span className={`system-status-chip ${item.tone === "Ready" ? "system-status-chip-good" : "system-status-chip-watch"}`}>{item.tone}</span>
                </div>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function AutomationSchedulesTab({
  controllerSchedules,
  controllerSchedulesError
}: {
  controllerSchedules: ControllerSchedulesData | null;
  controllerSchedulesError: string | null;
}) {
  const liveSchedules = controllerSchedules?.schedules ?? [];
  const showLiveTable = controllerSchedules?.status === "available" && liveSchedules.length > 0;
  const observedPayloadCount = controllerSchedules?.observed_payloads?.length ?? 0;

  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-schedules">
        <Card title="Schedules" status="Controller-managed today" className="automation-card-table">
          <div className="mock-card-toolbar">
            <p className="panel-copy">
              {showLiveTable
                ? "The table below is using controller-backed schedule data returned by Splash API."
                : "Controller-backed schedule visibility is wired through Splash API, but EasyTouch schedule semantics are still unavailable until the payload mapping is validated."}
            </p>
            <button type="button" className="automation-primary-button">Create Schedule</button>
          </div>
          <div className="mock-table-shell">
            <table className="system-data-table" aria-label="automation schedules">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Action</th>
                  <th>Days</th>
                  <th>Time</th>
                  <th>Season</th>
                  <th>Status</th>
                  <th>Next Run</th>
                </tr>
              </thead>
              <tbody>
                {showLiveTable ? (
                  liveSchedules.map((row, index) => (
                    <tr key={row.schedule_id ?? `${row.frame_type}-${index}`}>
                      <td>{describeScheduleName(row)}</td>
                      <td>{describeScheduleAction(row)}</td>
                      <td>{row.frame_type === "easytouch_egg_timer" ? "Egg Timer" : formatScheduleDays(row.schedule_days)}</td>
                      <td>{describeScheduleTime(row)}</td>
                      <td></td>
                      <td>
                        <span className={`system-status-chip ${row.active ? "system-status-chip-good" : "system-status-chip-watch"}`}>
                          {row.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{formatScheduleNextRun(row.updated_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>
                      {controllerSchedulesError
                        ?? controllerSchedules?.message
                        ?? "Controller schedule visibility has not been initialized yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!showLiveTable ? (
            <div className="automation-record-list" aria-label="controller schedules unavailable">
              <div className="automation-record-row">
                <strong>Controller schedules unavailable</strong>
                <span>{controllerSchedulesError ?? controllerSchedules?.message ?? "Controller schedule visibility has not been initialized yet."}</span>
              </div>
              <div className="automation-record-row">
                <strong>Source</strong>
                <span>{controllerSchedules?.controller_type === "easytouch" ? "EasyTouch controller-native schedules" : "Controller-native schedules"}</span>
              </div>
              <div className="automation-record-row">
                <strong>Last checked</strong>
                <span>{controllerSchedules?.last_checked ?? "Not yet observed"}</span>
              </div>
              {observedPayloadCount > 0 ? (
                <div className="automation-record-row">
                  <strong>Observed raw schedule payloads</strong>
                  <span>{observedPayloadCount} schedule payload sample{observedPayloadCount === 1 ? "" : "s"} captured, but not yet field-decoded.</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        <div className="automation-side-stack">
          <Card title="Scheduling Mode">
            <div className="automation-mode-summary">
              <strong>Current Mode</strong>
              <span>Controller Managed</span>
            </div>
            <div className="automation-mode-toggle" role="group" aria-label="schedule mode toggle">
              <button type="button" className="automation-mode-button automation-mode-button-active" aria-pressed="true">
                Controller Managed
              </button>
              <button type="button" className="automation-mode-button" aria-pressed="false">
                Platform Managed
              </button>
            </div>
            <p className="panel-copy">
              Schedules are currently stored directly on the EasyTouch controller, so they continue to run even if Splash is offline.
            </p>
            <button type="button" className="automation-secondary-button">Migrate to Platform Scheduling</button>
          </Card>

          <Card title="Mode Guidance">
            <div className="automation-record-list">
              <div className="automation-record-row">
                <strong>Controller Managed</strong>
                <span>Best for today’s live deployment because controller schedules remain authoritative.</span>
              </div>
              <div className="automation-record-row">
                <strong>Platform Managed</strong>
                <span>Future mode where Splash becomes the scheduling authority after the backend scheduling contracts exist.</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function AutomationRulesTab() {
  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-two-column">
        <Card title="Rules" status="Condition-based behavior">
          <p className="panel-copy">
            Rules evaluate sensor, weather, equipment, and time-window inputs to decide when Splash should recommend or coordinate an action.
            This milestone slice keeps the rules page operator-readable without inventing persistence or live mutation APIs.
          </p>
        </Card>
        <Card title="Current Posture">
          <div className="automation-record-list">
            <div className="automation-record-row"><strong>Trust model</strong><span>Suggest-and-approve automation remains the v1 posture.</span></div>
            <div className="automation-record-row"><strong>Execution source</strong><span>Approved actions still flow through tasks and normalized commands.</span></div>
          </div>
        </Card>
      </div>
      <Card title="Seeded Rules" className="automation-card-table">
        <div className="mock-table-shell">
          <table className="system-data-table" aria-label="automation rules">
            <thead>
              <tr>
                <th>Name</th>
                <th>Condition</th>
                <th>Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {RULE_ROWS.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.condition}</td>
                  <td>{row.action}</td>
                  <td><span className={`system-status-chip ${row.status === "Armed" ? "system-status-chip-good" : "system-status-chip-watch"}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function AutomationScenesTab() {
  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-two-column">
        <Card title="Scenes" status="Reusable grouped actions">
          <p className="panel-copy">
            Scenes package several equipment changes into one intentional experience, such as spa startup or an evening swim profile.
          </p>
        </Card>
        <Card title="Scene Design Note">
          <p className="panel-copy">
            The first slice is presentational. It explains how grouped actions should feel in the product without claiming that scene storage or activation APIs exist yet.
          </p>
        </Card>
      </div>
      <div className="automation-grid automation-grid-two-column">
        {SCENE_ROWS.map((scene) => (
          <Card key={scene.name} title={scene.name} status="Preview">
            <div className="automation-record-list">
              <div className="automation-record-row"><strong>Action Set</strong><span>{scene.action}</span></div>
              <div className="automation-record-row"><strong>Intent</strong><span>{scene.summary}</span></div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function AutomationTriggersTab() {
  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-two-column">
        <Card title="Triggers" status="Automation inputs">
          <p className="panel-copy">
            Triggers are the real-time or contextual signals that make a rule or scene relevant. They can come from weather, controller state, chemistry freshness, or time windows.
          </p>
        </Card>
        <Card title="Current Visibility">
          <p className="panel-copy">
            This slice emphasizes explainability first: operators should be able to see what can start automation behavior before Splash gains richer live trigger APIs.
          </p>
        </Card>
      </div>
      <Card title="Trigger Sources">
        <div className="automation-record-list" role="list" aria-label="automation trigger sources">
          {TRIGGER_ROWS.map((trigger) => (
            <div className="automation-record-row" key={trigger.source} role="listitem">
              <div className="automation-record-heading">
                <strong>{trigger.source}</strong>
                <span className="system-status-chip system-status-chip-good">{trigger.state}</span>
              </div>
              <span>{trigger.meaning}</span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function AutomationLogsTab() {
  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-two-column">
        <Card title="Automation Logs" status="Historical activity">
          <p className="panel-copy">
            The logs view records what automation did, when it happened, and why. For this milestone it uses seeded examples to establish the operator-facing shape of the history surface.
          </p>
        </Card>
        <Card title="Audit Focus">
          <p className="panel-copy">
            Logs are intended to answer three questions quickly: what ran, what caused it, and whether the outcome matched operator expectations.
          </p>
        </Card>
      </div>
      <Card title="Recent Log Entries" className="automation-card-table">
        <div className="mock-table-shell">
          <table className="system-data-table" aria-label="automation logs">
            <thead>
              <tr>
                <th>When</th>
                <th>Source</th>
                <th>Result</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {LOG_ROWS.map((row) => (
                <tr key={`${row.when}-${row.result}`}>
                  <td>{row.when}</td>
                  <td>{row.source}</td>
                  <td>{row.result}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
