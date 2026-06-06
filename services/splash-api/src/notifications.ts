import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database.js";
import type { ChemistryReadingRecord } from "./chemistry-readings.js";
import type { PoolCoverCurrentView } from "./pool-cover-events.js";
import type { SwimmabilityView } from "./swimmability.js";
import type { TemperatureLatestView } from "./temperature-telemetry.js";
import type { WeatherForecastView } from "./weather-forecast.js";
import type { WaterTestingFreshnessView } from "./water-testing-schedule.js";

export type NotificationType =
  | "chemistry_test_due"
  | "swimmability_caution"
  | "swimmability_poor"
  | "rain_since_test"
  | "chemistry_value_stale"
  | "chemistry_value_unavailable";

export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationStatusFilter = "unread" | "all";

export interface NotificationRecord {
  id: string;
  pool_id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  read: boolean;
  source: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
  read_at: string | null;
}

export interface NotificationsView {
  status: NotificationStatusFilter;
  limit: number;
  notifications: NotificationRecord[];
}

export interface NotificationsReadAllResult {
  updated_count: number;
}

export interface NotificationsContext {
  chemistry: ChemistryReadingRecord | null;
  chemistryPromptIntervalDays: number;
  swimmability: SwimmabilityView;
  rainfallSinceChemistryInches: number | null;
  cover: PoolCoverCurrentView;
  forecast: WeatherForecastView;
  latestTemperatures: TemperatureLatestView;
  freshness: WaterTestingFreshnessView;
  now?: string;
}

export interface NotificationQueryInput {
  status: string | null;
  limit: string | null;
  type: string | null;
}

interface NotificationTemplate {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
}

interface StoredNotificationRow extends Record<string, unknown> {
  id: string;
  pool_id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  read: number;
  source: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
  read_at: string | null;
}

const NOTIFICATION_TYPES: readonly NotificationType[] = [
  "chemistry_test_due",
  "swimmability_caution",
  "swimmability_poor",
  "rain_since_test",
  "chemistry_value_stale",
  "chemistry_value_unavailable"
];

const SIGNIFICANT_RAINFALL_INCHES = 0.25;
const DEFAULT_NOTIFICATION_LIMIT = 50;
const MAX_NOTIFICATION_LIMIT = 200;

export class NotificationsValidationError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string>
  ) {
    super(message);
    this.name = "NotificationsValidationError";
  }
}

export class NotificationsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationsUnavailableError";
  }
}

export class NotificationsService {
  constructor(
    private readonly poolId: string,
    private readonly database: SqliteDatabase | null
  ) {}

  async getNotifications(input: NotificationQueryInput, context: NotificationsContext): Promise<NotificationsView> {
    const database = this.requireDatabase();
    const query = validateNotificationQueryInput(input);
    this.syncActiveNotifications(database, context);

    const clauses = ["pool_id = ?"];
    const params: unknown[] = [this.poolId];

    if (query.status === "unread") {
      clauses.push("read = 0");
    }
    if (query.type) {
      clauses.push("type = ?");
      params.push(query.type);
    }

    params.push(query.limit);
    const rows = database.all<StoredNotificationRow>(
      `
        SELECT id, pool_id, type, severity, title, body, read, source, related_entity_type, related_entity_id, created_at, read_at
        FROM notifications
        WHERE ${clauses.join(" AND ")}
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `,
      params
    );

    return {
      status: query.status,
      limit: query.limit,
      notifications: rows.map(mapNotificationRow)
    };
  }

  async markNotificationRead(id: string): Promise<NotificationRecord | null> {
    const database = this.requireDatabase();
    const normalizedId = validateNotificationId(id);
    database.run(
      `
        UPDATE notifications
        SET read = 1,
            read_at = COALESCE(read_at, ?)
        WHERE id = ?
          AND pool_id = ?
      `,
      [new Date().toISOString(), normalizedId, this.poolId]
    );

    const row = database.get<StoredNotificationRow>(
      `
        SELECT id, pool_id, type, severity, title, body, read, source, related_entity_type, related_entity_id, created_at, read_at
        FROM notifications
        WHERE id = ?
          AND pool_id = ?
      `,
      [normalizedId, this.poolId]
    );

    return row ? mapNotificationRow(row) : null;
  }

  async markAllNotificationsRead(): Promise<NotificationsReadAllResult> {
    const database = this.requireDatabase();
    const before = database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM notifications WHERE pool_id = ? AND read = 0",
      [this.poolId]
    );

    database.run(
      `
        UPDATE notifications
        SET read = 1,
            read_at = COALESCE(read_at, ?)
        WHERE pool_id = ?
          AND read = 0
      `,
      [new Date().toISOString(), this.poolId]
    );

