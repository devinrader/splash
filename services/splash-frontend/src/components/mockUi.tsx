import type React from "react";
import { SplashIcon, type SplashIconName } from "./icons/SplashIcon";

export function MetricCard({
  label,
  value,
  accent,
  icon
}: {
  label: string;
  value: string;
  accent: "sky" | "water" | "sand" | "pump";
  icon: SplashIconName;
}) {
  return (
    <article className={`metric-card metric-card-${accent}`}>
      <div className="metric-card-header">
        <span className="metric-card-icon">
          <SplashIcon name={icon} size={18} />
        </span>
        <p>{label}</p>
      </div>
      <strong>{value}</strong>
    </article>
  );
}

export function CardHeading({ icon, title }: { icon: SplashIconName; title: string }) {
  return (
    <div className="card-heading">
      <span className="card-heading-icon">
        <SplashIcon name={icon} size={18} />
      </span>
      <h3>{title}</h3>
    </div>
  );
}

export function Card({
  title,
  status,
  className,
  children
}: {
  title: string;
  status?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`app-card${className ? ` ${className}` : ""}`}>
      <header className="app-card-header">
        <h3>{title}</h3>
        {status ? <span className="app-card-status">{status}</span> : null}
      </header>
      <div className="app-card-body">{children}</div>
    </article>
  );
}

export function MockEntityRow({
  badge,
  badgeTone,
  title,
  summary,
  statusLabel,
  statusTone,
  actionLabel,
  onAction
}: {
  badge: string;
  badgeTone: "hardware" | "software";
  title: string;
  summary: string;
  statusLabel: string;
  statusTone: "good" | "muted";
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <div className="mock-entity-row">
      <div className={`mock-surface-icon mock-surface-icon-${badgeTone}`}>{badge}</div>
      <div className="mock-entity-main">
        <strong>{title}</strong>
        <span>{summary}</span>
      </div>
      <div className="mock-entity-actions">
        <span className={`system-status-chip ${statusTone === "good" ? "system-status-chip-good" : "system-status-chip-muted"}`}>
          {statusLabel}
        </span>
        {onAction ? (
          <button className="mock-link-button" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : (
          <span className="mock-link-label">{actionLabel}</span>
        )}
      </div>
    </div>
  );
}

export function MockModeRow({ title, summary, active }: { title: string; summary: string; active: boolean }) {
  return (
    <div className="mock-mode-row">
      <div>
        <strong>{title}</strong>
        <span>{summary}</span>
      </div>
      <button className={active ? "mock-mode-button mock-mode-button-active" : "mock-mode-button"} type="button">
        {active ? "Active" : "Activate"}
      </button>
    </div>
  );
}

export function NetworkTab() {
  return (
    <section className="network-grid" aria-label="Network diagnostics cards">
      <Card title="Network Overview" status="Placeholder" className="network-card-overview">
        <div className="network-topology">
          <div className="network-topology-box">Controller</div>
          <div className="network-topology-box">RS485 Bus</div>
          <div className="network-topology-box">Event Bus</div>
          <div className="network-topology-box">Wi-Fi / Ethernet</div>
        </div>
      </Card>
      <Card title="Network Statistics" status="Placeholder" className="network-card-statistics">
        <dl className="network-stat-list">
          <div><dt>Messages Sent</dt><dd>--</dd></div>
          <div><dt>Messages Received</dt><dd>--</dd></div>
          <div><dt>Errors</dt><dd>--</dd></div>
          <div><dt>Throughput</dt><dd>--</dd></div>
          <div><dt>Latency</dt><dd>--</dd></div>
        </dl>
      </Card>
      <Card title="RS485 Bus" status="Placeholder" className="network-card-rs485">
        <dl className="network-stat-list">
          <div><dt>Status</dt><dd>Unknown</dd></div>
          <div><dt>Baud Rate</dt><dd>--</dd></div>
          <div><dt>Device count</dt><dd>--</dd></div>
          <div><dt>Error count</dt><dd>--</dd></div>
        </dl>
      </Card>
      <Card title="Event Bus" status="Placeholder" className="network-card-event-bus">
        <dl className="network-stat-list">
          <div><dt>Status</dt><dd>Unknown</dd></div>
          <div><dt>Subscribers</dt><dd>--</dd></div>
          <div><dt>Publishers</dt><dd>--</dd></div>
          <div><dt>Queue depth</dt><dd>--</dd></div>
        </dl>
      </Card>
      <Card title="Network Interfaces" status="Placeholder" className="network-card-interfaces">
        <table className="network-interface-table">
          <thead>
            <tr><th>Interface name</th><th>IP address</th><th>Status</th><th>Activity</th></tr>
          </thead>
          <tbody>
            <tr><td>eth0</td><td>--</td><td>Unknown</td><td>--</td></tr>
            <tr><td>wlan0</td><td>--</td><td>Unknown</td><td>--</td></tr>
          </tbody>
        </table>
      </Card>
    </section>
  );
}
