import { startTransition, useEffect, useState } from "react";
import { fetchEquipment, fetchHealth, requestPumpSpeed, buildApiUrl } from "./api";
import { useFrontendStore } from "./store";
import type { EquipmentRecord } from "./types";
import "./styles.css";

export default function App() {
  const equipment = useFrontendStore((state) => state.equipment);
  const healthStatus = useFrontendStore((state) => state.healthStatus);
  const sseStatus = useFrontendStore((state) => state.sseStatus);
  const errorMessage = useFrontendStore((state) => state.errorMessage);
  const command = useFrontendStore((state) => state.command);
  const setEquipment = useFrontendStore((state) => state.setEquipment);
  const setHealthStatus = useFrontendStore((state) => state.setHealthStatus);
  const setSseStatus = useFrontendStore((state) => state.setSseStatus);
  const setErrorMessage = useFrontendStore((state) => state.setErrorMessage);
  const beginPumpCommand = useFrontendStore((state) => state.beginPumpCommand);
  const applyCommandResult = useFrontendStore((state) => state.applyCommandResult);
  const applyEquipmentStateEvent = useFrontendStore((state) => state.applyEquipmentStateEvent);
  const applyPumpStateEvent = useFrontendStore((state) => state.applyPumpStateEvent);

  const [rpmInput, setRpmInput] = useState("2800");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void loadInitialState({ setEquipment, setHealthStatus, setErrorMessage });
  }, [setEquipment, setErrorMessage, setHealthStatus]);

  useEffect(() => {
    setSseStatus("connecting");
    const source = new EventSource(buildApiUrl("/events"));

    source.addEventListener("ready", () => {
      setSseStatus("connected");
      void refreshEquipment(setEquipment, setErrorMessage);
      void refreshHealth(setHealthStatus, setErrorMessage);
    });

    source.addEventListener("equipment.state", (event) => {
      startTransition(() => {
        applyEquipmentStateEvent(parseEventPayload(event));
      });
    });

    source.addEventListener("pump.state", (event) => {
      startTransition(() => {
        applyPumpStateEvent(parseEventPayload(event));
      });
    });

    source.addEventListener("command.result", (event) => {
      startTransition(() => {
        applyCommandResult(parseEventPayload(event));
      });
    });

    source.onerror = () => {
      setSseStatus("disconnected");
      void refreshHealth(setHealthStatus, setErrorMessage);
    };

    return () => {
      source.close();
    };
  }, [applyCommandResult, applyEquipmentStateEvent, applyPumpStateEvent, setEquipment, setErrorMessage, setHealthStatus, setSseStatus]);

  const controller = equipment["controller-main"];
  const pump = equipment["pump-main"];
  const chlorinator = equipment["chlorinator-main"];
  const pendingCommand = isSubmitting || command.commandId !== null;

  async function handlePumpSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const rpm = Number.parseInt(rpmInput, 10);
    if (!pump || Number.isNaN(rpm)) {
      setErrorMessage("Enter a valid integer RPM before submitting.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await requestPumpSpeed({ equipmentId: pump.id, rpm });
      beginPumpCommand({ commandId: response.data.command_id, rpm });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Milestone 1</p>
          <h1>Pool equipment read and control</h1>
          <p className="hero-copy">
            Live temperatures, salt, and pump RPM with a direct browser control path for variable-speed pump changes.
          </p>
        </div>
        <div className="status-cluster" aria-label="service status">
          <StatusPill label="API" value={healthStatus} />
          <StatusPill label="Events" value={sseStatus} />
          <StatusPill label="Command" value={command.status ?? "idle"} />
        </div>
      </section>

      {errorMessage ? (
        <section className="notice notice-error" role="alert">
          {errorMessage}
        </section>
      ) : null}

      {command.detail ? (
        <section className="notice" aria-live="polite">
          <strong>{formatCommandStatus(command.status)}</strong>
          <span>{command.detail}</span>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <MetricCard
          label="Air Temperature"
          value={readMetric(controller?.latest_state.air_temp_f)}
          unit="°F"
          accent="sky"
        />
        <MetricCard
          label="Water Temperature"
          value={readMetric(controller?.latest_state.water_temp_f)}
          unit="°F"
          accent="water"
        />
        <MetricCard
          label="Salt Level"
          value={readMetric(chlorinator?.latest_state.salt_ppm)}
          unit="ppm"
          accent="sand"
        />
        <MetricCard
          label="Pump Speed"
          value={readMetric(pump?.latest_state.rpm)}
          unit="RPM"
          accent="pump"
        />
      </section>

      <section className="control-panel">
        <div>
          <p className="panel-kicker">Pump control</p>
          <h2>{pump?.display_name ?? "Main Pump"}</h2>
          <p className="panel-copy">
            The initial command path writes a direct Pentair pump RPM change and waits for a matching live pump-state confirmation.
          </p>
          <dl className="detail-grid">
            <div>
              <dt>Current RPM</dt>
              <dd>{formatMetric(readMetric(pump?.latest_state.rpm), "RPM")}</dd>
            </div>
            <div>
              <dt>Running</dt>
              <dd>{formatBoolean(pump?.latest_state.running)}</dd>
            </div>
            <div>
              <dt>Target bus address</dt>
              <dd>{typeof pump?.bus_address === "string" ? pump.bus_address : "Unavailable"}</dd>
            </div>
          </dl>
        </div>

        <form className="control-form" onSubmit={(event) => void handlePumpSubmit(event)}>
          <label htmlFor="pump-rpm">Requested RPM</label>
          <input
            id="pump-rpm"
            inputMode="numeric"
            pattern="[0-9]*"
            value={rpmInput}
            onChange={(event) => setRpmInput(event.target.value)}
            disabled={pendingCommand || !pump}
          />
          <button type="submit" disabled={pendingCommand || !pump}>
            {pendingCommand ? "Waiting for command result..." : "Set pump speed"}
          </button>
          <p className="form-caption">Pump speed changes remain disabled while the prior command is unresolved.</p>
        </form>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  unit,
  accent
}: {
  label: string;
  value: number | null;
  unit: string;
  accent: "sky" | "water" | "sand" | "pump";
}) {
  return (
    <article className={`metric-card metric-card-${accent}`}>
      <p>{label}</p>
      <strong>{formatMetric(value, unit)}</strong>
    </article>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className={`status-pill status-${value}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function loadInitialState({
  setEquipment,
  setHealthStatus,
  setErrorMessage
}: {
  setEquipment: (records: EquipmentRecord[]) => void;
  setHealthStatus: (status: "unknown" | "ok" | "degraded") => void;
  setErrorMessage: (message: string | null) => void;
}): Promise<void> {
  try {
    const [equipmentResponse, healthResponse] = await Promise.all([fetchEquipment(), fetchHealth()]);
    startTransition(() => {
      setEquipment(equipmentResponse.data);
      setHealthStatus(healthResponse.status);
      setErrorMessage(null);
    });
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

async function refreshEquipment(
  setEquipment: (records: EquipmentRecord[]) => void,
  setErrorMessage: (message: string | null) => void
): Promise<void> {
  try {
    const response = await fetchEquipment();
    setEquipment(response.data);
    setErrorMessage(null);
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

async function refreshHealth(
  setHealthStatus: (status: "unknown" | "ok" | "degraded") => void,
  setErrorMessage: (message: string | null) => void
): Promise<void> {
  try {
    const response = await fetchHealth();
    setHealthStatus(response.status);
    setErrorMessage(null);
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

function parseEventPayload(event: MessageEvent<string>): Record<string, unknown> {
  return JSON.parse(event.data) as Record<string, unknown>;
}

function readMetric(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function formatMetric(value: number | null, unit: string): string {
  return value === null ? "Unavailable" : `${value} ${unit}`;
}

function formatBoolean(value: unknown): string {
  return typeof value === "boolean" ? (value ? "Running" : "Stopped") : "Unavailable";
}

function formatCommandStatus(status: string | null): string {
  switch (status) {
    case "accepted":
      return "Command accepted";
    case "encoded":
      return "Command encoded";
    case "transmitted":
      return "Command transmitted";
    case "completed":
      return "Command completed";
    case "timed_out":
      return "Command timed out";
    case "failed":
      return "Command failed";
    default:
      return "Command idle";
  }
}
