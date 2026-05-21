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

const DAY_OPTIONS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 }
] as const;

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
  return typeof row.circuit_id === "number" ? `Circuit ${row.circuit_id}` : "Unknown circuit";
}

function describeScheduleAction(row: ControllerScheduleRecord): string {
  if (row.frame_type === "easytouch_egg_timer") {
    return "Egg Timer";
  }

  return row.schedule_type_label === "run_once_or_egg_timer_controlled" ? "Run Once" : "Repeat";
}

function isActiveSchedule(row: ControllerScheduleRecord): boolean {
  return row.active === true;
}

function countProgramsByCircuit(rows: ControllerScheduleRecord[]): Array<{ circuitLabel: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.circuit_id !== "number") {
      continue;
    }
    const key = `Circuit ${row.circuit_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([circuitLabel, count]) => ({ circuitLabel, count }))
    .sort((left, right) => right.count - left.count || left.circuitLabel.localeCompare(right.circuitLabel));
}

function formatProgramUsage(used: number, max: number): string {
  return `${used} / ${max}`;
}

function formatTimeInputValue(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "08:00";
  }

  const normalizedMinutes = ((value % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDurationInputValue(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "00:30";
  }

  const normalizedMinutes = Math.max(0, value);
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getScheduleTypeValue(row: ControllerScheduleRecord | null): "repeat" | "run_once" | "egg_timer" {
  if (!row) {
    return "repeat";
  }

  if (row.frame_type === "easytouch_egg_timer") {
    return "egg_timer";
  }

  return row.schedule_type_label === "run_once_or_egg_timer_controlled" ? "run_once" : "repeat";
}

function getScheduleDayValues(row: ControllerScheduleRecord | null): number[] {
  if (!row || typeof row.schedule_days !== "number") {
    return [1, 3, 5];
  }

  return DAY_OPTIONS.filter((option) => (row.schedule_days & (1 << option.value)) !== 0).map((option) => option.value);
}

function findDefaultEditorSchedule(rows: ControllerScheduleRecord[]): ControllerScheduleRecord | null {
  if (rows.length === 0) {
    return null;
  }

  const exactProgramOne = rows.find((row) => row.schedule_id === 1);
  if (exactProgramOne) {
    return exactProgramOne;
  }

  return [...rows].sort((left, right) => {
    const leftId = typeof left.schedule_id === "number" ? left.schedule_id : Number.MAX_SAFE_INTEGER;
    const rightId = typeof right.schedule_id === "number" ? right.schedule_id : Number.MAX_SAFE_INTEGER;
    return leftId - rightId;
  })[0] ?? null;
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
            element={
              <AutomationSchedulesTab
                key={controllerSchedules?.last_checked ?? "controller-schedules-empty"}
                controllerSchedules={controllerSchedules}
                controllerSchedulesError={controllerSchedulesError}
              />
            }
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
  const activeSchedules = liveSchedules.filter(isActiveSchedule);
  const showLiveTable = controllerSchedules?.status === "available" && liveSchedules.length > 0;
  const observedPayloadCount = controllerSchedules?.observed_payloads?.length ?? 0;
  const totalProgramsUsed = activeSchedules.length;
  const totalProgramsRemaining = Math.max(12 - totalProgramsUsed, 0);
  const circuitUsage = countProgramsByCircuit(activeSchedules);
  const emphasizedCircuit = circuitUsage[0] ?? null;
  const circuitOptions = [...new Set(liveSchedules.map((row) => row.circuit_id).filter((value): value is number => typeof value === "number"))]
    .sort((left, right) => left - right);
  const defaultEditorSchedule = findDefaultEditorSchedule(liveSchedules);
  const fallbackCircuitId = defaultEditorSchedule?.circuit_id ?? circuitOptions[0] ?? 1;
  const [draftCircuitId, setDraftCircuitId] = useState<number>(defaultEditorSchedule?.circuit_id ?? fallbackCircuitId);
  const [draftScheduleType, setDraftScheduleType] = useState<"repeat" | "run_once" | "egg_timer">(getScheduleTypeValue(defaultEditorSchedule));
  const [draftSelectedDays, setDraftSelectedDays] = useState<number[]>(getScheduleDayValues(defaultEditorSchedule));
  const [draftStartTime, setDraftStartTime] = useState(
    defaultEditorSchedule?.frame_type === "easytouch_egg_timer"
      ? "00:00"
      : formatTimeInputValue(defaultEditorSchedule?.start_time_minutes)
  );
  const [draftStopTime, setDraftStopTime] = useState(
    defaultEditorSchedule?.frame_type === "easytouch_egg_timer"
      ? formatDurationInputValue(defaultEditorSchedule?.egg_timer_run_time_minutes)
      : formatTimeInputValue(defaultEditorSchedule?.end_time_minutes)
  );
  const [draftMarkedActive, setDraftMarkedActive] = useState(defaultEditorSchedule?.active === true);
  const [useDefaultEditorSeed, setUseDefaultEditorSeed] = useState(true);
  const [selectedScheduleLabel, setSelectedScheduleLabel] = useState(
    defaultEditorSchedule?.schedule_id ? `Program ${defaultEditorSchedule.schedule_id}` : "Program 1"
  );

  useEffect(() => {
    const nextDefault = findDefaultEditorSchedule(liveSchedules);
    if (!nextDefault) {
      return;
    }

    setUseDefaultEditorSeed(true);
    setSelectedScheduleLabel(nextDefault.schedule_id ? `Program ${nextDefault.schedule_id}` : "Program 1");
    setDraftCircuitId(nextDefault.circuit_id ?? fallbackCircuitId);
    setDraftScheduleType(getScheduleTypeValue(nextDefault));
    setDraftSelectedDays(getScheduleDayValues(nextDefault));
    setDraftStartTime(
      nextDefault.frame_type === "easytouch_egg_timer"
        ? "00:00"
        : formatTimeInputValue(nextDefault.start_time_minutes)
    );
    setDraftStopTime(
      nextDefault.frame_type === "easytouch_egg_timer"
        ? formatDurationInputValue(nextDefault.egg_timer_run_time_minutes)
        : formatTimeInputValue(nextDefault.end_time_minutes)
    );
    setDraftMarkedActive(nextDefault.active === true);
  }, [controllerSchedules?.last_checked]);

  const seededSchedule = useDefaultEditorSeed ? defaultEditorSchedule : null;
  const editorCircuitId = seededSchedule?.circuit_id ?? draftCircuitId;
  const editorScheduleType = seededSchedule ? getScheduleTypeValue(seededSchedule) : draftScheduleType;
  const editorSelectedDays = seededSchedule ? getScheduleDayValues(seededSchedule) : draftSelectedDays;
  const editorStartTime = seededSchedule
    ? seededSchedule.frame_type === "easytouch_egg_timer"
      ? "00:00"
      : formatTimeInputValue(seededSchedule.start_time_minutes)
    : draftStartTime;
  const editorStopTime = seededSchedule
    ? seededSchedule.frame_type === "easytouch_egg_timer"
      ? formatDurationInputValue(seededSchedule.egg_timer_run_time_minutes)
      : formatTimeInputValue(seededSchedule.end_time_minutes)
    : draftStopTime;
  const editorMarkedActive = seededSchedule ? seededSchedule.active === true : draftMarkedActive;

  const draftDaySummary = editorScheduleType === "egg_timer"
    ? "Egg Timer"
    : editorSelectedDays.length === 7
      ? "Sun-Sat"
      : [...editorSelectedDays]
        .sort((left, right) => left - right)
        .map((value) => DAY_OPTIONS.find((option) => option.value === value)?.label ?? "")
        .filter(Boolean)
        .join(", ");

  function toggleDraftDay(day: number) {
    setUseDefaultEditorSeed(false);
    setDraftSelectedDays((current) => (
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((left, right) => left - right)
    ));
  }

  function resetDraftEditor() {
    const baseline = defaultEditorSchedule;
    setUseDefaultEditorSeed(true);
    setDraftCircuitId(baseline?.circuit_id ?? fallbackCircuitId);
    setDraftScheduleType(getScheduleTypeValue(baseline));
    setDraftSelectedDays(getScheduleDayValues(baseline));
    setDraftStartTime(
      baseline?.frame_type === "easytouch_egg_timer"
        ? "00:00"
        : formatTimeInputValue(baseline?.start_time_minutes)
    );
    setDraftStopTime(
      baseline?.frame_type === "easytouch_egg_timer"
        ? formatDurationInputValue(baseline?.egg_timer_run_time_minutes)
        : formatTimeInputValue(baseline?.end_time_minutes)
    );
    setDraftMarkedActive(baseline?.active === true);
    setSelectedScheduleLabel(baseline?.schedule_id ? `Program ${baseline.schedule_id}` : "Program 1");
  }

  function handleReviewSchedule(row: ControllerScheduleRecord) {
    setUseDefaultEditorSeed(false);
    setSelectedScheduleLabel(typeof row.schedule_id === "number" ? `Program ${row.schedule_id}` : describeScheduleName(row));
    setDraftCircuitId(row.circuit_id ?? fallbackCircuitId);
    setDraftScheduleType(getScheduleTypeValue(row));
    setDraftSelectedDays(getScheduleDayValues(row));
    setDraftStartTime(
      row.frame_type === "easytouch_egg_timer"
        ? "00:00"
        : formatTimeInputValue(row.start_time_minutes)
    );
    setDraftStopTime(
      row.frame_type === "easytouch_egg_timer"
        ? formatDurationInputValue(row.egg_timer_run_time_minutes)
        : formatTimeInputValue(row.end_time_minutes)
    );
    setDraftMarkedActive(row.active === true);
  }

  return (
    <section className="automation-shell">
      <div className="automation-grid automation-grid-schedules">
        <Card title="Schedules" status="Controller-managed today" className="automation-card-table">
          <div className="automation-schedule-summary-strip" aria-label="controller schedule capacity">
            <div className="automation-schedule-summary-card">
              <span className="automation-schedule-summary-label">12 total programs max</span>
              <strong>{formatProgramUsage(totalProgramsUsed, 12)}</strong>
              <small>{totalProgramsRemaining} active slots remaining</small>
            </div>
            <div className="automation-schedule-summary-card">
              <span className="automation-schedule-summary-label">Per circuit max: 9</span>
              <strong>{emphasizedCircuit ? formatProgramUsage(emphasizedCircuit.count, 9) : "0 / 9"}</strong>
              <small>{emphasizedCircuit ? emphasizedCircuit.circuitLabel : "No active circuit schedules observed"}</small>
            </div>
            <div className="automation-schedule-summary-card automation-schedule-summary-card-progress">
              <span className="automation-schedule-summary-label">Active programs used</span>
              <div className="automation-program-slots" aria-hidden="true">
                {Array.from({ length: 12 }, (_, index) => (
                  <span
                    key={index}
                    className={`automation-program-slot ${index < totalProgramsUsed ? "automation-program-slot-filled" : ""}`}
                  />
                ))}
              </div>
              <small>Only active schedules consume the shared EasyTouch slot pool.</small>
            </div>
          </div>
          <div className="mock-card-toolbar">
            <p className="panel-copy">
              {showLiveTable
                ? "The table below is using controller-backed schedule data returned by Splash API."
                : "Controller-backed schedule visibility is wired through Splash API, but EasyTouch schedule semantics are still unavailable until the payload mapping is validated."}
            </p>
          </div>
          <div className="mock-table-shell">
            <table className="system-data-table" aria-label="automation schedules">
              <thead>
                <tr>
                  <th>Circuit</th>
                  <th>Program #</th>
                  <th>Action</th>
                  <th>Days</th>
                  <th>Start</th>
                  <th>Stop</th>
                  <th>Heat</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {showLiveTable ? (
                  liveSchedules.map((row, index) => (
                    <tr
                      key={row.schedule_id ?? `${row.frame_type}-${index}`}
                      className={row.active ? undefined : "automation-table-row-muted"}
                    >
                      <td>{describeScheduleName(row)}</td>
                      <td>{typeof row.schedule_id === "number" ? row.schedule_id : "—"}</td>
                      <td>{describeScheduleAction(row)}</td>
                      <td>{row.frame_type === "easytouch_egg_timer" ? "Egg Timer" : formatScheduleDays(row.schedule_days)}</td>
                      <td>{row.frame_type === "easytouch_egg_timer" ? "—" : formatMinutesAfterMidnight(row.start_time_minutes)}</td>
                      <td>{row.frame_type === "easytouch_egg_timer" ? `${row.egg_timer_run_time_minutes ?? "Unknown"} min` : formatMinutesAfterMidnight(row.end_time_minutes)}</td>
                      <td>—</td>
                      <td>
                        <span className={`system-status-chip ${row.active ? "system-status-chip-good" : "system-status-chip-watch"}`}>
                          {row.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="automation-table-link-button"
                          onClick={() => handleReviewSchedule(row)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9}>
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
          <Card title="Schedule Editor" status={selectedScheduleLabel}>
              <div className="automation-schedule-editor" aria-label="new schedule draft editor">
                <div className="automation-schedule-editor-header">
                  <div>
                    <strong>{selectedScheduleLabel}</strong>
                    <p className="panel-copy">
                      This editor is local to the browser for now. It mirrors the controller-managed layout without claiming controller write support yet.
                    </p>
                  </div>
                  <span className="system-status-chip system-status-chip-watch">Local edit preview</span>
                </div>
                <div className="automation-schedule-editor-grid">
                  <label className="automation-field">
                    <span>Circuit</span>
                    <select value={String(editorCircuitId)} onChange={(event) => {
                      setUseDefaultEditorSeed(false);
                      setDraftCircuitId(Number(event.target.value));
                    }}>
                      {(circuitOptions.length > 0 ? circuitOptions : [fallbackCircuitId]).map((value) => (
                        <option key={value} value={String(value)}>
                          Circuit {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="automation-field">
                    <span>Schedule Type</span>
                    <select
                      value={editorScheduleType}
                      onChange={(event) => {
                        setUseDefaultEditorSeed(false);
                        setDraftScheduleType(event.target.value as "repeat" | "run_once" | "egg_timer");
                      }}
                    >
                      <option value="repeat">Repeat</option>
                      <option value="run_once">Run Once</option>
                      <option value="egg_timer">Egg Timer</option>
                    </select>
                  </label>
                  <label className="automation-field">
                    <span>Start Time</span>
                    <input
                      type="time"
                      value={editorStartTime}
                      onChange={(event) => {
                        setUseDefaultEditorSeed(false);
                        setDraftStartTime(event.target.value);
                      }}
                      disabled={editorScheduleType === "egg_timer"}
                    />
                  </label>
                  <label className="automation-field">
                    <span>{editorScheduleType === "egg_timer" ? "Run Time" : "Stop Time"}</span>
                    <input
                      type="time"
                      value={editorStopTime}
                      onChange={(event) => {
                        setUseDefaultEditorSeed(false);
                        setDraftStopTime(event.target.value);
                      }}
                    />
                  </label>
                  <label className="automation-field">
                    <span>Heat</span>
                    <select disabled defaultValue="unavailable">
                      <option value="unavailable">Not available in controller draft yet</option>
                    </select>
                  </label>
                  <label className="automation-field automation-field-checkbox">
                    <input
                      type="checkbox"
                      checked={editorMarkedActive}
                      onChange={(event) => {
                        setUseDefaultEditorSeed(false);
                        setDraftMarkedActive(event.target.checked);
                      }}
                    />
                    <span>Count this draft as an active schedule</span>
                  </label>
                </div>
                <div className="automation-field automation-field-days">
                  <span>Days</span>
                  <div className="automation-day-grid" role="group" aria-label="schedule draft days">
                    {DAY_OPTIONS.map((option) => (
                      <label key={option.value} className="automation-day-pill">
                        <input
                          type="checkbox"
                          checked={editorSelectedDays.includes(option.value)}
                          onChange={() => toggleDraftDay(option.value)}
                          disabled={editorScheduleType === "egg_timer"}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="automation-schedule-editor-footer">
                  <div className="automation-record-list">
                    <div className="automation-record-row">
                      <strong>Selected program posture</strong>
                      <span>{editorMarkedActive ? `${formatProgramUsage(totalProgramsUsed, 12)} active slots in use, including this program` : `${formatProgramUsage(totalProgramsUsed, 12)} active slots in use, this program marked inactive`}</span>
                    </div>
                    <div className="automation-record-row">
                      <strong>Editor summary</strong>
                      <span>{`Circuit ${editorCircuitId} · ${editorScheduleType === "egg_timer" ? "Egg Timer" : editorScheduleType === "run_once" ? "Run Once" : "Repeat"} · ${draftDaySummary || "No days selected"} · ${editorScheduleType === "egg_timer" ? `${editorStopTime} runtime` : `${editorStartTime} to ${editorStopTime}`}`}</span>
                    </div>
                  </div>
                  <div className="automation-inline-actions">
                    <button type="button" className="automation-secondary-button" onClick={resetDraftEditor}>Back to Program 1</button>
                  </div>
                </div>
              </div>
          </Card>
          <Card title="EasyTouch Limits">
            <div className="automation-record-list">
              <div className="automation-record-row">
                <strong>12 total programs</strong>
                <span>The EasyTouch controller shares one pool of twelve schedule slots across every circuit.</span>
              </div>
              <div className="automation-record-row">
                <strong>9 max per circuit</strong>
                <span>One circuit can consume at most nine programs, leaving at least three slots for the rest of the controller.</span>
              </div>
              <div className="automation-record-row">
                <strong>Controller Managed</strong>
                <span>Schedules remain stored on the EasyTouch controller so they continue running even when Splash is offline.</span>
              </div>
              <div className="automation-record-row">
                <strong>Last controller refresh</strong>
                <span>{controllerSchedules?.last_checked ?? "Not yet observed"}</span>
              </div>
            </div>
          </Card>

          <Card title="Program Capacity">
            <div className="automation-record-list">
              <div className="automation-record-row">
                <strong>Programs used</strong>
                <span>{`${formatProgramUsage(totalProgramsUsed, 12)} active`}</span>
              </div>
              <div className="automation-record-row">
                <strong>Programs remaining</strong>
                <span>{`${totalProgramsRemaining} active slots available`}</span>
              </div>
              <div className="automation-record-row">
                <strong>Highest-use circuit</strong>
                <span>{emphasizedCircuit ? `${emphasizedCircuit.circuitLabel} · ${formatProgramUsage(emphasizedCircuit.count, 9)}` : "No active circuit schedules observed"}</span>
              </div>
              <div className="automation-record-row">
                <strong>Next step</strong>
                <span>Use the always-visible editor to review controller programs inline without leaving the table view.</span>
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
