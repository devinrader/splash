export interface EquipmentRecord {
  id: string;
  equipment_type: "controller" | "pump" | "chlorinator";
  display_name: string;
  protocol_name: string;
  bus_address?: string | null;
  control_circuit_keys?: string[];
  default_control_circuit_key?: string | null;
  hardware?: {
    circuits?: ControllerCircuitHardwareRecord[];
  };
  latest_state: Record<string, unknown>;
}

export interface ControllerCircuitHardwareRecord {
  circuit_key: string;
  display_name: string;
  circuit_type: string;
  installed: boolean;
  writable: boolean;
  configuration_circuit_index: number | null;
  write_circuit_id: number | null;
}

export interface EquipmentResponse {
  data: EquipmentRecord[];
  error: unknown;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
  message?: string;
  checks?: Record<string, { status: string; message?: string }>;
  error: unknown;
}

export interface PlatformStatusResponse {
  overall: "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
  generatedAt: string;
  connectivity?: {
    rs485?: {
      rx_messages_per_second?: number | null;
      tx_messages_per_second?: number | null;
    };
    nats_broker?: {
      status?: "ok" | "unavailable" | "error";
      subscriptions?: number | null;
      in_messages_per_second?: number | null;
      out_messages_per_second?: number | null;
      last_sample_at?: string | null;
      error_code?: string | null;
    };
  };
  services: PlatformServiceHealthRecord[];
}

export interface ControllerScheduleRecord {
  controller_family: "EasyTouch";
  frame_type: "easytouch_schedule" | "easytouch_egg_timer";
  action: number | null;
  schedule_id: number | null;
  circuit_id?: number | null;
  active: boolean | null;
  schedule_type?: number | null;
  schedule_type_label?: string | null;
  start_time_minutes?: number | null;
  end_time_minutes?: number | null;
  schedule_days?: number | null;
  egg_timer_run_time_minutes?: number | null;
  parse_confidence: "high" | "medium" | "invalid" | null;
  warnings: string[];
  raw_payload: number[];
  updated_at: string | null;
}

export interface ControllerSchedulesData {
  source: "controller_native";
  controller_type: "easytouch";
  status: "available" | "unavailable" | "stale";
  message: string;
  last_checked: string | null;
  schedules: ControllerScheduleRecord[];
  observed_payloads?: Array<{
    payload_hex: string | null;
    payload_length: number | null;
    updated_at: string | null;
  }>;
}

export interface ControllerSchedulesResponse {
  data: ControllerSchedulesData;
  error: unknown;
}

export interface ControllerScheduleUpdateInput {
  scheduleId: number;
  mode: "repeat" | "egg_timer";
  circuitId: number;
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  daysMask?: number;
  runtimeMinutes?: number;
}

export interface ControllerScheduleUpdateResponse {
  data: {
    command_id: string;
    status: "completed";
    schedule: ControllerScheduleRecord;
  };
  error: unknown;
}

export interface ControllerHeaterData {
  source: "controller_native";
  controller_type: "easytouch";
  status: "available" | "unavailable";
  message: string;
  last_checked: string | null;
  configuration: {
    detected_heater_type: string | null;
    solar_or_heat_pump_enabled: boolean | null;
    heating_enabled: boolean | null;
    cooling_enabled: boolean | null;
    freeze_protection_enabled: boolean | null;
    raw_payload: number[];
    updated_at: string | null;
  };
  settings: {
    pool_setpoint: number | null;
    spa_setpoint: number | null;
    cool_setpoint: number | null;
    pool_heat_mode: string | null;
    spa_heat_mode: string | null;
    heat_setting_byte: number | null;
    source: "controller_status" | "command_cache" | null;
    updated_at: string | null;
  };
  capabilities: {
    editable_configuration_fields: string[];
    editable_setting_fields: string[];
  };
}

export interface ControllerHeaterResponse {
  data: ControllerHeaterData;
  error: unknown;
}

export interface ControllerHeaterConfigurationUpdateInput {
  heaterType: "ultratempHeatPumpCom" | "ultratempEtiHybrid";
  coolingEnabled: boolean;
  freezeProtectionEnabled: boolean;
}

