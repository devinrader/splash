import { randomUUID } from "node:crypto";
import { EquipmentBridge } from "./bridge.js";
import {
  defaultGeocodingConfig,
  defaultPoolSite,
  defaultWeatherProviderConfig,
  loadConfig,
  type ApiConfig
} from "./config.js";
import { createSqliteDatabase, DatabaseMigrator, type SqliteDatabase } from "./database.js";
import { EventBroker } from "./events.js";
import { LocalHttpServer, type HttpServer } from "./http.js";
import { createLogger, type Logger } from "./logger.js";
import type { MessagingSession } from "./messaging.js";
import { NatsSupervisor } from "./nats.js";
import {
  ProtocolAnnotationStore,
  type ProtocolAnnotation,
  type ProtocolAnnotationInput
} from "./protocol-annotations.js";
import {
  ProtocolPromptStore,
  type ProtocolPrompt,
  type ProtocolPromptInput
} from "./protocol-prompts.js";
import {
  type ProtocolBundleComparison,
  ProtocolFrameBundleStore,
  type ProtocolFrameBundle,
  type ProtocolFrameBundleSummary,
  type ProtocolWatchSession,
  type ProtocolWatchSessionSummary
} from "./protocol-bundles.js";
import { LatestStateProjection } from "./state.js";
import { NatsVarzMonitor, RollingMessageRate } from "./rates.js";
import {
  computeOverallStatus,
  type CanonicalServiceStatus,
  type PlatformServiceRecord,
  PlatformHealthMonitor,
  type PlatformStatusSnapshot,
  type ServiceCheckResult,
  type ServiceDefinition
} from "./platform-health.js";
import {
  TemperatureTelemetryService,
  type TemperatureHistoryQuery
} from "./temperature-telemetry.js";
import {
  PumpTelemetryService,
  type PumpHistoryQuery
} from "./pump-telemetry.js";
import {
  WeatherForecastService,
  type WeatherHistoryView,
  type WeatherHistoryMetric
} from "./weather-forecast.js";
import {
  SqliteWeatherLocationSettingsRepository,
  WeatherLocationSettingsService,
  type WeatherLocationSettings
} from "./weather-location-settings.js";
import { createGeocodingProviderRegistry } from "./geocoding.js";
import {
  GeocodingSettingsService,
  SqliteGeocodingSettingsRepository,
  type GeocodingSettingsView
} from "./geocoding-settings.js";
import {
  PoolChemistrySettingsService,
  SqlitePoolChemistrySettingsRepository,
  type PoolChemistryRecommendationBounds,
  type PoolChemistrySettingsView
} from "./pool-chemistry-settings.js";
import {
  ChemistryReadingsService,
  SqliteChemistryReadingsRepository,
  type ChemistryHistoryQueryInput,
  type ChemistryHistoryView,
  type ChemistryReadingCreateResult,
  type ChemistryReadingRecord
} from "./chemistry-readings.js";
import {
  PoolCoverEventsService,
  SqlitePoolCoverEventsRepository,
  type PoolCoverCurrentView,
  type PoolCoverEventRecord,
  type PoolCoverHistoryQueryInput,
  type PoolCoverHistoryView
} from "./pool-cover-events.js";
import {
  NotificationsService,
  type NotificationRecord,
  type NotificationsReadAllResult,
  type NotificationsView
} from "./notifications.js";
import { buildSwimmabilityView, type SwimmabilityView } from "./swimmability.js";
import {
  WaterTestingScheduleService,
  SqliteWaterTestingScheduleRepository,
  evaluateWaterTestingFreshness,
  type WaterTestingScheduleStatusView,
  type WaterTestingFreshnessView
} from "./water-testing-schedule.js";

export interface AppOptions {
  config?: ApiConfig;
  logger?: Logger;
  httpServer?: HttpServer;
  fetchImpl?: typeof fetch;
  tcpProbe?: (host: string, port: number, timeoutMs: number) => Promise<void>;
  temperatureTelemetry?: TemperatureTelemetryService;
  pumpTelemetry?: PumpTelemetryService;
  weatherForecast?: WeatherForecastService;
  weatherLocationSettings?: WeatherLocationSettingsService;
  geocodingSettings?: GeocodingSettingsService;
  poolChemistrySettings?: PoolChemistrySettingsService;
  chemistryReadings?: ChemistryReadingsService;
  poolCoverEvents?: PoolCoverEventsService;
  notifications?: NotificationsService;
  waterTestingSchedule?: WaterTestingScheduleService;
}

interface ControllerScheduleUpdateInput {
  scheduleId: number;
  mode: "repeat" | "egg_timer";
  circuitId: number;
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  daysMask?: number;
  runtimeMinutes?: number;
}

interface ControllerHeaterConfigurationUpdateInput {
  heaterType: "ultratempHeatPumpCom" | "ultratempEtiHybrid";
  coolingEnabled: boolean;
  freezeProtectionEnabled: boolean;
}

interface ControllerHeaterSettingsUpdateInput {
  poolSetpoint: number;
  spaSetpoint: number;
  poolHeatMode: 0 | 1 | 2 | 3;
  spaHeatMode: 0 | 1 | 2 | 3;
  coolSetpoint: number;
}

const COMMAND_WAIT_TIMEOUT_MS = 8000;

export class App {
  private readonly config: ApiConfig;
  private readonly logger: Logger;
  private readonly bridge = new EquipmentBridge();
  private readonly projection = new LatestStateProjection();
  private readonly events = new EventBroker();
  private readonly protocolFrames = new EventBroker();
  private readonly protocolFrameBundles = new ProtocolFrameBundleStore();
  private readonly protocolAnnotations = new ProtocolAnnotationStore();
  private readonly protocolPrompts = new ProtocolPromptStore();
  private readonly serialRxRate = new RollingMessageRate();
  private readonly serialTxRate = new RollingMessageRate();
  private readonly natsVarzMonitor: NatsVarzMonitor;
  private readonly platformHealthMonitor: PlatformHealthMonitor;
  private readonly temperatureTelemetry: TemperatureTelemetryService;
  private readonly pumpTelemetry: PumpTelemetryService;
  private readonly weatherForecast: WeatherForecastService;
  private readonly weatherLocationSettings: WeatherLocationSettingsService;
  private readonly geocodingSettings: GeocodingSettingsService;
  private readonly poolChemistrySettings: PoolChemistrySettingsService;
  private readonly chemistryReadings: ChemistryReadingsService;
  private readonly poolCoverEvents: PoolCoverEventsService;
  private readonly notifications: NotificationsService;
  private readonly waterTestingSchedule: WaterTestingScheduleService;
  private readonly sqliteDatabase: SqliteDatabase | null;
  private readonly nats: NatsSupervisor;
  private readonly httpServer?: HttpServer;
  private readonly commandWaiters = new Map<string, Array<(payload: Record<string, unknown>) => void>>();

  constructor(options: AppOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.logger = options.logger ?? createLogger();
    this.httpServer = options.httpServer;
    this.natsVarzMonitor = new NatsVarzMonitor({
      monitoringUrl: this.config.natsMonitoringUrl,
      fetchImpl: options.fetchImpl
    });
    this.temperatureTelemetry =
      options.temperatureTelemetry ??
      new TemperatureTelemetryService({
        influx: this.config.influx,
        fetchImpl: options.fetchImpl
      });
    this.pumpTelemetry =
      options.pumpTelemetry ??
      new PumpTelemetryService({
        influx: this.config.influx,
        fetchImpl: options.fetchImpl
      });
    this.sqliteDatabase = this.config.sqlite ? createSqliteDatabase(this.config.sqlite) : null;
    const geocodingRegistry = createGeocodingProviderRegistry(
      this.config.geocoding ?? defaultGeocodingConfig(),
      options.fetchImpl
    );
    this.geocodingSettings =
      options.geocodingSettings ??
      new GeocodingSettingsService(
        this.config.poolId,
        this.sqliteDatabase ? new SqliteGeocodingSettingsRepository(this.sqliteDatabase) : null,
        geocodingRegistry
      );
    this.weatherLocationSettings =
      options.weatherLocationSettings ??
      new WeatherLocationSettingsService(
        this.config.poolId,
        this.sqliteDatabase ? new SqliteWeatherLocationSettingsRepository(this.sqliteDatabase) : null,
        this.geocodingSettings,
        this.logger
      );
    this.weatherForecast =
      options.weatherForecast ??
      new WeatherForecastService({
        poolId: this.config.poolId,
        poolSite: this.config.poolSite ?? defaultPoolSite(this.config.timezone),
        weather: this.config.weather ?? defaultWeatherProviderConfig(),
        influx: this.config.influx,
        fetchImpl: options.fetchImpl,
        locationResolver: async () => {
          const activeCoordinates = await this.weatherLocationSettings.getActiveWeatherCoordinates();
          if (activeCoordinates.status !== "resolved" || activeCoordinates.latitude === null || activeCoordinates.longitude === null) {
            return null;
          }
          return {
            location: {
              latitude: activeCoordinates.latitude,
              longitude: activeCoordinates.longitude,
              timezone: activeCoordinates.timezone,
              name: null
            },
            source: activeCoordinates.source ?? "manual"
          };
        },
        onUpdate: (view) => {
          this.events.publish("weather.updated", view as unknown as Record<string, unknown>);
        }
      });
    this.poolChemistrySettings =
      options.poolChemistrySettings ??
      new PoolChemistrySettingsService(
        this.config.poolId,
        this.sqliteDatabase ? new SqlitePoolChemistrySettingsRepository(this.sqliteDatabase) : null
      );
    this.chemistryReadings =
      options.chemistryReadings ??
      new ChemistryReadingsService(
        this.config.poolId,
        this.sqliteDatabase ? new SqliteChemistryReadingsRepository(this.sqliteDatabase) : null
      );
    this.poolCoverEvents =
      options.poolCoverEvents ??
      new PoolCoverEventsService(
        this.config.poolId,
        this.sqliteDatabase ? new SqlitePoolCoverEventsRepository(this.sqliteDatabase) : null
      );
    this.notifications =
      options.notifications ??
      new NotificationsService(this.config.poolId, this.sqliteDatabase);
    this.waterTestingSchedule =
      options.waterTestingSchedule ??
      new WaterTestingScheduleService(
        this.config.poolId,
        this.sqliteDatabase ? new SqliteWaterTestingScheduleRepository(this.sqliteDatabase) : null
      );
    this.platformHealthMonitor = new PlatformHealthMonitor({
      registry: this.buildServiceRegistry(),
      fetchImpl: options.fetchImpl,
      pollIntervalMs: this.config.healthPollIntervalMs,
      timeoutMs: this.config.healthTimeoutMs,
      tcpProbe: options.tcpProbe
    });
    this.nats = new NatsSupervisor(this.config.natsUrl, this.logger, async (session, signal) =>
      this.runNatsSession(session, signal)
    );
  }

