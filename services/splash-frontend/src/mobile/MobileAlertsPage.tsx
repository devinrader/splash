import { useEffect, useState } from "react";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "../api";
import type { NotificationRecord } from "../types";
import { formatTimestamp, sortNotificationsUnreadFirst } from "./mobileUtils";

export function MobileAlertsPage() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void refreshNotifications();
  }, []);

  async function refreshNotifications() {
    setLoading(true);
    try {
      const response = await fetchNotifications({ status: "all", limit: 20 });
      setNotifications(sortNotificationsUnreadFirst(response.data.notifications));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    await refreshNotifications();
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    await refreshNotifications();
  }

  return (
    <div className="mobile-stack">
      <section className="mobile-card">
        <div className="mobile-card-header">
          <strong>Alerts</strong>
          <button type="button" className="mobile-inline-action" onClick={() => void handleMarkAllRead()}>
            Mark all read
          </button>
        </div>
        {loading ? <p className="mobile-muted">Loading alerts…</p> : null}
        {errorMessage ? <p className="mobile-error">{errorMessage}</p> : null}
        {!loading && !notifications.length ? <p className="mobile-muted">No alerts right now.</p> : null}
        {notifications.length ? (
          <ul className="mobile-list mobile-alert-list">
            {notifications.map((notification) => (
              <li key={notification.id} className={`mobile-alert-item mobile-alert-${notification.severity}`}>
                <div className="mobile-card-header">
                  <strong>{notification.title}</strong>
                  <span>{notification.read ? "Read" : "Active"}</span>
                </div>
                <p>{notification.body}</p>
                <div className="mobile-meta-row">
                  <span>{formatTimestamp(notification.created_at)}</span>
                  {!notification.read ? (
                    <button type="button" className="mobile-inline-action" onClick={() => void handleMarkRead(notification.id)}>
                      Acknowledge
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
