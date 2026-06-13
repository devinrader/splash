import type {
  ChemistryHistoryResponse,
  ChemistryLatestResponse,
  ChemistryObservationsResponse,
  ChemistryObservationCreateInput,
  ChemistryObservationCreateResponse,
  MaintenanceActivitiesResponse,
  MaintenanceActivityCreateInput,
  MaintenanceActivityCreateResponse,
  ChemicalAdditionsResponse,
  ChemicalAdditionCreateInput,
  ChemicalAdditionCreateResponse,
  ChemistryReadingCreateInput,
  ChemistryReadingCreateResponse,
  PoolCoverCurrentResponse,
  PoolCoverExposureSummaryResponse,
  PoolCoverEventCreateInput,
  PoolCoverEventCreateResponse,
  PoolCoverHistoryResponse,
  CommandAcceptedResponse,
  ControllerClockData,
  ControllerClockUpdateInput,
  ControllerClockUpdateResponse,
  ControllerHeaterConfigurationUpdateInput,
  ControllerHeaterResponse,
  ControllerHeaterSettingsUpdateInput,
  ControllerHeaterUpdateResponse,
  ControllerPumpConfigurationUpdateInput,
  ControllerPumpConfigurationUpdateResponse,
  ControllerPumpConfigurationsResponse,
  CircuitConfigRequestResponse,
  ControllerScheduleUpdateInput,
  ControllerScheduleUpdateResponse,
  ControllerSchedulesResponse,
  PumpTelemetryHistoryResponse,
  PumpCirculationSummaryResponse,
  TemperatureTelemetryHistoryResponse,
  TemperatureTelemetryLatestResponse,
  WeatherHistoryMetric,
  WeatherHistoryResponse,
  WeatherForecastResponse,
  GeocodingSettingsResponse,
  GeocodingProviderConfigSaveInput,
  GeocodingSettingsSaveInput,
  EquipmentResponse,
  PlatformStatusResponse,
  PoolChemistrySettingsResponse,
  PoolChemistrySettingsSaveInput,
  NotificationReadResponse,
  NotificationsReadAllResponse,
  NotificationsResponse,
  NotificationStatusFilter,
  NotificationType,
  MaintenanceRecommendationCategory,
  MaintenanceRecommendationPriority,
  MaintenanceRecommendationsResponse,
  PredictedSwimmabilityResponse,
  SwimmabilityResponse,
  WaterTestingScheduleResponse,
  WaterTestingScheduleSaveInput,
  ProtocolAnnotationConfidence,
  ProtocolAnnotationResponse,
  ProtocolBundleComparisonResponse,
  ProtocolBundleCreatedResponse,
  ProtocolBundleSummaryResponse,
  ProtocolPromptInputType,
  ProtocolPromptResponse,
  RawFrameSendResponse,
  RemoteLayoutRequestResponse,
  WeatherLocationSettingsResponse,
  WeatherLocationSettingsSaveInput
} from "./types";

const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

export function buildApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with '/': ${path}`);
  }

  return `${apiBaseUrl}${path}`;
}

export async function fetchEquipment(): Promise<EquipmentResponse> {
  const response = await fetch(buildApiUrl("/equipment"));
  if (!response.ok) {
    throw new Error(`Equipment request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as EquipmentResponse;
}