  getEquipment(): Array<Record<string, unknown>> {
    return this.projection.getEquipmentView(this.bridge.all());
  }

  getHealth(): Record<string, unknown> {
    const localService = this.buildLocalApiServiceRecord();
    const ready = localService.status === "healthy";
    const checks = normalizeChecks(localService.checks);
    return {
      status: localService.status,
      message: localService.message,
      ready,
      checks,
      last_checked: localService.lastChecked,
      generated_at: new Date().toISOString()
    };
  }

  getControllerSchedules(): Record<string, unknown> {
    return this.projection.getControllerSchedulesView() as unknown as Record<string, unknown>;
  }

  getControllerClock(): Record<string, unknown> {
    return this.projection.getControllerClockView() as unknown as Record<string, unknown>;
  }

  getControllerPumpConfigurations(): Record<string, unknown> {
    return this.projection.getControllerPumpConfigurationsView() as unknown as Record<string, unknown>;
  }

  getControllerHeater(): Record<string, unknown> {
    return this.projection.getControllerHeaterView() as unknown as Record<string, unknown>;
  }

  async getTemperatureTelemetryLatest(): Promise<Record<string, unknown>> {
    return this.temperatureTelemetry.getLatest() as unknown as Record<string, unknown>;
  }

  async getTemperatureTelemetryHistory(query: {
    sensorType: string | null;
    start: string | null;
    end: string | null;
    interval: string | null;
  }): Promise<Record<string, unknown>> {
    return this.temperatureTelemetry.getHistory({
      sensorType:
        query.sensorType === "air" || query.sensorType === "pool_water" || query.sensorType === "spa_water" || query.sensorType === "solar"
          ? query.sensorType
          : null,
      start: query.start,
      end: query.end,
      interval: query.interval
    } satisfies TemperatureHistoryQuery) as unknown as Record<string, unknown>;
  }

  async getPumpTelemetryLatest(query: {
    pumpId: string | null;
  }): Promise<Record<string, unknown>> {
    return this.pumpTelemetry.getLatest(query.pumpId) as unknown as Record<string, unknown>;
  }

  async getPumpTelemetryHistory(query: {
    pumpId: string | null;
    start: string | null;
    end: string | null;
    interval: string | null;
  }): Promise<Record<string, unknown>> {
    return this.pumpTelemetry.getHistory({
      pumpId: query.pumpId,
      start: query.start,
      end: query.end,
      interval: query.interval
    } satisfies PumpHistoryQuery) as unknown as Record<string, unknown>;
  }

  async getWeatherForecast(): Promise<Record<string, unknown>> {
    return this.weatherForecast.getLatest() as unknown as Record<string, unknown>;
  }

  async getWeatherHistory(query: {
    metric: string | null;
    start: string | null;
    end: string | null;
    interval: string | null;
  }): Promise<Record<string, unknown>> {
    const metric = isWeatherHistoryMetric(query.metric) ? query.metric : "temperature_f";
    return this.weatherForecast.getHistory({
      metric,
      start: query.start,
      end: query.end,
      interval: query.interval
    }) as unknown as Record<string, unknown>;
  }

  async refreshWeatherForecast(): Promise<Record<string, unknown>> {
    return this.weatherForecast.refreshNow() as unknown as Record<string, unknown>;
  }

  async getWeatherLocationSettings(): Promise<WeatherLocationSettings> {
    return this.weatherLocationSettings.getWeatherLocationSettings();
  }

  async upsertWeatherLocationSettings(input: unknown): Promise<WeatherLocationSettings> {
    return this.weatherLocationSettings.upsertWeatherLocationSettings(input);
  }

  async getGeocodingSettings(): Promise<GeocodingSettingsView> {
    return this.geocodingSettings.getGeocodingSettings();
  }

  async updateGeocodingSettings(input: unknown): Promise<GeocodingSettingsView> {
    return this.geocodingSettings.updateGeocodingSettings(input);
  }

  async updateGeocodingProviderConfig(providerId: string, input: unknown): Promise<GeocodingSettingsView> {
    return this.geocodingSettings.updateGeocodingProviderConfig(providerId, input);
  }

  async getPoolChemistrySettings(): Promise<PoolChemistrySettingsView> {
    return this.poolChemistrySettings.getPoolChemistrySettings();
  }

  async updatePoolChemistrySettings(input: unknown): Promise<PoolChemistrySettingsView> {
    return this.poolChemistrySettings.updatePoolChemistrySettings(input);
  }

  async getWaterTestingSchedule(): Promise<WaterTestingScheduleStatusView> {
    const schedule = await this.waterTestingSchedule.getSchedule();
    const freshness = await this.getWaterTestingFreshness();
    return {
      items: schedule.items.map((item) => {
        const statusItem = freshness.items.find((value) => value.chemicalKey === item.chemicalKey);
        return {
          ...item,
          status: statusItem?.status ?? "unavailable",
          lastObservedAt: statusItem?.lastObservedAt ?? null
        };
      }),
      source: schedule.source
    };
  }

  async updateWaterTestingSchedule(input: unknown): Promise<WaterTestingScheduleStatusView> {
    const schedule = await this.waterTestingSchedule.updateSchedule(input);
    await this.refreshNotificationsFromCurrentState();
    const freshness = await this.getWaterTestingFreshness();
    return {
      items: schedule.items.map((item) => {
        const statusItem = freshness.items.find((value) => value.chemicalKey === item.chemicalKey);
        return {
          ...item,
          status: statusItem?.status ?? "unavailable",
          lastObservedAt: statusItem?.lastObservedAt ?? null
        };
      }),
      source: schedule.source
    };
  }

  async updateWaterTestingScheduleItem(chemicalKey: string, input: unknown): Promise<WaterTestingScheduleStatusView> {
    const schedule = await this.waterTestingSchedule.updateScheduleItem(chemicalKey, input);
    await this.refreshNotificationsFromCurrentState();
    const freshness = await this.getWaterTestingFreshness();
    return {
      items: schedule.items.map((item) => {
        const statusItem = freshness.items.find((value) => value.chemicalKey === item.chemicalKey);
        return {
          ...item,
          status: statusItem?.status ?? "unavailable",
          lastObservedAt: statusItem?.lastObservedAt ?? null
        };
      }),
      source: schedule.source
    };
  }

  async resetWaterTestingSchedule(): Promise<WaterTestingScheduleStatusView> {
    const schedule = await this.waterTestingSchedule.resetSchedule();
    await this.refreshNotificationsFromCurrentState();
    const freshness = await this.getWaterTestingFreshness();
    return {
      items: schedule.items.map((item) => {
        const statusItem = freshness.items.find((value) => value.chemicalKey === item.chemicalKey);
        return {
          ...item,
          status: statusItem?.status ?? "unavailable",
          lastObservedAt: statusItem?.lastObservedAt ?? null
        };
      }),
      source: schedule.source
    };
  }

  async getLatestChemistryReading(): Promise<ChemistryReadingRecord | null> {
    return this.chemistryReadings.getLatestChemistryReading();
  }

  async getChemistryHistory(input: ChemistryHistoryQueryInput): Promise<ChemistryHistoryView> {
    return this.chemistryReadings.getChemistryHistory(input);
  }

  async createChemistryReading(input: unknown): Promise<ChemistryReadingCreateResult> {
    const result = await this.chemistryReadings.createChemistryReading(input);
    this.events.publish("chemistry.reading", result.reading as unknown as Record<string, unknown>);
    await this.refreshNotificationsFromCurrentState();
    return result;
  }