export interface ControllerHeaterSettingsUpdateInput {
  poolSetpoint: number;
  spaSetpoint: number;
  poolHeatMode: 0 | 1 | 2 | 3;
  spaHeatMode: 0 | 1 | 2 | 3;
  coolSetpoint: number;
}

export interface ControllerHeaterUpdateResponse {
  data: {
    command_id: string;
    status: "completed";
    heater: ControllerHeaterData;
  };
  error: unknown;
}

export interface ControllerClockData {
  source: "controller_native";
  controller_type: "easytouch";
  status: "available" | "unavailable";
  message: string;
  last_checked: string | null;
  summary: {
    month: number | null;
    day: number | null;
    year: number | null;
    day_of_week: number | null;
    hour_24: number | null;
    minute: number | null;
    daylight_savings_auto: boolean | null;
    clock_advance: number | null;
    source: "controller_status" | "controller_datetime_reply" | "combined" | null;
    updated_at: string | null;
  };
  capabilities: {
    editable_fields: string[];
    provisional_fields: string[];
  };
}

export interface ControllerClockUpdateInput {
  month: number;
  day: number;
  year: number;
  dayOfWeek: number;
  hour24: number;
  minute: number;
  daylightSavingsAuto: boolean | null;
  clockAdvance: number | null;
}

export interface ControllerClockUpdateResponse {
  data: {
    command_id: string;
    status: "completed";
    clock: ControllerClockData;
  };
  error: unknown;
}

export interface ControllerPumpConfigurationSlot {
  slot: number;
  circuit_assignment: number | null;
  rpm: number | null;
}

export interface ControllerPumpConfigurationData {
  pump_id: number;
  installed: boolean;
  pump_type: number | null;
  pump_type_label: string | null;
  supported_branch: "vf" | "vs" | "unknown" | null;
  priming_time: number | null;
  unknown_3: number | null;
  unknown_4: number | null;
  priming_speed: number | null;
  slots: ControllerPumpConfigurationSlot[];
  trailing_bytes: number[];
  updated_at: string | null;
}

export interface ControllerPumpConfigurationsResponse {
  data: {
    source: "controller_native";
    controller_type: "easytouch";
    status: "available" | "unavailable";
    message: string;
    last_checked: string | null;
    pumps: ControllerPumpConfigurationData[];
  };
  error: unknown;
}

export interface ControllerPumpConfigurationUpdateInput {
  pumpId: number;
  pumpType: number;
  primingTime: number;
  unknown3: number;
  unknown4: number;
  slots: Array<{ circuit_assignment: number; rpm: number }>;
  primingSpeed: number;
  trailingBytes: number[];
}

export interface ControllerPumpConfigurationUpdateResponse {
  data: {
    command_id: string;
    status: "completed";
    pump_configuration: ControllerPumpConfigurationData;
  };
  error: unknown;
}

export interface TemperatureLatestReading {
  timestamp: string;
  original_value: number;
  original_unit: "F" | "C";
  normalized_f: number;
  normalized_c: number;
  raw_byte: number | null;
  controller_timestamp: string | null;
}

export interface TemperatureTelemetryLatestData {
  controller_id: string;
  status: "available" | "empty";
  message: string;
  last_updated: string | null;
  readings: Partial<Record<"air" | "pool_water" | "spa_water" | "solar", TemperatureLatestReading>>;
}

export interface TemperatureTelemetryLatestResponse {
  data: TemperatureTelemetryLatestData;
  error: unknown;
}

export interface TemperatureTelemetryHistoryPoint {
  timestamp: string;
  value: number;
  normalizedF: number;
  normalizedC: number;
}

export interface TemperatureTelemetryHistorySeries {
  sensor_type: "air" | "pool_water" | "spa_water" | "solar";
  unit: "F" | "C";
  points: TemperatureTelemetryHistoryPoint[];
}

export interface TemperatureTelemetryHistoryData {
  controller_id: string;
  range: {
    start: string;
    end: string;
  };
  interval: string | null;
  series: TemperatureTelemetryHistorySeries[];
}