export async function fetchPlatformStatus(): Promise<PlatformStatusResponse> {
  const response = await fetch(buildApiUrl("/platform/status"));
  if (!response.ok) {
    throw new Error(`Platform status request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as PlatformStatusResponse;
}

export async function fetchControllerSchedules(): Promise<ControllerSchedulesResponse> {
  const response = await fetch(buildApiUrl("/controller/schedules"));
  if (!response.ok) {
    throw new Error(`Controller schedules request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as ControllerSchedulesResponse;
}

export async function updateControllerSchedule(input: ControllerScheduleUpdateInput): Promise<ControllerScheduleUpdateResponse> {
  const response = await fetch(buildApiUrl(`/controller/schedules/${encodeURIComponent(String(input.scheduleId))}`), {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      mode: input.mode,
      circuit_id: input.circuitId,
      start_time_minutes: input.startTimeMinutes,
      end_time_minutes: input.endTimeMinutes,
      days_mask: input.daysMask,
      runtime_minutes: input.runtimeMinutes
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Controller schedule update failed.");
  }
  return (await response.json()) as ControllerScheduleUpdateResponse;
}

export async function fetchControllerHeater(): Promise<ControllerHeaterResponse> {
  const response = await fetch(buildApiUrl("/controller/heater"));
  if (!response.ok) {
    throw await buildApiError(response, "Controller heater request failed.");
  }
  return (await response.json()) as ControllerHeaterResponse;
}

export async function fetchControllerClock(): Promise<{ data: ControllerClockData; error: unknown }> {
  const response = await fetch(buildApiUrl("/controller/clock"));
  if (!response.ok) {
    throw await buildApiError(response, "Controller clock request failed.");
  }
  return (await response.json()) as { data: ControllerClockData; error: unknown };
}

export async function updateControllerClock(input: ControllerClockUpdateInput): Promise<ControllerClockUpdateResponse> {
  const response = await fetch(buildApiUrl("/controller/clock"), {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      month: input.month,
      day: input.day,
      year: input.year,
      day_of_week: input.dayOfWeek,
      hour_24: input.hour24,
      minute: input.minute,
      daylight_savings_auto: input.daylightSavingsAuto,
      clock_advance: input.clockAdvance
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Controller clock update failed.");
  }
  return (await response.json()) as ControllerClockUpdateResponse;
}

export async function requestControllerClockRefresh(): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl("/protocol/controller-datetime/request"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });
  if (!response.ok) {
    throw await buildApiError(response, "Controller clock refresh request failed.");
  }
  return (await response.json()) as CommandAcceptedResponse;
}

export async function fetchControllerPumpConfigurations(): Promise<ControllerPumpConfigurationsResponse> {
  const response = await fetch(buildApiUrl("/controller/pumps/configuration"));
  if (!response.ok) {
    throw await buildApiError(response, "Controller pump configuration request failed.");
  }
  return (await response.json()) as ControllerPumpConfigurationsResponse;
}

export async function requestPumpInfo(pumpSlot: number): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl("/protocol/pump-info/request"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ pump_slot: pumpSlot })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Controller pump info request failed.");
  }
  return (await response.json()) as CommandAcceptedResponse;
}