  async getCurrentPoolCover(): Promise<PoolCoverCurrentView> {
    return this.poolCoverEvents.getCurrentPoolCover();
  }

  async getPoolCoverHistory(input: PoolCoverHistoryQueryInput): Promise<PoolCoverHistoryView> {
    return this.poolCoverEvents.getPoolCoverHistory(input);
  }

  async createPoolCoverEvent(input: unknown): Promise<PoolCoverEventRecord> {
    const event = await this.poolCoverEvents.createPoolCoverEvent(input);
    this.events.publish("pool.cover.event", event as unknown as Record<string, unknown>);
    return event;
  }

  async getSwimmability(): Promise<SwimmabilityView> {
    const { chemistry, chemistryBounds, cover, forecast, latestTemperatures, rainfallSinceChemistryInches, freshness } =
      await this.getSwimmabilityInputs();

    return buildSwimmabilityView({
      chemistry,
      chemistryBounds,
      cover,
      forecast,
      latestTemperatures,
      rainfallSinceChemistryInches,
      freshness
    });
  }

  async getNotifications(input: { status: string | null; limit: string | null; type: string | null }): Promise<NotificationsView> {
    const {
      chemistry,
      chemistryBounds,
      cover,
      forecast,
      latestTemperatures,
      rainfallSinceChemistryInches,
      freshness
    } = await this.getSwimmabilityInputs();
    const swimmability = buildSwimmabilityView({
      chemistry,
      chemistryBounds,
      cover,
      forecast,
      latestTemperatures,
      rainfallSinceChemistryInches,
      freshness
    });
    const chemistryPromptIntervalDays = await this.poolChemistrySettings.getChemistryPromptIntervalDays();

    return this.notifications.getNotifications(input, {
      chemistry,
      chemistryPromptIntervalDays,
      swimmability,
      rainfallSinceChemistryInches,
      cover,
      forecast,
      latestTemperatures
      ,
      freshness
    });
  }

  async markNotificationRead(id: string): Promise<NotificationRecord | null> {
    return this.notifications.markNotificationRead(id);
  }

  async markAllNotificationsRead(): Promise<NotificationsReadAllResult> {
    return this.notifications.markAllNotificationsRead();
  }

  private async getSwimmabilityInputs(): Promise<{
    chemistry: ChemistryReadingRecord | null;
    chemistryBounds: PoolChemistryRecommendationBounds;
    cover: PoolCoverCurrentView;
    forecast: Awaited<ReturnType<WeatherForecastService["getLatest"]>>;
    latestTemperatures: Awaited<ReturnType<TemperatureTelemetryService["getLatest"]>>;
    rainfallSinceChemistryInches: number | null;
    freshness: WaterTestingFreshnessView;
  }> {
    const [chemistry, chemistryBounds, cover, forecast, latestTemperatures] = await Promise.all([
      this.chemistryReadings.getLatestChemistryReading(),
      this.poolChemistrySettings.getChemistryBoundsForRecommendations(),
      this.poolCoverEvents.getCurrentPoolCover(),
      this.weatherForecast.getLatest(),
      this.temperatureTelemetry.getLatest()
    ]);

    let rainfallSinceChemistryInches: number | null = null;
    if (chemistry) {
      const rainfallHistory = await this.weatherForecast.getHistory({
        metric: "precipitation_amount",
        start: chemistry.recorded_at,
        end: new Date().toISOString(),
        interval: null
      });
      rainfallSinceChemistryInches = sumWeatherHistoryPoints(rainfallHistory) / 25.4;
    }

    const freshness = await this.getWaterTestingFreshness(latestTemperatures);

    return {
      chemistry,
      chemistryBounds,
      cover,
      forecast,
      latestTemperatures,
      rainfallSinceChemistryInches,
      freshness
    };
  }

  private async getWaterTestingFreshness(
    latestTemperaturesInput?: Awaited<ReturnType<TemperatureTelemetryService["getLatest"]>>
  ): Promise<WaterTestingFreshnessView> {
    const [schedule, readings, latestTemperatures] = await Promise.all([
      this.waterTestingSchedule.getSchedule(),
      this.chemistryReadings.getRecentChemistryReadings(500),
      latestTemperaturesInput ? Promise.resolve(latestTemperaturesInput) : this.temperatureTelemetry.getLatest()
    ]);
    const snapshot = this.projection.getSnapshot();
    return evaluateWaterTestingFreshness(schedule.items, {
      chemistryReadings: readings,
      latestTemperatures,
      saltTelemetry: {
        saltPpm: snapshot.chlorinator.saltPpm,
        updatedAt: snapshot.chlorinator.updatedAt
      }
    });
  }

  private async refreshNotificationsFromCurrentState(): Promise<void> {
    if (!this.sqliteDatabase) {
      return;
    }

    const {
      chemistry,
      chemistryBounds,
      cover,
      forecast,
      latestTemperatures,
      rainfallSinceChemistryInches,
      freshness
    } = await this.getSwimmabilityInputs();
    const swimmability = buildSwimmabilityView({
      chemistry,
      chemistryBounds,
      cover,
      forecast,
      latestTemperatures,
      rainfallSinceChemistryInches,
      freshness
    });
    const chemistryPromptIntervalDays = await this.poolChemistrySettings.getChemistryPromptIntervalDays();
    await this.notifications.refresh({
      chemistry,
      chemistryPromptIntervalDays,
      swimmability,
      rainfallSinceChemistryInches,
      cover,
      forecast,
      latestTemperatures,
      freshness
    });
  }

  async getChemistryBoundsForRecommendations(): Promise<PoolChemistryRecommendationBounds> {
    return this.poolChemistrySettings.getChemistryBoundsForRecommendations();
  }

  async getPlatformStatus(): Promise<Record<string, unknown>> {
    await this.platformHealthMonitor.refreshNow();
    const snapshot = this.platformHealthMonitor.getSnapshot();
    const natsState = this.nats.snapshot();
    const brokerRates = this.natsVarzMonitor.getSnapshot();
    return {
      overall: snapshot.overall,
      generatedAt: snapshot.generatedAt,
      connectivity: {
        rs485: {
          rx_messages_per_second: this.serialRxRate.getMessagesPerSecond(),
          tx_messages_per_second: this.serialTxRate.getMessagesPerSecond()
        },
        nats_broker: {
          status: mapBrokerStatus(brokerRates.status),
          subscriptions: brokerRates.subscriptions,
          in_messages_per_second: brokerRates.inMessagesPerSecond,
          out_messages_per_second: brokerRates.outMessagesPerSecond,
          last_sample_at: brokerRates.lastSampleAt,
          error_code: brokerRates.errorCode
        },
      },
      services: snapshot.services.map((service) => ({
        name: service.name,
        type: service.type,
        criticality: service.criticality,
        status: service.status,
        message: service.message,
        lastChecked: service.lastChecked,
        responseTimeMs: service.responseTimeMs,
        checks: normalizeChecks(service.checks),
        raw: service.raw ?? undefined
      })),
      local: {
        nats_client_status: natsState.status
      }
    };
  }