export interface TemperatureTelemetryHistoryResponse {
  data: TemperatureTelemetryHistoryData;
  error: unknown;
}

export interface PumpTelemetryHistoryPoint {
  timestamp: string;
  running: boolean;
  rpm: number;
  watts: number;
}

export interface PumpTelemetryHistorySeries {
  pump_id: string;
  controller_id: string;
  controller_type: string;
  bus_address: string;
  points: PumpTelemetryHistoryPoint[];
}

export interface PumpTelemetryHistoryData {
  range: {
    start: string;
    end: string;
  };
  interval: string | null;
  series: PumpTelemetryHistorySeries[];
}

export interface PumpTelemetryHistoryResponse {
  data: PumpTelemetryHistoryData;
  error: unknown;
}

export interface WeatherForecastDailyEntry {
  date: string;
  weather_code: number | null;
  high_temp_f: number | null;
  high_temp_c: number | null;
  low_temp_f: number | null;
  low_temp_c: number | null;
  precipitation_probability_max: number | null;
  precipitation_amount: number | null;
  precipitation_unit: "mm";
  uv_index_max: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherForecastHourlyEntry {
  timestamp: string;
  temperature_f: number | null;
  temperature_c: number | null;
  relative_humidity: number | null;
  dew_point_f: number | null;
  dew_point_c: number | null;
  precipitation_probability: number | null;
  precipitation_amount: number | null;
  precipitation_unit: "mm";
  cloud_cover: number | null;
  wind_speed_mph: number | null;
  wind_speed_kph: number | null;
  wind_gusts_mph: number | null;
  wind_gusts_kph: number | null;
  uv_index: number | null;
}

export interface WeatherForecastData {
  pool_id: string;
  provider: string;
  status: "available" | "empty";
  message: string;
  stale: boolean;
  fetched_at: string | null;
  location: {
    latitude: number;
    longitude: number;
    timezone: string | null;
    source: "manual" | "geocoded";
    name: string | null;
  } | null;
  daily: WeatherForecastDailyEntry[];
  hourly: WeatherForecastHourlyEntry[];
}

export interface WeatherForecastResponse {
  data: WeatherForecastData;
  error: unknown;
}

export type WeatherLocationMode = "address" | "coordinates";
export type WeatherLocationStatus = "resolved" | "requires_geocoding";

export interface WeatherLocationSettingsData {
  poolId: string;
  locationMode: WeatherLocationMode;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  geocodedLatitude: number | null;
  geocodedLongitude: number | null;
  geocodeProvider: string | null;
  geocodedAt: string | null;
  locationStatus: WeatherLocationStatus;
}

export interface WeatherLocationSettingsResponse {
  data: WeatherLocationSettingsData;
  error: unknown;
}

export interface WeatherLocationSettingsValidationError {
  code: "validation_error";
  message: string;
  details?: Record<string, string>;
}

export interface WeatherLocationSettingsSaveInput {
  locationMode: WeatherLocationMode;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
}

export type PoolChemistryKey =
  | "free_chlorine"
  | "combined_chlorine"
  | "ph"
  | "total_alkalinity"
  | "cyanuric_acid"
  | "calcium_hardness"
  | "salt"
  | "water_temperature"
  | "phosphates"
  | "borates";

export interface PoolChemistrySetting {
  chemicalKey: PoolChemistryKey;
  displayName: string;
  unit: string | null;
  minimum: number | null;
  target: number | null;
  maximum: number | null;
  enabled: boolean;
  sortOrder: number;
}

export interface PoolChemistrySettingsData {
  settings: PoolChemistrySetting[];
  source: "sqlite" | "defaults";
}

export interface PoolChemistrySettingsResponse {
  data: PoolChemistrySettingsData;
  error: unknown;
}

export interface PoolChemistrySettingsSaveInput {
  settings: Array<{
    chemicalKey: PoolChemistryKey;
    minimum?: number | null;
    target?: number | null;
    maximum?: number | null;
    enabled?: boolean;
  }>;
}

export type ChemistryHistoryMetric =
  | "ph"
  | "free_chlorine"
  | "total_chlorine"
  | "total_alkalinity"
  | "calcium_hardness"
  | "cyanuric_acid";

export interface ChemistryReadingRecord {
  id: string;
  pool_id: string;
  ph: number | null;
  free_chlorine: number | null;
  total_chlorine: number | null;
  total_alkalinity: number | null;
  calcium_hardness: number | null;
  cyanuric_acid: number | null;
  source: "manual" | "sensor";
  recorded_at: string;
  created_at: string;
}

export interface ChemistryHistoryPoint {
  recorded_at: string;
  value: number;
}

export interface ChemistryHistorySeries {
  metric: ChemistryHistoryMetric;
  points: ChemistryHistoryPoint[];
}

export interface ChemistryHistoryData {
  start: string;
  end: string;
  interval: "raw" | "1d";
  readings: ChemistryReadingRecord[];
  series: ChemistryHistorySeries[];
}

export interface ChemistryLatestResponse {
  data: ChemistryReadingRecord | null;
  error: unknown;
}

export interface ChemistryHistoryResponse {
  data: ChemistryHistoryData;
  error: unknown;
}

export interface ChemistryReadingCreateInput {
  ph?: number | null;
  freeChlorine?: number | null;
  totalChlorine?: number | null;
  totalAlkalinity?: number | null;
  calciumHardness?: number | null;
  cyanuricAcid?: number | null;
}

export interface ChemistryReadingCreateResponse {
  data: {
    reading: ChemistryReadingRecord;
    warnings: string[];
  };
  error: unknown;
}

export type PoolCoverState = "on" | "off";
export type PoolCoverType = "unknown" | "solar" | "winter" | "safety" | "automatic";

export interface PoolCoverEventRecord {
  id: string;
  pool_id: string;
  state: PoolCoverState;
  cover_type: PoolCoverType;
  source: "manual";
  recorded_at: string;
  created_at: string;
}

export interface PoolCoverCurrentData {
  current: PoolCoverEventRecord | null;
}

export interface PoolCoverHistoryData {
  start: string | null;
  end: string | null;
  limit: number;
  events: PoolCoverEventRecord[];
}

export interface PoolCoverCurrentResponse {
  data: PoolCoverCurrentData;
  error: unknown;
}

export interface PoolCoverHistoryResponse {
  data: PoolCoverHistoryData;
  error: unknown;
}

export interface PoolCoverEventCreateInput {
  state: PoolCoverState;
  coverType?: PoolCoverType;
}

export interface PoolCoverEventCreateResponse {
  data: PoolCoverEventRecord;
  error: unknown;
}

export type SwimmabilityStatus = "good" | "caution" | "poor" | "unknown";
export type SwimmabilityDriverSeverity = "good" | "neutral" | "caution" | "poor" | "unknown";
export type SwimmabilityConfidence = "high" | "medium" | "low" | "unknown";
export type SwimmabilityHighlightTone = "positive" | "neutral" | "caution" | "negative";

export interface SwimmabilityDriver {
  key: string;
  severity: SwimmabilityDriverSeverity;
  message: string;
}

export interface SwimmabilityHighlight {
  tone: SwimmabilityHighlightTone;
  label: string;
}

export interface SwimmabilityData {
  status: SwimmabilityStatus;
  score: number;
  summary: string;
  headline: string;
  confidence: SwimmabilityConfidence;
  last_chemistry_age_label: string | null;
  highlights: SwimmabilityHighlight[];
  updated_at: string;
  drivers: SwimmabilityDriver[];
  inputs: {
    chemistry_latest_at: string | null;
    cover_latest_at: string | null;
    forecast_fetched_at: string | null;
    telemetry_latest_at: string | null;
  };
}

export interface SwimmabilityResponse {
  data: SwimmabilityData;
  error: unknown;
}

export type WeatherHistoryMetric =
  | "temperature_f"
  | "cloud_cover"
  | "uv_index"
  | "precipitation_probability"
  | "precipitation_amount";

export interface WeatherHistoryPoint {
  timestamp: string;
  value: number;
}

export interface WeatherHistorySeries {
  metric: WeatherHistoryMetric;
  points: WeatherHistoryPoint[];
}

export interface WeatherHistoryData {
  pool_id: string;
  provider: string;
  metric: WeatherHistoryMetric;
  status: "available" | "empty";
  message: string;
  stale: boolean;
  fetched_at: string | null;
  range: {
    start: string;
    end: string;
  };
  interval: string | null;
  series: WeatherHistorySeries[];
}

export interface WeatherHistoryResponse {
  data: WeatherHistoryData;
  error: unknown;
}

export interface PlatformServiceHealthRecord {
  name: string;
  type: "splash" | "third-party";
  criticality: "critical" | "important" | "optional";
  status: "healthy" | "degraded" | "unhealthy" | "down" | "unknown";
  message: string;
  lastChecked: string | null;
  responseTimeMs: number | null;
  checks?: Record<string, { status: string; message?: string }>;
}

export interface ConnectivityHistorySample {
  recorded_at: string;
  rs485_in_messages_per_second: number | null;
  rs485_out_messages_per_second: number | null;
  nats_in_messages_per_second: number | null;
  nats_out_messages_per_second: number | null;
}

export interface CommandAcceptedResponse {
  data: {
    command_id: string;
    status: string;
  };
  error: unknown;
}

export interface RemoteLayoutRequestResponse {
  data: {
    command_id: string;
    status: string;
  };
  error: unknown;
}

export interface RawFrameSendResponse {
  data: {
    command_id: string;
    status: string;
  };
  error: unknown;
}

export interface CircuitConfigRequestResponse {
  data: {
    command_id: string;
    status: string;
  };
  error: unknown;
}

export interface CommandResultEvent {
  command_id?: string;
  status?: string;
  detail?: string;
  error_code?: string | null;
  reported_at?: string;
}

export interface DashboardCardValue {
  value: number | null;
  unit: string;
  label: string;
}

export interface ProtocolFrameEvent {
  event: string;
  payload: Record<string, unknown>;
  received_at: string;
}

export interface ProtocolBundleSummary {
  id: string;
  label: string | null;
  frame_count: number;
  created_at: string;
}

export interface ProtocolBundleSummaryResponse {
  data: ProtocolBundleSummary[];
  error: unknown;
}

export interface ProtocolBundleCreatedResponse {
  data: ProtocolBundleSummary;
  error: unknown;
}

export interface ProtocolFieldByteChange {
  byte_index: number;
  baseline: string;
  comparison: string;
}

export interface ProtocolChangedField {
  field: string;
  byte_changes: ProtocolFieldByteChange[];
}

export interface ProtocolFramePairDiff {
  index: number;
  baseline_event: string | null;
  comparison_event: string | null;
  baseline_payload: Record<string, unknown> | null;
  comparison_payload: Record<string, unknown> | null;
  changed_fields: ProtocolChangedField[];
}

export interface ProtocolBundleComparison {
  baseline_bundle_id: string;
  comparison_bundle_id: string;
  frame_pairs: ProtocolFramePairDiff[];
}

export interface ProtocolBundleComparisonResponse {
  data: ProtocolBundleComparison;
  error: unknown;
}

export type ProtocolAnnotationConfidence = "known" | "inferred" | "unknown";

export interface ProtocolAnnotation {
  id: string;
  bundle_id: string;
  frame_index: number;
  field_name: string;
  byte_start: number;
  byte_end: number;
  confidence: ProtocolAnnotationConfidence;
  label: string;
  notes: string | null;
  created_at: string;
}

export interface ProtocolAnnotationResponse {
  data: ProtocolAnnotation[];
  error: unknown;
}

export type ProtocolPromptInputType =
  | "controller_menu_state"
  | "equipment_behavior"
  | "circuit_name"
  | "configured_rpm";

export interface ProtocolPrompt {
  id: string;
  bundle_id: string;
  frame_index: number;
  field_name: string | null;
  prompt: string;
  why: string;
  input_type: ProtocolPromptInputType;
  operator_response: string | null;
  status: "open" | "answered";
  created_at: string;
  resolved_at: string | null;
}

export interface ProtocolPromptResponse {
  data: ProtocolPrompt[];
  error: unknown;
}
