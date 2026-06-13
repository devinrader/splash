import type {
  NotificationRecord,
  PoolCoverCurrentData,
  PoolCoverEventRecord,
  SwimmabilityConfidence,
  SwimmabilityDriver,
  SwimmabilityStatus
} from "../types";

export function formatSwimmabilityStatus(status: SwimmabilityStatus): string {
  switch (status) {
    case "good":
      return "Good";
    case "caution":
      return "Use Caution";
    case "poor":
      return "Poor";
    default:
      return "Unknown";
  }
}

export function formatSwimmabilityConfidence(confidence: SwimmabilityConfidence): string {
  switch (confidence) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "Unknown";
  }
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function summarizeTopReasons(drivers: SwimmabilityDriver[] | undefined, limit = 2): string[] {
  return (drivers ?? [])
    .filter((driver) => driver.message.trim().length > 0)
    .slice(0, limit)
    .map((driver) => driver.message);
}

export function sortNotificationsUnreadFirst(notifications: NotificationRecord[]): NotificationRecord[] {
  return [...notifications].sort((left, right) => {
    if (left.read !== right.read) {
      return left.read ? 1 : -1;
    }
    return Date.parse(right.created_at) - Date.parse(left.created_at);
  });
}

export function formatCoverState(current: PoolCoverCurrentData["current"]): string {
  if (!current) {
    return "Unknown";
  }
  return current.state === "on" ? "Covered" : "Open";
}

export function formatCoverType(current: PoolCoverCurrentData["current"] | PoolCoverEventRecord["cover_type"]): string {
  const value = typeof current === "string" ? current : current?.cover_type;
  switch (value) {
    case "solar":
      return "Solar";
    case "winter":
      return "Winter";
    case "safety":
      return "Safety";
    case "automatic":
      return "Automatic";
    case "unknown":
      return "Unknown";
    default:
      return "Unknown";
  }
}