  getMetrics(): string {
    const natsState = this.nats.snapshot();
    const brokerRates = this.natsVarzMonitor.getSnapshot();
    const rs485RxRate = this.serialRxRate.getMessagesPerSecond();
    const rs485TxRate = this.serialTxRate.getMessagesPerSecond();
    const now = Date.now() / 1000;
    const snapshot = this.platformHealthMonitor.getSnapshot();
    const splashSerial = snapshot.services.find((service) => service.name === "splash-serial");
    const splashProtocol = snapshot.services.find((service) => service.name === "splash-protocol");

    const metricLines = [
      "# HELP splash_api_service_status API service status gauge.",
      "# TYPE splash_api_service_status gauge",
      renderStatusSeries("splash_api_service_status", ["healthy", "degraded", "unhealthy", "down", "unknown"], this.buildLocalApiServiceRecord().status).trimEnd(),
      "# HELP splash_api_rs485_status RS485 connectivity status derived from splash-serial health.",
      "# TYPE splash_api_rs485_status gauge",
      renderStatusSeries("splash_api_rs485_status", ["healthy", "degraded", "unhealthy", "down", "unknown"], splashSerial?.status ?? "unknown").trimEnd(),
      "# HELP splash_api_nats_broker_status NATS broker monitoring status derived from /varz polling.",
      "# TYPE splash_api_nats_broker_status gauge",
      renderStatusSeries("splash_api_nats_broker_status", ["healthy", "degraded", "unhealthy", "down", "unknown"], mapBrokerStatus(brokerRates.status)).trimEnd(),
      "# HELP splash_api_platform_service_status Aggregated platform service status gauge.",
      "# TYPE splash_api_platform_service_status gauge",
      ...snapshot.services.map((service) =>
        renderStatusSeries("splash_api_platform_service_status", ["healthy", "degraded", "unhealthy", "down", "unknown"], service.status, {
          service: service.name
        }).trimEnd()
      ),
      "# HELP splash_platform_service_health Canonical platform service health gauge.",
      "# TYPE splash_platform_service_health gauge",
      ...snapshot.services.map((service) =>
        renderStatusSeries("splash_platform_service_health", ["healthy", "degraded", "unhealthy", "down", "unknown"], service.status, {
          service: service.name
        }).trimEnd()
      ),
      "# HELP splash_api_rs485_rx_messages_per_second Rolling 10-second average RS485 receive messages per second observed by splash-api.",
      "# TYPE splash_api_rs485_rx_messages_per_second gauge",
      `splash_api_rs485_rx_messages_per_second ${formatNumber(rs485RxRate)}`,
      "# HELP splash_api_rs485_tx_messages_per_second Rolling 10-second average RS485 transmit messages per second observed by splash-api.",
      "# TYPE splash_api_rs485_tx_messages_per_second gauge",
      `splash_api_rs485_tx_messages_per_second ${formatNumber(rs485TxRate)}`,
      "# HELP splash_api_nats_dependency_up Whether the splash-api NATS client dependency is currently connected.",
      "# TYPE splash_api_nats_dependency_up gauge",
      `splash_api_nats_dependency_up ${natsState.status === "ok" ? 1 : 0}`,
      "# HELP splash_api_nats_broker_subscriptions Observed NATS broker subscription count when monitoring is available.",
      "# TYPE splash_api_nats_broker_subscriptions gauge",
      `splash_api_nats_broker_subscriptions ${formatNullableMetric(brokerRates.subscriptions)}`,
      "# HELP splash_api_nats_broker_in_messages_per_second Observed NATS broker inbound messages per second when monitoring is available.",
      "# TYPE splash_api_nats_broker_in_messages_per_second gauge",
      `splash_api_nats_broker_in_messages_per_second ${formatNullableMetric(brokerRates.inMessagesPerSecond)}`,
      "# HELP splash_api_nats_broker_out_messages_per_second Observed NATS broker outbound messages per second when monitoring is available.",
      "# TYPE splash_api_nats_broker_out_messages_per_second gauge",
      `splash_api_nats_broker_out_messages_per_second ${formatNullableMetric(brokerRates.outMessagesPerSecond)}`,
      "# HELP splash_api_platform_service_last_updated_seconds Unix timestamp of the last successful platform service health poll.",
      "# TYPE splash_api_platform_service_last_updated_seconds gauge",
      ...snapshot.services.map((service) =>
        `splash_api_platform_service_last_updated_seconds{service="${service.name}"} ${formatNullableTimestamp(service.lastChecked)}`
      ),
      "# HELP splash_platform_service_check_duration_seconds Last observed platform service health-check duration.",
      "# TYPE splash_platform_service_check_duration_seconds gauge",
      ...snapshot.services.map((service) =>
        `splash_platform_service_check_duration_seconds{service="${service.name}"} ${service.responseTimeMs == null ? "NaN" : (service.responseTimeMs / 1000).toFixed(6)}`
      ),
      "# HELP splash_platform_service_check_failures_total Synthetic per-snapshot failure gauge for non-healthy service checks.",
      "# TYPE splash_platform_service_check_failures_total gauge",
      ...snapshot.services.map((service) =>
        `splash_platform_service_check_failures_total{service="${service.name}"} ${service.status === "healthy" ? 0 : 1}`
      ),
      "# HELP splash_platform_service_last_success_seconds Unix timestamp of the last successful healthy or degraded service check.",
      "# TYPE splash_platform_service_last_success_seconds gauge",
      ...snapshot.services.map((service) =>
        `splash_platform_service_last_success_seconds{service="${service.name}"} ${service.status === "healthy" || service.status === "degraded" ? formatNullableTimestamp(service.lastChecked) : "NaN"}`
      ),
      `splash_api_platform_service_last_updated_seconds{service="splash_api"} ${formatNumber(now)}`
    ];

    return `${metricLines.join("\n")}\n`;
  }

  listProtocolFrameBundles(): ProtocolFrameBundleSummary[] {
    return this.protocolFrameBundles.listBundles();
  }

  createProtocolFrameBundle(input: { label: string | null }): ProtocolFrameBundleSummary {
    return this.protocolFrameBundles.createBundle(input.label);
  }

  getProtocolFrameBundle(id: string): ProtocolFrameBundle | null {
    return this.protocolFrameBundles.getBundle(id);
  }

  startProtocolWatchSession(input: { label: string | null; events: string[] | null }): ProtocolWatchSessionSummary {
    return this.protocolFrameBundles.startWatchSession(input.label, input.events);
  }

  getProtocolWatchSession(id: string): ProtocolWatchSession | null {
    return this.protocolFrameBundles.getWatchSession(id);
  }

  stopProtocolWatchSession(id: string): ProtocolWatchSessionSummary | null {
    return this.protocolFrameBundles.stopWatchSession(id);
  }

  compareProtocolFrameBundles(input: {
    baselineBundleId: string;
    comparisonBundleId: string;
  }): ProtocolBundleComparison | null {
    return this.protocolFrameBundles.compareBundles(input.baselineBundleId, input.comparisonBundleId);
  }

  listProtocolAnnotations(bundleId: string | null = null): ProtocolAnnotation[] {
    return this.protocolAnnotations.list(bundleId);
  }

  createProtocolAnnotation(input: ProtocolAnnotationInput): ProtocolAnnotation {
    return this.protocolAnnotations.create(input);
  }

  listProtocolPrompts(bundleId: string | null = null): ProtocolPrompt[] {
    return this.protocolPrompts.list(bundleId);
  }

  createProtocolPrompt(input: ProtocolPromptInput): ProtocolPrompt {
    return this.protocolPrompts.create(input);
  }

  async publishRawFrameCommand(input: { protocolName: string; bytesHex: string }, session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: input.protocolName,
      target: {},
      command_type: "send_raw_frame",
      arguments: {
        bytes_hex: input.bytesHex
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishPumpSpeedCommand(
    input: { equipmentId: string; rpm: number; circuitKey?: string | null },
    session: MessagingSession
  ): Promise<{ commandId: string }> {
    const equipment = this.bridge.get(input.equipmentId);
    if (!equipment || equipment.equipmentType !== "pump") {
      throw new Error("Unsupported equipment target.");
    }

    const circuitKey = input.circuitKey ?? equipment.defaultControlCircuitKey ?? null;
    if (!circuitKey) {
      throw new Error("No controller circuit is configured for pump speed changes.");
    }

    if (equipment.controlCircuitKeys && !equipment.controlCircuitKeys.includes(circuitKey)) {
      throw new Error(`Unsupported controller circuit '${circuitKey}'.`);
    }

    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: equipment.protocolName,
      target: {
        equipment_id: equipment.id,
        equipment_type: "circuit",
        circuit_key: circuitKey
      },
      command_type: "set_speed",
      arguments: {
        rpm: input.rpm
      },
      requested_by: "api_control",
      dry_run: false
    });
    return { commandId };
  }

