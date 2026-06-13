import { useEffect, useState } from "react";
import { fetchCurrentPoolCover, fetchNotifications, fetchSwimmability } from "../api";
import type { NotificationsData, PoolCoverCurrentData, SwimmabilityData } from "../types";
import {
  formatCoverState,
  formatCoverType,
  formatSwimmabilityConfidence,
  formatSwimmabilityStatus,
  formatTimestamp,
  sortNotificationsUnreadFirst,
  summarizeTopReasons
} from "./mobileUtils";

export function MobileHomePage() {
  const [swimmability, setSwimmability] = useState<SwimmabilityData | null>(null);
  const [cover, setCover] = useState<PoolCoverCurrentData | null>(null);
  const [notifications, setNotifications] = useState<NotificationsData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [swimmabilityResponse, coverResponse, notificationsResponse] = await Promise.all([
          fetchSwimmability(),
          fetchCurrentPoolCover(),
          fetchNotifications({ status: "all", limit: 6 })
        ]);
        if (cancelled) {
          return;
        }
        setSwimmability(swimmabilityResponse.data);
        setCover(coverResponse.data);
        setNotifications(notificationsResponse.data);
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const topReasons = summarizeTopReasons(swimmability?.drivers);
  const unreadNotifications = sortNotificationsUnreadFirst(notifications?.notifications ?? []).slice(0, 3);

  return (
    <div className="mobile-stack">
      <section className="mobile-card mobile-card-score" aria-label="Current swimmability">
        <span className="mobile-eyebrow">Swimmability</span>
        <strong className={`mobile-score mobile-score-${swimmability?.status ?? "unknown"}`}>
          {swimmability?.score ?? "—"}
        </strong>
        <h2>{formatSwimmabilityStatus(swimmability?.status ?? "unknown")}</h2>
        <p>{swimmability?.headline ?? "Current assessment unavailable."}</p>
        <div className="mobile-meta-row">
          <span>{formatSwimmabilityConfidence(swimmability?.confidence ?? "unknown")} confidence</span>
          <span>{formatTimestamp(swimmability?.updated_at)}</span>
        </div>
        {topReasons.length ? (
          <ul className="mobile-list">
            {topReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {errorMessage ? <p className="mobile-error">{errorMessage}</p> : null}
      </section>

      <section className="mobile-card">
        <div className="mobile-card-header">
          <strong>Cover</strong>
          <span>{formatCoverState(cover?.current ?? null)}</span>
        </div>
        <div className="mobile-meta-row">
          <span>{formatCoverType(cover?.current ?? null)}</span>
          <span>{formatTimestamp(cover?.current?.recorded_at)}</span>
        </div>
      </section>

      <section className="mobile-card">
        <div className="mobile-card-header">
          <strong>Alerts</strong>
          <span>{unreadNotifications.length}</span>
        </div>
        {unreadNotifications.length ? (
          <ul className="mobile-list">
            {unreadNotifications.map((notification) => (
              <li key={notification.id}>
                <strong>{notification.title}</strong>
                <span>{notification.body}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mobile-muted">No active alerts right now.</p>
        )}
      </section>
    </div>
  );
}