    return {
      updated_count: before?.count ?? 0
    };
  }

  async refresh(context: NotificationsContext): Promise<void> {
    const database = this.requireDatabase();
    this.syncActiveNotifications(database, context);
  }

  private syncActiveNotifications(database: SqliteDatabase, context: NotificationsContext): void {
    const activeNotifications = buildNotificationTemplates(context);
    const activeSignatures = new Set(activeNotifications.map((notification) => notificationSignature(notification)));

    database.transaction(() => {
      const existingRows = database.all<StoredNotificationRow>(
        `
          SELECT id, pool_id, type, severity, title, body, read, source, related_entity_type, related_entity_id, created_at, read_at
          FROM notifications
          WHERE pool_id = ?
            AND source = 'system'
            AND type IN (${NOTIFICATION_TYPES.map(() => "?").join(", ")})
        `,
        [this.poolId, ...NOTIFICATION_TYPES]
      );

      const existingBySignature = new Map<string, StoredNotificationRow>();
      for (const row of existingRows) {
        existingBySignature.set(notificationSignatureFromRow(row), row);
      }

      for (const row of existingRows) {
        if (!activeSignatures.has(notificationSignatureFromRow(row)) && row.read === 0) {
          database.run("DELETE FROM notifications WHERE id = ?", [row.id]);
        }
      }

      for (const notification of activeNotifications) {
        const signature = notificationSignature(notification);
        const existing = existingBySignature.get(signature);
        if (existing) {
          if (
            existing.severity !== notification.severity
            || existing.title !== notification.title
            || existing.body !== notification.body
          ) {
            database.run(
              `
                UPDATE notifications
                SET severity = ?,
                    title = ?,
                    body = ?
                WHERE id = ?
              `,
              [notification.severity, notification.title, notification.body, existing.id]
            );
          }
          continue;
        }

        database.run(
          `
            INSERT INTO notifications (
              id,
              pool_id,
              type,
              severity,
              title,
              body,
              read,
              source,
              related_entity_type,
              related_entity_id,
              created_at,
              read_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 0, 'system', ?, ?, ?, NULL)
          `,
          [
            randomUUID(),
            this.poolId,
            notification.type,
            notification.severity,
            notification.title,
            notification.body,
            notification.relatedEntityType,
            notification.relatedEntityId,
            context.now ?? new Date().toISOString()
          ]
        );
      }
    });
  }

  private requireDatabase(): SqliteDatabase {
    if (!this.database) {
      throw new NotificationsUnavailableError("SQLite-backed notifications are not configured.");
    }
    return this.database;
  }
}

export function validateNotificationQueryInput(input: NotificationQueryInput): {
  status: NotificationStatusFilter;
  limit: number;
  type: NotificationType | null;
} {
  const details: Record<string, string> = {};
  const status = input.status ?? "unread";
  const normalizedStatus = status === "unread" || status === "all" ? status : null;
  if (!normalizedStatus) {
    details.status = "Status must be either 'unread' or 'all'.";
  }

  let normalizedLimit = DEFAULT_NOTIFICATION_LIMIT;
  if (input.limit != null) {
    const parsed = Number.parseInt(input.limit, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      details.limit = "Limit must be a positive integer.";
    } else {
      normalizedLimit = Math.min(parsed, MAX_NOTIFICATION_LIMIT);
    }
  }

  let normalizedType: NotificationType | null = null;
  if (input.type != null && input.type.length > 0) {
    normalizedType = isNotificationType(input.type) ? input.type : null;
    if (!normalizedType) {
      details.type = "Type must be one of the supported notification types.";
    }
  }

  if (Object.keys(details).length > 0) {
    throw new NotificationsValidationError("Notification query is invalid.", details);
  }

  return {
    status: normalizedStatus ?? "unread",
    limit: normalizedLimit,
    type: normalizedType
  };
}

function validateNotificationId(input: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new NotificationsValidationError("Notification id is invalid.", {
      id: "Notification id must be a non-empty string."
    });
  }

  return input.trim();
}