  async publishCircuitStateCommand(
    input: { equipmentId: string; circuitKey: string; enabled: boolean },
    session: MessagingSession
  ): Promise<{ commandId: string }> {
    const equipment = this.bridge.get(input.equipmentId);
    if (!equipment || equipment.equipmentType !== "controller") {
      throw new Error("Unsupported controller target.");
    }

    const circuitId = this.bridge.getControllerCircuitId(input.circuitKey);
    if (circuitId === null) {
      throw new Error(`Unsupported controller circuit '${input.circuitKey}'.`);
    }

    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: equipment.protocolName,
      target: {
        equipment_id: equipment.id,
        equipment_type: "circuit",
        circuit_key: input.circuitKey
      },
      command_type: "set_circuit_state",
      arguments: {
        circuit_id: circuitId,
        enabled: input.enabled
      },
      requested_by: "dashboard",
      dry_run: false
    });
    return { commandId };
  }

  async publishRemoteLayoutRequest(input: { pageIndex: number }, session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_remote_layout_page",
      arguments: {
        page_index: input.pageIndex
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishPumpInfoRequest(input: { pumpSlot: number }, session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_pump_info",
      arguments: {
        pump_slot: input.pumpSlot
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishControllerScheduleRequest(input: { scheduleId: number }, session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_controller_schedule",
      arguments: {
        schedule_id: input.scheduleId
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async updateControllerSchedule(
    input: ControllerScheduleUpdateInput,
    session: MessagingSession
  ): Promise<{ commandId: string; schedule: Record<string, unknown> }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "set_controller_schedule",
      arguments: {
        schedule_id: input.scheduleId,
        mode: input.mode,
        circuit_id: input.circuitId,
        start_time_minutes: input.startTimeMinutes,
        end_time_minutes: input.endTimeMinutes,
        days_mask: input.daysMask,
        runtime_minutes: input.runtimeMinutes
      },
      requested_by: "automation_schedule_editor",
      dry_run: false
    });

    const result = await this.waitForCommandResult(commandId);
    if (result.status !== "completed") {
      throw new Error(typeof result.detail === "string" ? result.detail : "Controller schedule update did not complete.");
    }

    const refreshedSchedule = this.findControllerScheduleById(input.scheduleId);
    if (!refreshedSchedule) {
      throw new Error("Controller schedule write completed but the refreshed schedule record was not found.");
    }

    return {
      commandId,
      schedule: refreshedSchedule
    };
  }

  async updateControllerHeaterConfiguration(
    input: ControllerHeaterConfigurationUpdateInput,
    session: MessagingSession
  ): Promise<{ commandId: string; heater: Record<string, unknown> }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "set_heater_configuration",
      arguments: {
        heater_type: input.heaterType,
        cooling_enabled: input.coolingEnabled,
        freeze_protection_enabled: input.freezeProtectionEnabled
      },
      requested_by: "system_hardware_easytouch8",
      dry_run: false
    });

    const result = await this.waitForCommandResult(commandId);
    if (result.status !== "completed") {
      throw new Error(typeof result.detail === "string" ? result.detail : "Controller heater configuration update did not complete.");
    }

    return {
      commandId,
      heater: this.getControllerHeater()
    };
  }

  async updateControllerHeaterSettings(
    input: ControllerHeaterSettingsUpdateInput,
    session: MessagingSession
  ): Promise<{ commandId: string; heater: Record<string, unknown> }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "set_heater_settings",
      arguments: {
        pool_setpoint: input.poolSetpoint,
        spa_setpoint: input.spaSetpoint,
        pool_heat_mode: input.poolHeatMode,
        spa_heat_mode: input.spaHeatMode,
        cool_setpoint: input.coolSetpoint
      },
      requested_by: "system_hardware_easytouch8",
      dry_run: false
    });

    const result = await this.waitForCommandResult(commandId);
    if (result.status !== "completed") {
      throw new Error(typeof result.detail === "string" ? result.detail : "Controller heater settings update did not complete.");
    }

    this.projection.cacheControllerHeaterSettings({
      poolSetpoint: input.poolSetpoint,
      spaSetpoint: input.spaSetpoint,
      coolSetpoint: input.coolSetpoint,
      poolHeatMode: mapHeatModeLabel(input.poolHeatMode),
      spaHeatMode: mapHeatModeLabel(input.spaHeatMode),
      heatSettingByte: ((input.spaHeatMode & 0x03) << 2) | (input.poolHeatMode & 0x03),
      updatedAt: new Date().toISOString()
    });

    return {
      commandId,
      heater: this.getControllerHeater()
    };
  }

  async updateControllerClock(
    input: {
      month: number;
      day: number;
      year: number;
      dayOfWeek: number;
      hour24: number;
      minute: number;
      daylightSavingsAuto: boolean | null;
      clockAdvance: number | null;
    },
    session: MessagingSession
  ): Promise<{ commandId: string; clock: Record<string, unknown> }> {
    const currentClock = this.getControllerClock();
    const summary =
      currentClock.summary && typeof currentClock.summary === "object" && !Array.isArray(currentClock.summary)
        ? (currentClock.summary as Record<string, unknown>)
        : {};
    const currentDst = typeof summary.daylight_savings_auto === "boolean" ? summary.daylight_savings_auto : null;
    const currentClockAdvance = typeof summary.clock_advance === "number" ? summary.clock_advance : null;

    if (input.daylightSavingsAuto !== currentDst) {
      throw new Error("DST mode editing is not yet supported until the EasyTouch clock payload is live-validated.");
    }
    if (input.clockAdvance !== currentClockAdvance) {
      throw new Error("Clock advance editing is not yet supported until the EasyTouch clock payload is live-validated.");
    }

    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "sync_controller_datetime",
      arguments: {
        month: input.month,
        day: input.day,
        year: input.year,
        day_of_week: input.dayOfWeek,
        hour_24: input.hour24,
        minute: input.minute
      },
      requested_by: "system_hardware_easytouch8",
      dry_run: false
    });

    const result = await this.waitForCommandResult(commandId);
    if (result.status !== "completed") {
      throw new Error(typeof result.detail === "string" ? result.detail : "Controller clock update did not complete.");
    }

    this.projection.cacheControllerClock({
      month: input.month,
      day: input.day,
      year: input.year,
      dayOfWeek: input.dayOfWeek,
      hour24: input.hour24,
      minute: input.minute,
      daylightSavingsAuto: currentDst,
      clockAdvance: currentClockAdvance,
      updatedAt: new Date().toISOString()
    });

    return {
      commandId,
      clock: this.getControllerClock()
    };
  }

  async updateControllerPumpConfiguration(
    input: {
      pumpId: number;
      pumpType: number;
      primingTime: number;
      unknown3: number;
      unknown4: number;
      slots: Array<{ circuit_assignment: number; rpm: number }>;
      primingSpeed: number;
      trailingBytes: number[];
    },
    session: MessagingSession
  ): Promise<{ commandId: string; pumpConfiguration: Record<string, unknown> }> {
    const existing = this.projection.getControllerPumpConfiguration(input.pumpId);
    if (!existing) {
      throw new Error(`Pump ${input.pumpId} is not currently reported as installed by live controller state.`);
    }

    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "write_pump_config",
      arguments: {
        pump_id: input.pumpId,
        pump_type: input.pumpType,
        priming_time: input.primingTime,
        unknown_3: input.unknown3,
        unknown_4: input.unknown4,
        slots: input.slots,
        priming_speed: input.primingSpeed,
        trailing_bytes: input.trailingBytes
      },
      requested_by: "system_hardware_easytouch8",
      dry_run: false
    });

    const result = await this.waitForCommandResult(commandId);
    if (result.status !== "completed") {
      throw new Error(typeof result.detail === "string" ? result.detail : "Pump configuration update did not complete.");
    }

    const refreshCommandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: refreshCommandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_pump_info",
      arguments: {
        pump_slot: input.pumpId
      },
      requested_by: "system_hardware_easytouch8",
      dry_run: false
    });
    await this.waitForCommandResult(refreshCommandId);

    const refreshed = await this.waitForControllerPumpConfiguration(input.pumpId, (value) => {
      const slots = Array.isArray(value.slots) ? value.slots : [];
      return (
        value.pump_type === input.pumpType &&
        value.priming_time === input.primingTime &&
        value.priming_speed === input.primingSpeed &&
        slots.length === input.slots.length &&
        input.slots.every((slot, index) => {
          const current = slots[index];
          return current && typeof current === "object" && current.circuit_assignment === slot.circuit_assignment && current.rpm === slot.rpm;
        })
      );
    });

    return {
      commandId,
      pumpConfiguration: refreshed
    };
  }

  async publishCircuitConfigRequest(
    input: { startIndex: number; endIndex: number },
    session: MessagingSession
  ): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_circuit_config",
      arguments: {
        start_index: input.startIndex,
        end_index: input.endIndex
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishCustomNameRequest(input: { nameIndex: number }, session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_custom_name",
      arguments: {
        name_index: input.nameIndex
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishControllerSoftwareVersionRequest(session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_controller_software_version",
      arguments: {},
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async publishControllerDatetimeRequest(session: MessagingSession): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "request_controller_datetime",
      arguments: {},
      requested_by: "dashboard",
      dry_run: false
    });
    return { commandId };
  }

  async publishControllerDatetimeSync(session: MessagingSession): Promise<{ commandId: string }> {
    const now = new Date();
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: now.toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "sync_controller_datetime",
      arguments: {
        month: now.getMonth() + 1,
        day: now.getDate(),
        year: now.getFullYear() % 100,
        day_of_week: now.getDay(),
        hour_24: now.getHours(),
        minute: now.getMinutes()
      },
      requested_by: "dashboard",
      dry_run: false
    });
    return { commandId };
  }

  async publishPumpConfigWrite(
    input: {
      pumpId: number;
      pumpType: number;
      primingTime: number;
      unknown3: number;
      unknown4: number;
      slots: Array<{ circuit_assignment: number; rpm: number }>;
      primingSpeed: number;
      trailingBytes: number[];
    },
    session: MessagingSession
  ): Promise<{ commandId: string }> {
    const commandId = randomUUID();
    await session.publish("protocol.command.intent", {
      pool_id: this.config.poolId,
      command_id: commandId,
      requested_at: new Date().toISOString(),
      protocol_name: "pentair_easytouch",
      target: {
        equipment_type: "controller",
        bus_address: "0x10"
      },
      command_type: "write_pump_config",
      arguments: {
        pump_id: input.pumpId,
        pump_type: input.pumpType,
        priming_time: input.primingTime,
        unknown_3: input.unknown3,
        unknown_4: input.unknown4,
        slots: input.slots,
        priming_speed: input.primingSpeed,
        trailing_bytes: input.trailingBytes
      },
      requested_by: "protocol_explorer",
      dry_run: false
    });
    return { commandId };
  }

  async run(signal: AbortSignal): Promise<void> {
    await this.runDatabaseMigrationsIfConfigured();

    const httpServer =
      this.httpServer ??
      new LocalHttpServer(this.config.httpBind, {
        getEquipment: () => this.getEquipment(),
        getHealth: () => this.getHealth(),
        getControllerSchedules: () => this.getControllerSchedules(),
        getControllerClock: () => this.getControllerClock(),
        updateControllerClock: async (input) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.updateControllerClock(input as {
            month: number;
            day: number;
            year: number;
            dayOfWeek: number;
            hour24: number;
            minute: number;
            daylightSavingsAuto: boolean | null;
            clockAdvance: number | null;
          }, session);
        },
        getControllerPumpConfigurations: () => this.getControllerPumpConfigurations(),
        updateControllerPumpConfiguration: async (input) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.updateControllerPumpConfiguration(input as {
            pumpId: number;
            pumpType: number;
            primingTime: number;
            unknown3: number;
            unknown4: number;
            slots: Array<{ circuit_assignment: number; rpm: number }>;
            primingSpeed: number;
            trailingBytes: number[];
          }, session);
        },
        getControllerHeater: () => this.getControllerHeater(),
        getTemperatureTelemetryLatest: async () => this.getTemperatureTelemetryLatest(),
        getTemperatureTelemetryHistory: async (query) => this.getTemperatureTelemetryHistory(query),
        getPumpTelemetryLatest: async (query) => this.getPumpTelemetryLatest(query),
        getPumpTelemetryHistory: async (query) => this.getPumpTelemetryHistory(query),
        getWeatherForecast: async () => this.getWeatherForecast(),
        getWeatherHistory: async (query) => this.getWeatherHistory(query),
        refreshWeatherForecast: async () => this.refreshWeatherForecast(),
        getWeatherLocationSettings: async () => this.getWeatherLocationSettings() as unknown as Record<string, unknown>,
        upsertWeatherLocationSettings: async (input) => this.upsertWeatherLocationSettings(input) as unknown as Record<string, unknown>,
        getGeocodingSettings: async () => this.getGeocodingSettings() as unknown as Record<string, unknown>,
        updateGeocodingSettings: async (input) => this.updateGeocodingSettings(input) as unknown as Record<string, unknown>,
        updateGeocodingProviderConfig: async (providerId, input) =>
          this.updateGeocodingProviderConfig(providerId, input) as unknown as Record<string, unknown>,
        getPoolChemistrySettings: async () => this.getPoolChemistrySettings() as unknown as Record<string, unknown>,
        updatePoolChemistrySettings: async (input) => this.updatePoolChemistrySettings(input) as unknown as Record<string, unknown>,
        getWaterTestingSchedule: async () => this.getWaterTestingSchedule() as unknown as Record<string, unknown>,
        updateWaterTestingSchedule: async (input) => this.updateWaterTestingSchedule(input) as unknown as Record<string, unknown>,
        updateWaterTestingScheduleItem: async (chemicalKey, input) =>
          this.updateWaterTestingScheduleItem(chemicalKey, input) as unknown as Record<string, unknown>,
        resetWaterTestingSchedule: async () => this.resetWaterTestingSchedule() as unknown as Record<string, unknown>,
        getLatestChemistryReading: async () => this.getLatestChemistryReading(),
        getChemistryHistory: async (query) => this.getChemistryHistory(query),
        createChemistryReading: async (input) => this.createChemistryReading(input),
        getCurrentPoolCover: async () => this.getCurrentPoolCover(),
        getPoolCoverHistory: async (query) => this.getPoolCoverHistory(query),
        createPoolCoverEvent: async (input) => this.createPoolCoverEvent(input),
        getSwimmability: async () => this.getSwimmability(),
        getNotifications: async (query) => this.getNotifications(query),
        markNotificationRead: async (id) => this.markNotificationRead(id),
        markAllNotificationsRead: async () => this.markAllNotificationsRead(),
        getPlatformStatus: () => this.getPlatformStatus(),
        getMetrics: () => this.getMetrics(),
        getEventBroker: () => this.events,
        getProtocolFrameBroker: () => this.protocolFrames,
        listProtocolFrameBundles: () => this.listProtocolFrameBundles(),
        createProtocolFrameBundle: ({ label }) => this.createProtocolFrameBundle({ label }),
        getProtocolFrameBundle: (id) => this.getProtocolFrameBundle(id),
        startProtocolWatchSession: ({ label, events }) => this.startProtocolWatchSession({ label, events }),
        getProtocolWatchSession: (id) => this.getProtocolWatchSession(id),
        stopProtocolWatchSession: (id) => this.stopProtocolWatchSession(id),
        compareProtocolFrameBundles: ({ baselineBundleId, comparisonBundleId }) =>
          this.compareProtocolFrameBundles({ baselineBundleId, comparisonBundleId }),
        listProtocolAnnotations: (bundleId) => this.listProtocolAnnotations(bundleId),
        createProtocolAnnotation: (input) => this.createProtocolAnnotation(input),
        listProtocolPrompts: (bundleId) => this.listProtocolPrompts(bundleId),
        createProtocolPrompt: (input) => this.createProtocolPrompt(input),
        publishRemoteLayoutRequest: async ({ pageIndex }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishRemoteLayoutRequest({ pageIndex }, session);
        },
        publishPumpInfoRequest: async ({ pumpSlot }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishPumpInfoRequest({ pumpSlot }, session);
        },
        publishControllerScheduleRequest: async ({ scheduleId }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishControllerScheduleRequest({ scheduleId }, session);
        },
        updateControllerSchedule: async (input) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.updateControllerSchedule(input as ControllerScheduleUpdateInput, session);
        },
        updateControllerHeaterConfiguration: async (input) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.updateControllerHeaterConfiguration(input as ControllerHeaterConfigurationUpdateInput, session);
        },
        updateControllerHeaterSettings: async (input) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.updateControllerHeaterSettings(input as ControllerHeaterSettingsUpdateInput, session);
        },
        publishCircuitConfigRequest: async ({ startIndex, endIndex }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishCircuitConfigRequest({ startIndex, endIndex }, session);
        },
        publishCustomNameRequest: async ({ nameIndex }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishCustomNameRequest({ nameIndex }, session);
        },
        publishControllerSoftwareVersionRequest: async () => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishControllerSoftwareVersionRequest(session);
        },
        publishControllerDatetimeRequest: async () => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishControllerDatetimeRequest(session);
        },
        publishControllerDatetimeSync: async () => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishControllerDatetimeSync(session);
        },
        publishPumpConfigWrite: async (input) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishPumpConfigWrite(input, session);
        },
        publishRawFrameCommand: async ({ protocolName, bytesHex }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishRawFrameCommand({ protocolName, bytesHex }, session);
        },
        publishPumpSpeedCommand: async ({ equipmentId, rpm, circuitKey }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishPumpSpeedCommand({ equipmentId, rpm, circuitKey }, session);
        },
        publishCircuitStateCommand: async ({ equipmentId, circuitKey, enabled }) => {
          const session = this.currentSession;
          if (!session) {
            throw new Error("NATS session unavailable.");
          }
          return this.publishCircuitStateCommand({ equipmentId, circuitKey, enabled }, session);
        }
      });

    await this.logRegisteredGeocodingProviders();
    await httpServer.start(signal);
    signal.addEventListener("abort", () => {
      this.sqliteDatabase?.close();
    });
    await this.refreshNotificationsFromCurrentState().catch((error) => {
      this.logger.warn("notifications.refresh.failed", "Initial notification refresh failed.", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
    void this.natsVarzMonitor.start(signal);
    void this.platformHealthMonitor.start(signal);
    this.weatherForecast.start(signal);
    void this.nats.run(signal);
    await waitForAbort(signal);
  }

  private async runDatabaseMigrationsIfConfigured(): Promise<void> {
    if (!this.sqliteDatabase || !this.config.sqlite) {
      return;
    }

    const migrator = new DatabaseMigrator(this.sqliteDatabase, this.config.sqlite.migrationsDir);
    await migrator.migrate();
  }

  private async logRegisteredGeocodingProviders(): Promise<void> {
    const providers = await this.geocodingSettings.getProviderAvailabilitySnapshot();
    for (const provider of providers) {
      this.logger.info("geocoding.provider.registered", "Registered geocoding provider.", {
        provider_id: provider.id,
        available: provider.available,
        unavailable_reason: provider.unavailableReason
      });
    }
  }

  private currentSession: MessagingSession | null = null;
  private hasRequestedStartupCustomNames = false;
  private hasRequestedStartupSchedules = false;

  private async runNatsSession(session: MessagingSession, signal: AbortSignal): Promise<void> {
    this.currentSession = session;
    session.subscribe("equipment.state.controller", async (payload) => {
      this.projection.updateController(payload);
      this.events.publish("equipment.state", payload);
      if (!this.hasRequestedStartupCustomNames && this.shouldRequestStartupCustomNames()) {
        this.hasRequestedStartupCustomNames = true;
        await this.requestAllCustomNames(session);
      }
      if (!this.hasRequestedStartupSchedules && this.shouldRequestStartupSchedules()) {
        this.hasRequestedStartupSchedules = true;
        try {
          await this.requestAllControllerSchedules(session);
        } catch (error) {
          this.logger.warn("startup_schedule_warmup_failed", "Controller schedule startup warmup failed.", {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    });
    session.subscribe("equipment.state.pump", async (payload) => {
      this.projection.updatePump(payload);
      this.events.publish("pump.state", payload);
      await this.pumpTelemetry.observe(this.toPumpTelemetryEvent(payload));
    });
    session.subscribe("equipment.state.chlorinator", async (payload) => {
      this.projection.updateChlorinator(payload);
      this.events.publish("equipment.state", payload);
    });
    session.subscribe("command.result.*", async (payload) => {
      const commandId = typeof payload.command_id === "string" ? payload.command_id : null;
      if (commandId) {
        this.projection.updateCommandResult(commandId, payload);
        const waiters = this.commandWaiters.get(commandId);
        if (waiters) {
          this.commandWaiters.delete(commandId);
          for (const resolve of waiters) {
            resolve(payload);
          }
        }
      }
      this.events.publish("command.result", payload);
    });
    session.subscribe("telemetry.temperature.easytouch", async (payload) => {
      await this.temperatureTelemetry.observe(payload);
    });
    session.subscribe("protocol.frame.raw", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.frame.raw", payload);
      this.protocolFrames.publish("protocol.frame.raw", payload);
    });
    session.subscribe("protocol.frame.buffered", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.frame.buffered", payload);
      this.protocolFrames.publish("protocol.frame.buffered", payload);
    });
    session.subscribe("protocol.frame.unidentified", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.frame.unidentified", payload);
      this.protocolFrames.publish("protocol.frame.unidentified", payload);
    });
    session.subscribe("protocol.frame.decoded", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.frame.decoded", payload);
      this.protocolFrames.publish("protocol.frame.decoded", payload);
      if (payload.message_type === "circuit_configuration") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          const circuitConfigurations = this.projection.updateControllerCircuitConfiguration({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
          this.events.publish("equipment.state", {
            circuit_configurations: circuitConfigurations
          });
        }
      }
      if (payload.message_type === "controller_datetime") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          const controllerDatetimeReply = this.projection.updateControllerDatetimeReply({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
          this.events.publish("equipment.state", {
            controller_datetime_reply: controllerDatetimeReply
          });
        }
      }
      if (payload.message_type === "controller_software_version") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          const controllerSoftwareVersionReply = this.projection.updateControllerSoftwareVersionReply({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
          this.events.publish("equipment.state", {
            controller_software_version_reply: controllerSoftwareVersionReply
          });
        }
      }
      if (payload.message_type === "controller_schedule") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          this.projection.updateControllerScheduleObservation({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
        }
      }
      if (payload.message_type === "controller_solar_heat_pump_status") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          const heaterConfiguration = this.projection.updateControllerHeaterConfiguration({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
          this.events.publish("equipment.state", {
            heater_configuration: heaterConfiguration.configuration,
            heater_settings: heaterConfiguration.settings
          });
        }
      }
      if (payload.message_type === "pump_info") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          const pumpConfigurations = this.projection.updateControllerPumpConfiguration({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
          this.events.publish("equipment.state", {
            pump_configurations: pumpConfigurations.pumps
          });
        }
      }
      if (payload.message_type === "custom_name") {
        const fields = payload.fields;
        if (fields && typeof fields === "object" && !Array.isArray(fields)) {
          const customNameBank = this.projection.updateControllerCustomName({
            ...(fields as Record<string, unknown>),
            occurred_at: typeof payload.decoded_at === "string" ? payload.decoded_at : null
          });
          this.events.publish("equipment.state", {
            custom_name_bank: customNameBank
          });
        }
      }
    });
    session.subscribe("protocol.command.encoded", async (payload) => {
      this.protocolFrameBundles.recordFrame("protocol.command.encoded", payload);
      this.protocolFrames.publish("protocol.command.encoded", payload);
    });
    session.subscribe("serial.tx.raw", async (payload) => {
      this.serialTxRate.record();
      this.protocolFrameBundles.recordFrame("serial.tx.raw", payload);
      this.protocolFrames.publish("serial.tx.raw", payload);
    });
    session.subscribe("serial.rx.raw", async (payload) => {
      this.serialRxRate.record();
      this.protocolFrameBundles.recordFrame("serial.rx.raw", payload);
      this.protocolFrames.publish("serial.rx.raw", payload);
    });

    await waitForAbort(signal);
    this.currentSession = null;
  }

  private shouldRequestStartupCustomNames(): boolean {
    const controller = this.getEquipment().find((entry) => entry.equipment_type === "controller");
    if (!controller || controller.latest_state == null || typeof controller.latest_state !== "object" || Array.isArray(controller.latest_state)) {
      return false;
    }

    const customNameBank = (controller.latest_state as Record<string, unknown>).custom_name_bank;
    return customNameBank == null
      || (typeof customNameBank === "object" && !Array.isArray(customNameBank) && Object.keys(customNameBank).length === 0);
  }

  private shouldRequestStartupSchedules(): boolean {
    const schedules = this.getControllerSchedules().schedules;
    return Array.isArray(schedules) && schedules.length === 0;
  }

  private async requestAllCustomNames(session: MessagingSession): Promise<void> {
    for (let nameIndex = 0; nameIndex <= 9; nameIndex += 1) {
      await this.publishCustomNameRequest({ nameIndex }, session);
    }
  }

  private async requestAllControllerSchedules(session: MessagingSession): Promise<void> {
    for (let scheduleId = 1; scheduleId <= 12; scheduleId += 1) {
      await this.publishControllerScheduleRequest({ scheduleId }, session);
    }
  }

  private buildServiceRegistry(): ServiceDefinition[] {
    const registry: ServiceDefinition[] = [
      {
        name: "splash-api",
        kind: "local",
        type: "splash",
        criticality: "critical",
        check: async () => this.buildLocalApiServiceRecord()
      },
      {
        name: "nats",
        kind: "nats",
        type: "third-party",
        criticality: "critical",
        tcpUrl: this.config.natsUrl,
        monitoringUrl: this.config.natsMonitoringUrl
      }
    ];

    if (this.config.serialHealthUrl) {
      registry.push({
        name: "splash-serial",
        kind: "splash",
        type: "splash",
        criticality: "critical",
        healthUrl: this.config.serialHealthUrl
      });
    }
    if (this.config.protocolHealthUrl) {
      registry.push({
        name: "splash-protocol",
        kind: "splash",
        type: "splash",
        criticality: "important",
        healthUrl: this.config.protocolHealthUrl
      });
    }
    if (this.config.frontendUrl) {
      registry.push({
        name: "splash-frontend",
        kind: "http",
        type: "splash",
        criticality: "important",
        url: this.config.frontendUrl
      });
    }
    if (this.config.prometheusUrl) {
      registry.push({
        name: "prometheus",
        kind: "prometheus",
        type: "third-party",
        criticality: "optional",
        url: this.config.prometheusUrl
      });
    } else {
      registry.push(this.buildUnconfiguredServiceDefinition("prometheus", "optional", "Prometheus URL is not configured"));
    }
    if (this.config.grafanaUrl) {
      registry.push({
        name: "grafana",
        kind: "grafana",
        type: "third-party",
        criticality: "optional",
        url: this.config.grafanaUrl
      });
    } else {
      registry.push(this.buildUnconfiguredServiceDefinition("grafana", "optional", "Grafana URL is not configured"));
    }
    if (this.config.influx) {
      registry.push({
        name: "influxdb",
        kind: "influx",
        type: "third-party",
        criticality: "optional",
        url: this.config.influx.url
      });
    }
    if (this.config.sqlite) {
      registry.push({
        name: "sqlite",
        kind: "local",
        type: "third-party",
        criticality: "important",
        check: async () => this.buildSqliteServiceRecord()
      });
    }
    registry.push({
      name: "weather-provider",
      kind: "local",
      type: "third-party",
      criticality: "optional",
      check: async () => this.buildWeatherProviderServiceRecord()
    });

    return registry;
  }

  private waitForCommandResult(commandId: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const onResult = (payload: Record<string, unknown>) => {
        clearTimeout(timeoutId);
        resolve(payload);
      };
      const timeoutId = setTimeout(() => {
        const waiters = this.commandWaiters.get(commandId) ?? [];
        const remaining = waiters.filter((handler) => handler !== onResult);
        if (remaining.length > 0) {
          this.commandWaiters.set(commandId, remaining);
        } else {
          this.commandWaiters.delete(commandId);
        }
        reject(new Error("Timed out waiting for controller command result."));
      }, COMMAND_WAIT_TIMEOUT_MS);

      const waiters = this.commandWaiters.get(commandId) ?? [];
      this.commandWaiters.set(commandId, [...waiters, onResult]);
    });
  }

  private findControllerScheduleById(scheduleId: number): Record<string, unknown> | null {
    const schedules = this.getControllerSchedules().schedules;
    if (!Array.isArray(schedules)) {
      return null;
    }
    const matched = schedules.find((value) => value && typeof value === "object" && (value as Record<string, unknown>).schedule_id === scheduleId);
    return matched && typeof matched === "object" ? matched as Record<string, unknown> : null;
  }

  private waitForControllerPumpConfiguration(
    pumpId: number,
    matches: (value: Record<string, unknown>) => boolean
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const poll = () => {
        const current = this.getControllerPumpConfigurations().pumps;
        if (Array.isArray(current)) {
          const matched = current.find((value) => value && typeof value === "object" && (value as Record<string, unknown>).pump_id === pumpId);
          if (matched && typeof matched === "object" && matches(matched as Record<string, unknown>)) {
            resolve(matched as Record<string, unknown>);
            return;
          }
        }

        if (Date.now() - startedAt >= COMMAND_WAIT_TIMEOUT_MS) {
          reject(new Error("Timed out waiting for refreshed controller pump configuration."));
          return;
        }

        setTimeout(poll, 100);
      };

      poll();
    });
  }

  private async buildWeatherProviderServiceRecord(): Promise<Omit<PlatformServiceRecord, "name" | "type" | "criticality">> {
    const health = await this.weatherForecast.checkHealth();
    return {
      status: health.status,
      message: health.message,
      lastChecked: health.last_checked,
      responseTimeMs: null,
      checks: normalizeChecks(health.checks),
      raw: null
    };
  }

  private async buildSqliteServiceRecord(): Promise<Omit<PlatformServiceRecord, "name" | "type" | "criticality">> {
    if (!this.sqliteDatabase) {
      return {
        status: "unknown",
        message: "SQLite is not configured",
        lastChecked: new Date().toISOString(),
        responseTimeMs: 0,
        checks: {
          configuration: {
            status: "unknown",
            message: "SQLite is not configured"
          }
        },
        raw: null
      };
    }

    try {
      this.sqliteDatabase.get("SELECT 1 AS ok");
      return {
        status: "healthy",
        message: "SQLite query succeeded",
        lastChecked: new Date().toISOString(),
        responseTimeMs: 0,
        checks: {
          process: {
            status: "healthy",
            message: "SQLite database is reachable and accepting application queries"
          }
        },
        raw: null
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "SQLite query failed",
        lastChecked: new Date().toISOString(),
        responseTimeMs: 0,
        checks: {
          process: {
            status: "unhealthy",
            message: error instanceof Error ? error.message : "SQLite query failed"
          }
        },
        raw: null
      };
    }
  }

  private buildLocalApiServiceRecord(): Omit<PlatformServiceRecord, "name" | "type" | "criticality"> {
    const natsState = this.nats.snapshot();
    const processStatus: ServiceCheckResult = {
      status: "healthy",
      message: "API process is alive"
    };
    const natsCheck: ServiceCheckResult = {
      status: natsState.status === "ok" ? "healthy" : "unhealthy",
      message: natsState.status === "ok" ? "NATS client connected" : "NATS client disconnected"
    };
    const aggregatorCheck: ServiceCheckResult = {
      status: this.platformHealthMonitor.isStale() ? "unknown" : "healthy",
      message: this.platformHealthMonitor.isStale() ? "Platform health snapshot is stale or not yet collected" : "Platform health snapshot is current"
    };
    const influxService = this.platformHealthMonitor.getSnapshot().services.find((service) => service.name === "influxdb");
    const sqliteService = this.platformHealthMonitor.getSnapshot().services.find((service) => service.name === "sqlite");
    const checks: Record<string, ServiceCheckResult> = {
      process: processStatus,
      nats: natsCheck,
      aggregator: aggregatorCheck
    };
    if (this.config.influx) {
      checks.telemetry_storage = {
        status: influxService?.status ?? "unknown",
        message: influxService?.message ?? "InfluxDB telemetry status is not yet available"
      };
    }
    if (this.config.sqlite) {
      checks.settings_storage = {
        status: sqliteService?.status ?? "unknown",
        message: sqliteService?.message ?? "SQLite settings storage status is not yet available"
      };
    }

    const status: CanonicalServiceStatus =
      natsState.status === "ok"
        ? (
            aggregatorCheck.status === "unknown"
              ? "degraded"
              : this.config.influx && influxService && influxService.status !== "healthy"
                ? "degraded"
                : this.config.sqlite && sqliteService && sqliteService.status !== "healthy"
                  ? "degraded"
                : "healthy"
          )
        : "unhealthy";

    return {
      status,
      message:
        status === "healthy"
          ? "Splash API is ready"
          : status === "degraded"
            ? (
                this.config.influx && influxService && influxService.status !== "healthy"
                  ? "Splash API is reachable but telemetry storage is impaired"
                  : this.config.sqlite && sqliteService && sqliteService.status !== "healthy"
                    ? "Splash API is reachable but SQLite settings storage is impaired"
                  : "Splash API is reachable but platform health data is still warming up"
              )
            : "Splash API is reachable but cannot fully perform its primary role",
      lastChecked: new Date().toISOString(),
      responseTimeMs: 0,
      checks,
      raw: null
    };
  }

  private buildUnconfiguredServiceDefinition(
    name: "prometheus" | "grafana",
    criticality: "optional",
    message: string
  ): ServiceDefinition {
    return {
      name,
      kind: "local",
      type: "third-party",
      criticality,
      check: async () => ({
        status: "unknown",
        message,
        lastChecked: new Date().toISOString(),
        responseTimeMs: 0,
        checks: {
          configuration: {
            status: "unknown",
            message
          }
        },
        raw: null
      })
    };
  }

  private toPumpTelemetryEvent(payload: Record<string, unknown>): {
    occurred_at: string;
    source: {
      service: string;
      label: string;
    };
    pump: {
      pump_id: string;
      controller_id: string;
      controller_type: string;
      bus_address: string;
    };
    metrics: {
      running: boolean | null;
      rpm: number | null;
      watts: number | null;
    };
  } {
    const busAddress = typeof payload.bus_address === "string" ? payload.bus_address.toLowerCase() : null;
    const pumpEntry =
      this.bridge.all().find((entry) => entry.equipmentType === "pump" && entry.busAddress?.toLowerCase() === busAddress) ??
      null;
    const sourcePayload = payload.source;
    const source =
      sourcePayload && typeof sourcePayload === "object" && !Array.isArray(sourcePayload)
        ? (sourcePayload as Record<string, unknown>)
        : null;

    return {
      occurred_at: typeof payload.occurred_at === "string" ? payload.occurred_at : new Date().toISOString(),
      source: {
        service: typeof source?.service === "string" ? source.service : "splash-protocol",
        label: "easytouch.action7"
      },
      pump: {
        pump_id: pumpEntry?.id ?? (busAddress ? `pump-${busAddress.slice(2)}` : "pump-unknown"),
        controller_id: "default",
        controller_type: "easytouch",
        bus_address: busAddress ?? "unknown"
      },
      metrics: {
        running: typeof payload.running === "boolean" ? payload.running : null,
        rpm: typeof payload.rpm === "number" ? payload.rpm : null,
        watts: typeof payload.watts === "number" ? payload.watts : null
      }
    };
  }
}