export async function updateControllerPumpConfiguration(
  input: ControllerPumpConfigurationUpdateInput
): Promise<ControllerPumpConfigurationUpdateResponse> {
  const response = await fetch(buildApiUrl(`/controller/pumps/${encodeURIComponent(String(input.pumpId))}/configuration`), {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      pump_id: input.pumpId,
      pump_type: input.pumpType,
      priming_time: input.primingTime,
      unknown_3: input.unknown3,
      unknown_4: input.unknown4,
      slots: input.slots,
      priming_speed: input.primingSpeed,
      trailing_bytes: input.trailingBytes
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Controller pump configuration update failed.");
  }
  return (await response.json()) as ControllerPumpConfigurationUpdateResponse;
}

export async function updateControllerHeaterConfiguration(
  input: ControllerHeaterConfigurationUpdateInput
): Promise<ControllerHeaterUpdateResponse> {
  const response = await fetch(buildApiUrl("/controller/heater/configuration"), {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      heater_type: input.heaterType,
      cooling_enabled: input.coolingEnabled,
      freeze_protection_enabled: input.freezeProtectionEnabled
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Controller heater configuration update failed.");
  }
  return (await response.json()) as ControllerHeaterUpdateResponse;
}

export async function updateControllerHeaterSettings(
  input: ControllerHeaterSettingsUpdateInput
): Promise<ControllerHeaterUpdateResponse> {
  const response = await fetch(buildApiUrl("/controller/heater/settings"), {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      pool_setpoint: input.poolSetpoint,
      spa_setpoint: input.spaSetpoint,
      pool_heat_mode: input.poolHeatMode,
      spa_heat_mode: input.spaHeatMode,
      cool_setpoint: input.coolSetpoint
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Controller heater settings update failed.");
  }
  return (await response.json()) as ControllerHeaterUpdateResponse;
}

export async function fetchTemperatureTelemetryLatest(): Promise<TemperatureTelemetryLatestResponse> {
  const response = await fetch(buildApiUrl("/telemetry/temperatures/latest"));
  if (!response.ok) {
    throw new Error(`Temperature latest request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as TemperatureTelemetryLatestResponse;
}

export async function fetchTemperatureTelemetryHistory(input: {
  start: string;
  end: string;
  interval?: string;
}): Promise<TemperatureTelemetryHistoryResponse> {
  const params = new URLSearchParams({
    start: input.start,
    end: input.end
  });
  if (input.interval) {
    params.set("interval", input.interval);
  }
  const response = await fetch(buildApiUrl(`/telemetry/temperatures/history?${params.toString()}`));
  if (!response.ok) {
    throw new Error(`Temperature history request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as TemperatureTelemetryHistoryResponse;
}

export async function fetchPumpTelemetryHistory(input: {
  pumpId?: string;
  start: string;
  end: string;
  interval?: string;
}): Promise<PumpTelemetryHistoryResponse> {
  const params = new URLSearchParams({
    start: input.start,
    end: input.end
  });
  if (input.pumpId) {
    params.set("pumpId", input.pumpId);
  }
  if (input.interval) {
    params.set("interval", input.interval);
  }
  const response = await fetch(buildApiUrl(`/telemetry/pumps/history?${params.toString()}`));
  if (!response.ok) {
    throw new Error(`Pump history request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as PumpTelemetryHistoryResponse;
}

export async function fetchPumpCirculationSummary(input: {
  pumpId?: string;
  window?: "24h" | "72h" | "7d";
} = {}): Promise<PumpCirculationSummaryResponse> {
  const params = new URLSearchParams();
  if (input.pumpId) {
    params.set("pumpId", input.pumpId);
  }
  if (input.window) {
    params.set("window", input.window);
  }
  const query = params.toString();
  const response = await fetch(buildApiUrl(`/telemetry/pumps/circulation-summary${query ? `?${query}` : ""}`));
  if (!response.ok) {
    throw new Error(`Pump circulation summary request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as PumpCirculationSummaryResponse;
}

export async function fetchChemistryLatest(): Promise<ChemistryLatestResponse> {
  const response = await fetch(buildApiUrl("/chemistry/latest"));
  if (!response.ok) {
    throw await buildApiError(response, "Chemistry latest request failed.");
  }
  return (await response.json()) as ChemistryLatestResponse;
}

export async function fetchChemistryHistory(input: {
  start: string;
  end: string;
  interval?: "raw" | "1d";
}): Promise<ChemistryHistoryResponse> {
  const params = new URLSearchParams({
    start: input.start,
    end: input.end
  });
  if (input.interval) {
    params.set("interval", input.interval);
  }
  const response = await fetch(buildApiUrl(`/chemistry/history?${params.toString()}`));
  if (!response.ok) {
    throw await buildApiError(response, "Chemistry history request failed.");
  }
  return (await response.json()) as ChemistryHistoryResponse;
}

export async function createChemistryReading(input: ChemistryReadingCreateInput): Promise<ChemistryReadingCreateResponse> {
  const response = await fetch(buildApiUrl("/chemistry"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ph: input.ph,
      free_chlorine: input.freeChlorine,
      total_chlorine: input.totalChlorine,
      total_alkalinity: input.totalAlkalinity,
      calcium_hardness: input.calciumHardness,
      cyanuric_acid: input.cyanuricAcid,
      source: "manual"
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Chemistry reading save failed.");
  }
  return (await response.json()) as ChemistryReadingCreateResponse;
}

export async function fetchChemistryObservations(input?: {
  start?: string | null;
  end?: string | null;
  limit?: number | null;
}): Promise<ChemistryObservationsResponse> {
  const params = new URLSearchParams();
  if (input?.start) {
    params.set("start", input.start);
  }
  if (input?.end) {
    params.set("end", input.end);
  }
  if (typeof input?.limit === "number") {
    params.set("limit", String(input.limit));
  }
  const path = params.size > 0 ? `/chemistry/observations?${params.toString()}` : "/chemistry/observations";
  const response = await fetch(buildApiUrl(path));
  if (!response.ok) {
    throw await buildApiError(response, "Chemistry observations request failed.");
  }
  return (await response.json()) as ChemistryObservationsResponse;
}

export async function createChemistryObservation(
  input: ChemistryObservationCreateInput
): Promise<ChemistryObservationCreateResponse> {
  const response = await fetch(buildApiUrl("/chemistry/observations"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      clarity: input.clarity ?? null,
      algae_presence: input.algaePresence ?? null,
      debris_level: input.debrisLevel ?? null,
      bather_load_estimate: input.batherLoadEstimate ?? null,
      notes: input.notes ?? null
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Chemistry observation save failed.");
  }
  return (await response.json()) as ChemistryObservationCreateResponse;
}

export async function fetchMaintenanceActivities(input?: {
  start?: string | null;
  end?: string | null;
  limit?: number | null;
}): Promise<MaintenanceActivitiesResponse> {
  const params = new URLSearchParams();
  if (input?.start) {
    params.set("start", input.start);
  }
  if (input?.end) {
    params.set("end", input.end);
  }
  if (typeof input?.limit === "number") {
    params.set("limit", String(input.limit));
  }
  const path = params.size > 0 ? `/chemistry/maintenance?${params.toString()}` : "/chemistry/maintenance";
  const response = await fetch(buildApiUrl(path));
  if (!response.ok) {
    throw await buildApiError(response, "Maintenance activities request failed.");
  }
  return (await response.json()) as MaintenanceActivitiesResponse;
}

export async function createMaintenanceActivity(
  input: MaintenanceActivityCreateInput
): Promise<MaintenanceActivityCreateResponse> {
  const response = await fetch(buildApiUrl("/chemistry/maintenance"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      activity_type: input.activityType,
      notes: input.notes ?? null
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Maintenance activity save failed.");
  }
  return (await response.json()) as MaintenanceActivityCreateResponse;
}

export async function fetchChemicalAdditions(input?: {
  start?: string | null;
  end?: string | null;
  limit?: number | null;
}): Promise<ChemicalAdditionsResponse> {
  const params = new URLSearchParams();
  if (input?.start) {
    params.set("start", input.start);
  }
  if (input?.end) {
    params.set("end", input.end);
  }
  if (typeof input?.limit === "number") {
    params.set("limit", String(input.limit));
  }
  const path = params.size > 0 ? `/chemistry/additions?${params.toString()}` : "/chemistry/additions";
  const response = await fetch(buildApiUrl(path));
  if (!response.ok) {
    throw await buildApiError(response, "Chemical additions request failed.");
  }
  return (await response.json()) as ChemicalAdditionsResponse;
}

export async function createChemicalAddition(input: ChemicalAdditionCreateInput): Promise<ChemicalAdditionCreateResponse> {
  const response = await fetch(buildApiUrl("/chemistry/additions"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chemical_type: input.chemicalType,
      amount: input.amount,
      unit: input.unit,
      notes: input.notes ?? null
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Chemical addition save failed.");
  }
  return (await response.json()) as ChemicalAdditionCreateResponse;
}

export async function fetchCurrentPoolCover(): Promise<PoolCoverCurrentResponse> {
  const response = await fetch(buildApiUrl("/pool/cover"));
  if (!response.ok) {
    throw await buildApiError(response, "Pool cover request failed.");
  }
  return (await response.json()) as PoolCoverCurrentResponse;
}

export async function fetchPoolCoverHistory(input: {
  start?: string;
  end?: string;
  limit?: number;
} = {}): Promise<PoolCoverHistoryResponse> {
  const params = new URLSearchParams();
  if (input.start) {
    params.set("start", input.start);
  }
  if (input.end) {
    params.set("end", input.end);
  }
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit));
  }

  const suffix = params.toString();
  const response = await fetch(buildApiUrl(suffix ? `/pool/cover/history?${suffix}` : "/pool/cover/history"));
  if (!response.ok) {
    throw await buildApiError(response, "Pool cover history request failed.");
  }
  return (await response.json()) as PoolCoverHistoryResponse;
}

export async function fetchPoolCoverExposureSummary(input?: {
  window?: "24h" | "72h" | "7d";
}): Promise<PoolCoverExposureSummaryResponse> {
  const params = new URLSearchParams();
  if (input?.window) {
    params.set("window", input.window);
  }
  const suffix = params.toString();
  const response = await fetch(
    buildApiUrl(suffix ? `/pool/cover/exposure-summary?${suffix}` : "/pool/cover/exposure-summary")
  );
  if (!response.ok) {
    throw await buildApiError(response, "Pool cover exposure summary request failed.");
  }
  return (await response.json()) as PoolCoverExposureSummaryResponse;
}

export async function createPoolCoverEvent(input: PoolCoverEventCreateInput): Promise<PoolCoverEventCreateResponse> {
  const response = await fetch(buildApiUrl("/pool/cover"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      state: input.state,
      cover_type: input.coverType
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Pool cover save failed.");
  }
  return (await response.json()) as PoolCoverEventCreateResponse;
}

export async function fetchSwimmability(): Promise<SwimmabilityResponse> {
  const response = await fetch(buildApiUrl("/swimmability"));
  if (!response.ok) {
    throw await buildApiError(response, "Swimmability request failed.");
  }
  return (await response.json()) as SwimmabilityResponse;
}

export async function fetchPredictedSwimmability(): Promise<PredictedSwimmabilityResponse> {
  const response = await fetch(buildApiUrl("/swimmability/predicted"));
  if (!response.ok) {
    throw await buildApiError(response, "Predicted swimmability request failed.");
  }
  return (await response.json()) as PredictedSwimmabilityResponse;
}

export async function fetchMaintenanceRecommendations(input: {
  limit?: number;
  category?: MaintenanceRecommendationCategory;
  priority?: MaintenanceRecommendationPriority;
} = {}): Promise<MaintenanceRecommendationsResponse> {
  const params = new URLSearchParams();
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit));
  }
  if (input.category) {
    params.set("category", input.category);
  }
  if (input.priority) {
    params.set("priority", input.priority);
  }

  const suffix = params.toString();
  const response = await fetch(buildApiUrl(suffix ? `/maintenance/recommendations?${suffix}` : "/maintenance/recommendations"));
  if (!response.ok) {
    throw await buildApiError(response, "Maintenance recommendations request failed.");
  }
  return (await response.json()) as MaintenanceRecommendationsResponse;
}

export async function fetchNotifications(input: {
  status?: NotificationStatusFilter;
  limit?: number;
  type?: NotificationType | "all";
} = {}): Promise<NotificationsResponse> {
  const params = new URLSearchParams();
  if (input.status) {
    params.set("status", input.status);
  }
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit));
  }
  if (input.type && input.type !== "all") {
    params.set("type", input.type);
  }

  const suffix = params.toString();
  const response = await fetch(buildApiUrl(suffix ? `/notifications?${suffix}` : "/notifications"));
  if (!response.ok) {
    throw await buildApiError(response, "Notifications request failed.");
  }
  return (await response.json()) as NotificationsResponse;
}

export async function markNotificationRead(id: string): Promise<NotificationReadResponse> {
  const response = await fetch(buildApiUrl(`/notifications/${encodeURIComponent(id)}/read`), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });
  if (!response.ok) {
    throw await buildApiError(response, "Notification update failed.");
  }
  return (await response.json()) as NotificationReadResponse;
}

export async function markAllNotificationsRead(): Promise<NotificationsReadAllResponse> {
  const response = await fetch(buildApiUrl("/notifications/read-all"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });
  if (!response.ok) {
    throw await buildApiError(response, "Notification bulk update failed.");
  }
  return (await response.json()) as NotificationsReadAllResponse;
}

export async function fetchWeatherForecast(): Promise<WeatherForecastResponse> {
  const response = await fetch(buildApiUrl("/weather/forecast"));
  if (!response.ok) {
    throw new Error(`Weather forecast request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as WeatherForecastResponse;
}

export async function fetchWeatherLocationSettings(): Promise<WeatherLocationSettingsResponse> {
  const response = await fetch(buildApiUrl("/api/settings/weather-location"));
  if (!response.ok) {
    throw await buildApiError(response, "Weather location settings request failed.");
  }
  return (await response.json()) as WeatherLocationSettingsResponse;
}

export async function saveWeatherLocationSettings(input: WeatherLocationSettingsSaveInput): Promise<WeatherLocationSettingsResponse> {
  const response = await fetch(buildApiUrl("/api/settings/weather-location"), {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw await buildApiError(response, "Weather location settings save failed.");
  }
  return (await response.json()) as WeatherLocationSettingsResponse;
}

export async function fetchGeocodingSettings(): Promise<GeocodingSettingsResponse> {
  const response = await fetch(buildApiUrl("/api/settings/geocoding"));
  if (!response.ok) {
    throw await buildApiError(response, "Geocoding settings request failed.");
  }
  return (await response.json()) as GeocodingSettingsResponse;
}

export async function saveGeocodingSettings(input: GeocodingSettingsSaveInput): Promise<GeocodingSettingsResponse> {
  const response = await fetch(buildApiUrl("/api/settings/geocoding"), {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw await buildApiError(response, "Geocoding settings save failed.");
  }
  return (await response.json()) as GeocodingSettingsResponse;
}

export async function saveGeocodingProviderConfig(
  input: GeocodingProviderConfigSaveInput
): Promise<GeocodingSettingsResponse> {
  const response = await fetch(buildApiUrl(`/api/settings/geocoding/provider/${encodeURIComponent(input.providerId)}`), {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      config: input.config
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Geocoding provider config save failed.");
  }
  return (await response.json()) as GeocodingSettingsResponse;
}

export async function fetchPoolChemistrySettings(): Promise<PoolChemistrySettingsResponse> {
  const response = await fetch(buildApiUrl("/api/settings/pool-chemistry"));
  if (!response.ok) {
    throw await buildApiError(response, "Pool chemistry settings request failed.");
  }
  return (await response.json()) as PoolChemistrySettingsResponse;
}

export async function savePoolChemistrySettings(input: PoolChemistrySettingsSaveInput): Promise<PoolChemistrySettingsResponse> {
  const response = await fetch(buildApiUrl("/api/settings/pool-chemistry"), {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      settings: input.settings.map((entry) => ({
        chemicalKey: entry.chemicalKey,
        minimum: entry.minimum,
        target: entry.target,
        maximum: entry.maximum,
        enabled: entry.enabled,
        source_mode: entry.sourceMode,
        source_binding: entry.sourceBinding
      })),
      chemistry_prompt_interval_days: input.chemistryPromptIntervalDays
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Pool chemistry settings save failed.");
  }
  return (await response.json()) as PoolChemistrySettingsResponse;
}

export async function fetchWaterTestingSchedule(): Promise<WaterTestingScheduleResponse> {
  const response = await fetch(buildApiUrl("/api/settings/water-testing-schedule"));
  if (!response.ok) {
    throw await buildApiError(response, "Water testing schedule request failed.");
  }
  return (await response.json()) as WaterTestingScheduleResponse;
}

export async function saveWaterTestingSchedule(input: WaterTestingScheduleSaveInput): Promise<WaterTestingScheduleResponse> {
  const response = await fetch(buildApiUrl("/api/settings/water-testing-schedule"), {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      items: input.items.map((item) => ({
        chemicalKey: item.chemicalKey,
        enabled: item.enabled,
        expectedIntervalValue: item.expectedIntervalValue,
        expectedIntervalUnit: item.expectedIntervalUnit,
        staleThresholdValue: item.staleThresholdValue,
        staleThresholdUnit: item.staleThresholdUnit,
        unavailableThresholdValue: item.unavailableThresholdValue,
        unavailableThresholdUnit: item.unavailableThresholdUnit
      }))
    })
  });
  if (!response.ok) {
    throw await buildApiError(response, "Water testing schedule save failed.");
  }
  return (await response.json()) as WaterTestingScheduleResponse;
}

export async function resetWaterTestingSchedule(): Promise<WaterTestingScheduleResponse> {
  const response = await fetch(buildApiUrl("/api/settings/water-testing-schedule/reset"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });
  if (!response.ok) {
    throw await buildApiError(response, "Water testing schedule reset failed.");
  }
  return (await response.json()) as WaterTestingScheduleResponse;
}

export async function fetchWeatherHistory(input: {
  metric: WeatherHistoryMetric;
  start: string;
  end: string;
  interval?: string;
}): Promise<WeatherHistoryResponse> {
  const params = new URLSearchParams({
    metric: input.metric,
    start: input.start,
    end: input.end
  });
  if (input.interval) {
    params.set("interval", input.interval);
  }
  const response = await fetch(buildApiUrl(`/weather/history?${params.toString()}`));
  if (!response.ok) {
    throw new Error(`Weather history request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as WeatherHistoryResponse;
}

export async function requestPumpSpeed(input: {
  equipmentId: string;
  rpm: number;
  circuitKey?: string | null;
}): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl(`/equipment/${encodeURIComponent(input.equipmentId)}/control`), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      command_type: "set_speed",
      circuit_key: input.circuitKey ?? null,
      arguments: {
        rpm: input.rpm
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Pump speed request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as CommandAcceptedResponse;
}

export async function requestCircuitState(input: {
  equipmentId: string;
  circuitKey: string;
  enabled: boolean;
}): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl(`/equipment/${encodeURIComponent(input.equipmentId)}/control`), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      command_type: "set_circuit_state",
      circuit_key: input.circuitKey,
      arguments: {
        enabled: input.enabled
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Circuit state request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as CommandAcceptedResponse;
}

export async function fetchProtocolBundles(): Promise<ProtocolBundleSummaryResponse> {
  const response = await fetch(buildApiUrl("/protocol/bundles"));
  if (!response.ok) {
    throw new Error(`Protocol bundles request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as ProtocolBundleSummaryResponse;
}

export async function createProtocolBundle(input: { label: string | null }): Promise<ProtocolBundleCreatedResponse> {
  const response = await fetch(buildApiUrl("/protocol/bundles"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      label: input.label
    })
  });

  if (!response.ok) {
    throw new Error(`Protocol bundle creation failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as ProtocolBundleCreatedResponse;
}

export async function requestCircuitConfig(input: {
  startIndex?: number;
  endIndex?: number;
} = {}): Promise<CircuitConfigRequestResponse> {
  const response = await fetch(buildApiUrl("/protocol/circuit-config/request"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      start_index: input.startIndex ?? 1,
      end_index: input.endIndex ?? 20
    })
  });

  if (!response.ok) {
    throw new Error(`Circuit config request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as CircuitConfigRequestResponse;
}

export async function requestControllerDatetime(): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl("/protocol/controller-datetime/request"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Controller datetime request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as CommandAcceptedResponse;
}

export async function syncControllerDatetime(): Promise<CommandAcceptedResponse> {
  const response = await fetch(buildApiUrl("/protocol/controller-datetime/sync"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Controller datetime sync failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as CommandAcceptedResponse;
}

export async function compareProtocolBundles(input: {
  baselineBundleId: string;
  comparisonBundleId: string;
}): Promise<ProtocolBundleComparisonResponse> {
  const response = await fetch(buildApiUrl("/protocol/bundles/compare"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      baseline_bundle_id: input.baselineBundleId,
      comparison_bundle_id: input.comparisonBundleId
    })
  });

  if (!response.ok) {
    throw new Error(`Protocol bundle comparison failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as ProtocolBundleComparisonResponse;
}

export async function fetchProtocolAnnotations(bundleId: string): Promise<ProtocolAnnotationResponse> {
  const response = await fetch(buildApiUrl(`/protocol/annotations?bundle_id=${encodeURIComponent(bundleId)}`));
  if (!response.ok) {
    throw new Error(`Protocol annotations request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as ProtocolAnnotationResponse;
}

export async function createProtocolAnnotation(input: {
  bundleId: string;
  frameIndex: number;
  fieldName: string;
  byteStart: number;
  byteEnd: number;
  confidence: ProtocolAnnotationConfidence;
  label: string;
  notes: string | null;
}): Promise<{ data: unknown; error: unknown }> {
  const response = await fetch(buildApiUrl("/protocol/annotations"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      bundle_id: input.bundleId,
      frame_index: input.frameIndex,
      field_name: input.fieldName,
      byte_start: input.byteStart,
      byte_end: input.byteEnd,
      confidence: input.confidence,
      label: input.label,
      notes: input.notes
    })
  });

  if (!response.ok) {
    throw new Error(`Protocol annotation creation failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as { data: unknown; error: unknown };
}

export async function fetchProtocolPrompts(bundleId: string): Promise<ProtocolPromptResponse> {
  const response = await fetch(buildApiUrl(`/protocol/prompts?bundle_id=${encodeURIComponent(bundleId)}`));
  if (!response.ok) {
    throw new Error(`Protocol prompts request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as ProtocolPromptResponse;
}

export async function createProtocolPrompt(input: {
  bundleId: string;
  frameIndex: number;
  fieldName: string | null;
  prompt: string;
  why: string;
  inputType: ProtocolPromptInputType;
  operatorResponse: string | null;
}): Promise<{ data: unknown; error: unknown }> {
  const response = await fetch(buildApiUrl("/protocol/prompts"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      bundle_id: input.bundleId,
      frame_index: input.frameIndex,
      field_name: input.fieldName,
      prompt: input.prompt,
      why: input.why,
      input_type: input.inputType,
      operator_response: input.operatorResponse
    })
  });

  if (!response.ok) {
    throw new Error(`Protocol prompt creation failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as { data: unknown; error: unknown };
}

export async function requestRemoteLayoutPage(input: { pageIndex: number }): Promise<RemoteLayoutRequestResponse> {
  const response = await fetch(buildApiUrl("/protocol/remote-layout/request"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      page_index: input.pageIndex
    })
  });

  if (!response.ok) {
    throw new Error(`Remote Layout request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as RemoteLayoutRequestResponse;
}

export async function sendRawProtocolFrame(input: {
  protocolName: string;
  bytesHex: string;
}): Promise<RawFrameSendResponse> {
  const response = await fetch(buildApiUrl("/protocol/raw-frame/send"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      protocol_name: input.protocolName,
      bytes_hex: input.bytesHex
    })
  });

  if (!response.ok) {
    throw new Error(`Raw frame send failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as RawFrameSendResponse;
}

function normalizeBaseUrl(value: string | undefined): string {
  if (!value) {
    return "";
  }

  if (value === "/") {
    return "";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function buildApiError(response: Response, fallbackMessage: string): Promise<Error> {
  try {
    const parsed = (await response.json()) as { error?: unknown };
    if (parsed && typeof parsed.error === "object" && parsed.error !== null) {
      const record = parsed.error as { message?: unknown };
      if (typeof record.message === "string") {
        const error = new Error(record.message);
        (error as Error & { details?: unknown }).details = parsed.error;
        return error;
      }
    }
    if (typeof parsed?.error === "string") {
      return new Error(parsed.error);
    }
  } catch {}

  return new Error(`${fallbackMessage} HTTP ${response.status}.`);
}