function buildNotificationTemplates(context: NotificationsContext): NotificationTemplate[] {
  const notifications: NotificationTemplate[] = [];

  if (!context.chemistry) {
    notifications.push({
      type: "chemistry_test_due",
      severity: "warning",
      title: "Chemistry test is due",
      body: "No chemistry reading has been logged yet. Record a water test to improve pool guidance.",
      relatedEntityType: "chemistry_reading",
      relatedEntityId: "missing"
    });
  } else {
    const hoursSinceChemistry = Math.max(0, (Date.parse(context.now ?? new Date().toISOString()) - Date.parse(context.chemistry.recorded_at)) / (60 * 60 * 1000));
    const promptThresholdHours = context.chemistryPromptIntervalDays * 24;
    if (hoursSinceChemistry >= promptThresholdHours) {
      notifications.push({
        type: "chemistry_test_due",
        severity: "warning",
        title: "Chemistry test is due",
        body: "The latest chemistry reading is older than the configured testing interval.",
        relatedEntityType: "chemistry_reading",
        relatedEntityId: context.chemistry.id
      });
    }

    if ((context.rainfallSinceChemistryInches ?? 0) >= SIGNIFICANT_RAINFALL_INCHES) {
      notifications.push({
        type: "rain_since_test",
        severity: "warning",
        title: "Rain has fallen since the last chemistry test",
        body: `About ${formatRainfall(context.rainfallSinceChemistryInches)} of rain has fallen since the latest chemistry reading. Retest before relying on older chlorine values.`,
        relatedEntityType: "chemistry_reading",
        relatedEntityId: context.chemistry.id
      });
    }
  }

  if (context.swimmability.status === "caution") {
    notifications.push({
      type: "swimmability_caution",
      severity: "warning",
      title: "Swimmability needs attention",
      body: context.swimmability.summary,
      relatedEntityType: "swimmability",
      relatedEntityId: buildSwimmabilitySignature(context)
    });
  } else if (context.swimmability.status === "poor") {
    notifications.push({
      type: "swimmability_poor",
      severity: "critical",
      title: "Swimmability is poor",
      body: context.swimmability.summary,
      relatedEntityType: "swimmability",
      relatedEntityId: buildSwimmabilitySignature(context)
    });
  }

  for (const item of context.freshness.items) {
    if (!item.enabled || item.status === "current" || item.status === "disabled") {
      continue;
    }

    const type: NotificationType =
      item.status === "stale" ? "chemistry_value_stale" : "chemistry_value_unavailable";
    const intervalLabel = formatInterval(item.staleThresholdValue, item.staleThresholdUnit);
    const lastObservedText = item.lastObservedAt
      ? ` Last observed at ${item.lastObservedAt}.`
      : " No recent observation is available.";

    notifications.push({
      type,
      severity: severityForFreshness(item.chemicalKey, item.status),
      title:
        item.status === "stale"
          ? `${item.displayName} test is stale`
          : `${item.displayName} is unavailable`,
      body:
        item.status === "stale"
          ? `${item.displayName} is older than the configured ${intervalLabel} testing interval.${lastObservedText}`
          : `${item.displayName} is currently unavailable under the configured testing schedule.${lastObservedText}`,
      relatedEntityType: "water_testing_schedule",
      relatedEntityId: `${item.chemicalKey}:${item.status}`
    });
  }

  return notifications;
}

function buildSwimmabilitySignature(context: NotificationsContext): string {
  return [
    context.swimmability.status,
    context.chemistry?.id ?? "none",
    context.cover.current?.id ?? "none",
    context.forecast.fetched_at ?? "none",
    context.latestTemperatures.last_updated ?? "none"
  ].join("|");
}

function mapNotificationRow(row: StoredNotificationRow): NotificationRecord {
  return {
    id: row.id,
    pool_id: row.pool_id,
    type: normalizeNotificationType(row.type),
    severity: normalizeNotificationSeverity(row.severity),
    title: row.title,
    body: row.body,
    read: row.read === 1,
    source: row.source,
    related_entity_type: row.related_entity_type,
    related_entity_id: row.related_entity_id,
    created_at: row.created_at,
    read_at: row.read_at
  };
}

function notificationSignature(template: NotificationTemplate): string {
  return [template.type, template.relatedEntityType ?? "", template.relatedEntityId ?? ""].join("|");
}

function severityForFreshness(
  chemicalKey: string,
  status: "stale" | "unavailable"
): NotificationSeverity {
  if (chemicalKey === "free_chlorine" || chemicalKey === "ph") {
    return "warning";
  }
  if (chemicalKey === "water_temperature" && status === "unavailable") {
    return "warning";
  }
  return "info";
}

function formatInterval(value: number, unit: "hours" | "days"): string {
  const singular = unit === "hours" ? "hour" : "day";
  return `${value} ${value === 1 ? singular : unit}`;
}

function notificationSignatureFromRow(row: StoredNotificationRow): string {
  return [normalizeNotificationType(row.type), row.related_entity_type ?? "", row.related_entity_id ?? ""].join("|");
}

function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

function normalizeNotificationType(value: string): NotificationType {
  return isNotificationType(value) ? value : "chemistry_test_due";
}

function normalizeNotificationSeverity(value: string): NotificationSeverity {
  if (value === "info" || value === "warning" || value === "critical") {
    return value;
  }
  return "warning";
}

function formatRainfall(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "recent";
  }
  return `${value.toFixed(value >= 1 ? 1 : 2)} in`;
}