function mapHeatModeLabel(value: 0 | 1 | 2 | 3): string {
  switch (value) {
    case 0:
      return "off";
    case 1:
      return "heater";
    case 2:
      return "solar_preferred";
    case 3:
      return "solar";
  }
}

function renderStatusSeries(
  metricName: string,
  allowedStatuses: readonly string[],
  activeStatus: string,
  labels: Record<string, string> = {}
): string {
  return allowedStatuses
    .map((status) => `${metricName}${formatLabels({ ...labels, status })} ${status === activeStatus ? 1 : 0}`)
    .join("\n")
    .concat("\n");
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }
  return `{${entries.map(([key, value]) => `${key}="${value}"`).join(",")}}`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "0";
}

function formatNullableMetric(value: number | null): string {
  return value === null ? "NaN" : formatNumber(value);
}

function formatNullableTimestamp(value: string | null): string {
  if (!value) {
    return "NaN";
  }
  const unixSeconds = Date.parse(value) / 1000;
  return Number.isFinite(unixSeconds) ? unixSeconds.toFixed(3) : "NaN";
}

function normalizeChecks(checks: Record<string, ServiceCheckResult>): Record<string, { status: CanonicalServiceStatus; message?: string }> {
  return Object.fromEntries(
    Object.entries(checks).map(([key, value]) => [key, { status: value.status, ...(value.message ? { message: value.message } : {}) }])
  );
}

function mapBrokerStatus(status: "ok" | "unavailable" | "error"): CanonicalServiceStatus {
  switch (status) {
    case "ok":
      return "healthy";
    case "error":
      return "unhealthy";
    case "unavailable":
      return "unknown";
  }
}

function isWeatherHistoryMetric(value: string | null): value is WeatherHistoryMetric {
  return value === "temperature_f"
    || value === "cloud_cover"
    || value === "uv_index"
    || value === "precipitation_probability"
    || value === "precipitation_amount";
}

function sumWeatherHistoryPoints(view: WeatherHistoryView): number {
  const series = Array.isArray(view.series) ? view.series : [];
  let total = 0;
  for (const entry of series) {
    const points = Array.isArray((entry as { points?: unknown[] }).points) ? (entry as { points: unknown[] }).points : [];
    for (const point of points) {
      const rawValue = (point as { value?: unknown }).value;
      const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
      if (Number.isFinite(value)) {
        total += value;
      }
    }
  }
  return total;
}

async function waitForAbort(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    signal.addEventListener(
      "abort",
      () => {
        resolve();
      },
      { once: true }
    );
  });
}
