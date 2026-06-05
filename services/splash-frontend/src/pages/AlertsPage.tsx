import { useEffect, useState } from "react";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "../api";
import { Card } from "../components/mockUi";
import type {
  NotificationRecord,
  NotificationStatusFilter,
  NotificationType
} from "../types";

const NOTIFICATION_TYPE_OPTIONS: Array<{ value: NotificationType | "all"; label: string }> = [
  { value: "all", label: "All types" },
  { value: "chemistry_test_due", label: "Chemistry test due" },
  { value: "swimmability_caution", label: "Swimmability caution" },
  { value: "swimmability_poor", label: "Swimmability poor" },
  { value: "rain_since_test", label: "Rain since test" }
];

export function AlertsPage() {
  const [statusFilter, setStatusFilter] = useState<NotificationStatusFilter>("unread");
  const [typeFilter, setTypeFilter] = useState<NotificationType | "all">("all");
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadNotifications({
      statusFilter,
      typeFilter,
      setLoading,
      setNotifications,
      setErrorMessage,
      cancelledRef: () => cancelled
    });

    return () => {
      cancelled = true;
    };
  }, [statusFilter, typeFilter]);

  async function handleMarkRead(id: string) {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await markNotificationRead(id);
      await reloadCurrentFilters();
      setSuccessMessage("Alert marked as read.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkAllRead() {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await markAllNotificationsRead();
      await reloadCurrentFilters();
      setSuccessMessage(
        response.data.updated_count === 0
          ? "No unread alerts needed updating."
          : `Marked ${response.data.updated_count} alert${response.data.updated_count === 1 ? "" : "s"} as read.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function reloadCurrentFilters() {
    const response = await fetchNotifications({
      status: statusFilter,
      type: typeFilter
    });
    setNotifications(response.data.notifications);
  }

  return (
    <section className="automation-shell">
      <div className="automation-grid alerts-grid">
        <Card title="Alert Filters" className="alerts-filters-card">
          <div className="settings-form-grid">
            <label className="settings-field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as NotificationStatusFilter)}
                disabled={loading || saving}
              >
                <option value="unread">Unread</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Type</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as NotificationType | "all")}
                disabled={loading || saving}
              >
                {NOTIFICATION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="settings-actions">
            <button type="button" onClick={() => void handleMarkAllRead()} disabled={loading || saving || notifications.length === 0}>
              {saving ? "Saving…" : "Mark all read"}
            </button>
          </div>

          {errorMessage ? <p className="settings-message settings-message-error">{errorMessage}</p> : null}
          {successMessage ? <p className="settings-message settings-message-success">{successMessage}</p> : null}
        </Card>

        <Card title="Inbox" className="alerts-inbox-card">
          {loading ? <p className="chart-empty-state">Loading alerts…</p> : null}
          {!loading && notifications.length === 0 ? (
            <p className="chart-empty-state">
              {statusFilter === "unread" ? "No unread alerts are active right now." : "No alerts have been recorded yet."}
            </p>
          ) : null}
          {!loading && notifications.length > 0 ? (
            <div className="alerts-list" aria-label="alerts inbox">
              {notifications.map((notification) => (
                <article className={`alerts-item alerts-item-${notification.severity}`} key={notification.id}>
                  <div className="alerts-item-header">
                    <div className="alerts-item-copy">
                      <span className={`alerts-severity alerts-severity-${notification.severity}`}>
                        {formatSeverity(notification.severity)}
                      </span>
                      <strong>{notification.title}</strong>
                    </div>
                    <span className="alerts-item-time">{formatTimestamp(notification.created_at)}</span>
                  </div>
                  <p className="panel-copy">{notification.body}</p>
                  <div className="alerts-item-footer">
                    <span>{notification.read ? "Read" : "Unread"}</span>
                    {!notification.read ? (
                      <button type="button" className="secondary-button" onClick={() => void handleMarkRead(notification.id)} disabled={saving}>
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </section>
  );
}

async function loadNotifications({
  statusFilter,
  typeFilter,
  setLoading,
  setNotifications,
  setErrorMessage,
  cancelledRef
}: {
  statusFilter: NotificationStatusFilter;
  typeFilter: NotificationType | "all";
  setLoading: (value: boolean) => void;
  setNotifications: (value: NotificationRecord[]) => void;
  setErrorMessage: (value: string | null) => void;
  cancelledRef: () => boolean;
}) {
  setLoading(true);
  try {
    const response = await fetchNotifications({
      status: statusFilter,
      type: typeFilter
    });
    if (cancelledRef()) {
      return;
    }
    setNotifications(response.data.notifications);
    setErrorMessage(null);
  } catch (error) {
    if (cancelledRef()) {
      return;
    }
    setErrorMessage(error instanceof Error ? error.message : String(error));
  } finally {
    if (!cancelledRef()) {
      setLoading(false);
    }
  }
}

function formatSeverity(severity: NotificationRecord["severity"]): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "warning":
      return "Warning";
    case "info":
      return "Info";
    default:
      return severity;
  }
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}
