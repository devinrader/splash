export interface GeocodingConfig {
  geoapifyApiKey: string | null;
  geoapifyBaseUrl: string;
  osmBaseUrl: string;
  osmUserAgent: string | null;
  osmEmail: string | null;
}

export type GeocodingProviderConfigFieldType = "text" | "password" | "url" | "email";

export interface GeocodingProviderConfigFieldDefinition {
  key: string;
  label: string;
  description: string;
  type: GeocodingProviderConfigFieldType;
  required: boolean;
  secret: boolean;
  placeholder: string | null;
  defaultValue?: string | null;
}

export interface GeocodingProviderConfigFieldView extends GeocodingProviderConfigFieldDefinition {
  configured: boolean;
  value: string | null;
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string | null;
  timezone: string | null;
  confidence: number | null;
  raw?: Record<string, unknown> | null;
}

export interface GeocodingProviderView {
  id: string;
  displayName: string;
  description: string;
  configurationRequirements: string[];
  configFields: GeocodingProviderConfigFieldView[];
  available: boolean;
  unavailableReason: string | null;
}

export interface GeocodingProvider {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly configurationRequirements: string[];
  readonly configFields: GeocodingProviderConfigFieldView[];
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly configurationSummary: string;
  geocode(address: string): Promise<GeocodingResult>;
}

type ProviderConfigValues = Record<string, string | null>;
export type GeocodingProviderConfigMap = Record<string, ProviderConfigValues>;

interface GeocodingProviderDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly configurationRequirements: string[];
  readonly configFields: GeocodingProviderConfigFieldDefinition[];
  readonly bootstrapValues: ProviderConfigValues;
  build(values: ProviderConfigValues, fetchImpl: typeof fetch): GeocodingProvider;
}

export class GeocodingProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodingProviderUnavailableError";
  }
}

export class GeocodingNoResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodingNoResultError";
  }
}

export class GeocodingAmbiguousError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodingAmbiguousError";
  }
}

export class GeocodingProviderRegistry {
  private readonly definitions: GeocodingProviderDefinition[];

  constructor(
    config: GeocodingConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.definitions = [
      createGeoapifyProviderDefinition(config),
      createOpenStreetMapProviderDefinition(config)
    ];
  }

  listProviders(configs: GeocodingProviderConfigMap = {}): GeocodingProviderView[] {
    return this.definitions.map((definition) => this.buildProvider(definition, configs));
  }

  getProviderView(id: string, configs: GeocodingProviderConfigMap = {}): GeocodingProviderView | null {
    const definition = this.getDefinition(id);
    return definition ? this.buildProvider(definition, configs) : null;
  }

  getProvider(id: string, configs: GeocodingProviderConfigMap = {}): GeocodingProvider | null {
    const definition = this.getDefinition(id);
    if (!definition) {
      return null;
    }
    const values = this.getResolvedValues(definition, configs[definition.id]);
    return definition.build(values, this.fetchImpl);
  }

  getAvailableProvider(id: string, configs: GeocodingProviderConfigMap = {}): GeocodingProvider | null {
    const provider = this.getProvider(id, configs);
    if (!provider || !provider.available) {
      return null;
    }
    return provider;
  }

  getPreferredProviderId(configs: GeocodingProviderConfigMap = {}): string | null {
    if (this.getAvailableProvider("geoapify", configs)) {
      return "geoapify";
    }
    if (this.getAvailableProvider("openstreetmap", configs)) {
      return "openstreetmap";
    }
    return null;
  }

  describeActiveProvider(
    storedProviderId: string | null,
    configs: GeocodingProviderConfigMap = {}
  ): {
    activeProviderId: string | null;
    activeProviderAvailable: boolean;
    activeProviderUnavailableReason: string | null;
  } {
    if (storedProviderId) {
      const provider = this.getProvider(storedProviderId, configs);
      if (!provider) {
        return {
          activeProviderId: storedProviderId,
          activeProviderAvailable: false,
          activeProviderUnavailableReason: "Stored geocoding provider is no longer registered."
        };
      }
      return {
        activeProviderId: storedProviderId,
        activeProviderAvailable: provider.available,
        activeProviderUnavailableReason: provider.available ? null : provider.unavailableReason
      };
    }

    const preferred = this.getPreferredProviderId(configs);
    if (!preferred) {
      return {
        activeProviderId: null,
        activeProviderAvailable: false,
        activeProviderUnavailableReason: "No geocoding provider is configured."
      };
    }

    return {
      activeProviderId: preferred,
      activeProviderAvailable: true,
      activeProviderUnavailableReason: null
    };
  }

  normalizeConfigUpdate(
    providerId: string,
    input: unknown,
    existingConfig: ProviderConfigValues = {}
  ): ProviderConfigValues {
    const definition = this.getDefinition(providerId);
    if (!definition) {
      throw new Error(`Unknown geocoding provider: ${providerId}`);
    }

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return this.getResolvedValues(definition, existingConfig);
    }

    const record = input as Record<string, unknown>;
    const nextValues: ProviderConfigValues = { ...existingConfig };
    for (const field of definition.configFields) {
      const raw = record[field.key];
      if (raw === undefined) {
        continue;
      }

      if (typeof raw !== "string") {
        nextValues[field.key] = null;
        continue;
      }

      const trimmed = raw.trim();
      if (field.secret && trimmed.length === 0) {
        continue;
      }

      nextValues[field.key] = trimmed.length > 0 ? trimmed : null;
    }

    return this.getResolvedValues(definition, nextValues);
  }

  validateResolvedConfig(providerId: string, values: ProviderConfigValues): Record<string, string> {
    const definition = this.getDefinition(providerId);
    if (!definition) {
      return { providerId: "Provider is not registered." };
    }

    const errors: Record<string, string> = {};
    for (const field of definition.configFields) {
      const value = normalizeNullableString(values[field.key]);
      if (field.required && !value) {
        errors[field.key] = `${field.label} is required.`;
      }
    }
    return errors;
  }

  private getDefinition(id: string): GeocodingProviderDefinition | null {
    return this.definitions.find((definition) => definition.id === id) ?? null;
  }

  private buildProvider(
    definition: GeocodingProviderDefinition,
    configs: GeocodingProviderConfigMap
  ): GeocodingProviderView {
    const values = this.getResolvedValues(definition, configs[definition.id]);
    const provider = definition.build(values, this.fetchImpl);
    return {
      id: provider.id,
      displayName: provider.displayName,
      description: provider.description,
      configurationRequirements: provider.configurationRequirements,
      configFields: provider.configFields,
      available: provider.available,
      unavailableReason: provider.unavailableReason
    };
  }

  private getResolvedValues(
    definition: GeocodingProviderDefinition,
    stored: ProviderConfigValues | undefined
  ): ProviderConfigValues {
    const resolved: ProviderConfigValues = {};
    for (const field of definition.configFields) {
      const storedValue = normalizeNullableString(stored?.[field.key]);
      const bootstrapValue = normalizeNullableString(definition.bootstrapValues[field.key]);
      const defaultValue = normalizeNullableString(field.defaultValue);
      resolved[field.key] = storedValue ?? bootstrapValue ?? defaultValue;
    }
    return resolved;
  }
}

export function createGeocodingProviderRegistry(
  config: GeocodingConfig,
  fetchImpl: typeof fetch = fetch
): GeocodingProviderRegistry {
  return new GeocodingProviderRegistry(config, fetchImpl);
}

function createGeoapifyProviderDefinition(config: GeocodingConfig): GeocodingProviderDefinition {
  return {
    id: "geoapify",
    displayName: "Geoapify",
    description: "Street-address geocoding via Geoapify.",
    configurationRequirements: ["api_key"],
    configFields: [
      {
        key: "api_key",
        label: "API Key",
        description: "Geoapify API key used for geocoding requests.",
        type: "password",
        required: true,
        secret: true,
        placeholder: "Enter Geoapify API key"
      },
      {
        key: "base_url",
        label: "Base URL",
        description: "Override the Geoapify geocoding API base URL when needed.",
        type: "url",
        required: true,
        secret: false,
        placeholder: "https://api.geoapify.com/v1",
        defaultValue: "https://api.geoapify.com/v1"
      }
    ],
    bootstrapValues: {
      api_key: config.geoapifyApiKey,
      base_url: config.geoapifyBaseUrl
    },
    build(values, fetchImpl) {
      return new GeoapifyGeocodingProvider(values, fetchImpl);
    }
  };
}

function createOpenStreetMapProviderDefinition(config: GeocodingConfig): GeocodingProviderDefinition {
  return {
    id: "openstreetmap",
    displayName: "OpenStreetMap / Nominatim",
    description: "Street-address geocoding via Nominatim. Public endpoints are low-volume only.",
    configurationRequirements: ["user_agent"],
    configFields: [
      {
        key: "base_url",
        label: "Base URL",
        description: "Override the Nominatim base URL for self-hosted or alternate deployments.",
        type: "url",
        required: true,
        secret: false,
        placeholder: "https://nominatim.openstreetmap.org",
        defaultValue: "https://nominatim.openstreetmap.org"
      },
      {
        key: "user_agent",
        label: "User-Agent",
        description: "Required user-agent string for Nominatim requests.",
        type: "text",
        required: true,
        secret: false,
        placeholder: "Splash/1.0 (ops@example.test)"
      },
      {
        key: "email",
        label: "Contact Email",
        description: "Optional contact email appended to Nominatim requests.",
        type: "email",
        required: false,
        secret: false,
        placeholder: "ops@example.test"
      }
    ],
    bootstrapValues: {
      base_url: config.osmBaseUrl,
      user_agent: config.osmUserAgent,
      email: config.osmEmail
    },
    build(values, fetchImpl) {
      return new OpenStreetMapGeocodingProvider(values, fetchImpl);
    }
  };
}

interface GeocodingCandidate {
  latitude: number;
  longitude: number;
  formattedAddress: string | null;
  timezone: string | null;
  confidence: number | null;
  raw?: Record<string, unknown> | null;
}

class GeoapifyGeocodingProvider implements GeocodingProvider {
  readonly id = "geoapify";
  readonly displayName = "Geoapify";
  readonly description = "Street-address geocoding via Geoapify.";
  readonly configurationRequirements = ["api_key"];
  readonly configFields: GeocodingProviderConfigFieldView[];
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly configurationSummary: string;

  private readonly apiKey: string | null;
  private readonly baseUrl: string;

  constructor(
    values: ProviderConfigValues,
    private readonly fetchImpl: typeof fetch
  ) {
    this.apiKey = normalizeNullableString(values.api_key);
    this.baseUrl = normalizeNullableString(values.base_url) ?? "https://api.geoapify.com/v1";
    this.available = Boolean(this.apiKey);
    this.unavailableReason = this.available ? null : "api_key is required.";
    this.configurationSummary = trimTrailingSlash(this.baseUrl);
    this.configFields = [
      buildFieldView({
        key: "api_key",
        label: "API Key",
        description: "Geoapify API key used for geocoding requests.",
        type: "password",
        required: true,
        secret: true,
        placeholder: "Enter Geoapify API key"
      }, this.apiKey),
      buildFieldView({
        key: "base_url",
        label: "Base URL",
        description: "Override the Geoapify geocoding API base URL when needed.",
        type: "url",
        required: true,
        secret: false,
        placeholder: "https://api.geoapify.com/v1",
        defaultValue: "https://api.geoapify.com/v1"
      }, this.baseUrl)
    ];
  }

  async geocode(address: string): Promise<GeocodingResult> {
    if (!this.available || !this.apiKey) {
      throw new GeocodingProviderUnavailableError(this.unavailableReason ?? "Geoapify is unavailable.");
    }

    const url = new URL(`${trimTrailingSlash(this.baseUrl)}/geocode/search`);
    url.searchParams.set("text", address);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "2");
    url.searchParams.set("apiKey", this.apiKey);

    const response = await this.fetchImpl(url, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Geoapify geocoding request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const results = Array.isArray(payload.results) ? payload.results : [];
    const candidates = results
      .map((entry) => normalizeGeoapifyCandidate(entry))
      .filter((entry): entry is GeocodingCandidate => entry !== null);

    return resolveTopCandidate(candidates);
  }
}

class OpenStreetMapGeocodingProvider implements GeocodingProvider {
  readonly id = "openstreetmap";
  readonly displayName = "OpenStreetMap / Nominatim";
  readonly description = "Street-address geocoding via Nominatim. Public endpoints are low-volume only.";
  readonly configurationRequirements = ["user_agent"];
  readonly configFields: GeocodingProviderConfigFieldView[];
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly configurationSummary: string;

  private readonly baseUrl: string;
  private readonly userAgent: string | null;
  private readonly email: string | null;

  constructor(
    values: ProviderConfigValues,
    private readonly fetchImpl: typeof fetch
  ) {
    this.baseUrl = normalizeNullableString(values.base_url) ?? "https://nominatim.openstreetmap.org";
    this.userAgent = normalizeNullableString(values.user_agent);
    this.email = normalizeNullableString(values.email);
    this.available = Boolean(this.userAgent);
    this.unavailableReason = this.available ? null : "user_agent is required.";
    this.configurationSummary = trimTrailingSlash(this.baseUrl);
    this.configFields = [
      buildFieldView({
        key: "base_url",
        label: "Base URL",
        description: "Override the Nominatim base URL for self-hosted or alternate deployments.",
        type: "url",
        required: true,
        secret: false,
        placeholder: "https://nominatim.openstreetmap.org",
        defaultValue: "https://nominatim.openstreetmap.org"
      }, this.baseUrl),
      buildFieldView({
        key: "user_agent",
        label: "User-Agent",
        description: "Required user-agent string for Nominatim requests.",
        type: "text",
        required: true,
        secret: false,
        placeholder: "Splash/1.0 (ops@example.test)"
      }, this.userAgent),
      buildFieldView({
        key: "email",
        label: "Contact Email",
        description: "Optional contact email appended to Nominatim requests.",
        type: "email",
        required: false,
        secret: false,
        placeholder: "ops@example.test"
      }, this.email)
    ];
  }

  async geocode(address: string): Promise<GeocodingResult> {
    if (!this.available || !this.userAgent) {
      throw new GeocodingProviderUnavailableError(this.unavailableReason ?? "OpenStreetMap is unavailable.");
    }

    const url = new URL(`${trimTrailingSlash(this.baseUrl)}/search`);
    url.searchParams.set("q", address);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "2");
    if (this.email) {
      url.searchParams.set("email", this.email);
    }

    const response = await this.fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": this.userAgent
      }
    });
    if (!response.ok) {
      throw new Error(`OpenStreetMap geocoding request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const results = Array.isArray(payload) ? payload : [];
    const candidates = results
      .map((entry) => normalizeOpenStreetMapCandidate(entry))
      .filter((entry): entry is GeocodingCandidate => entry !== null);

    return resolveTopCandidate(candidates);
  }
}

function buildFieldView(
  definition: GeocodingProviderConfigFieldDefinition,
  value: string | null
): GeocodingProviderConfigFieldView {
  return {
    ...definition,
    configured: normalizeNullableString(value) !== null,
    value: definition.secret ? null : value ?? definition.defaultValue ?? ""
  };
}

function normalizeGeoapifyCandidate(value: unknown): GeocodingCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const latitude = readNumber(record.lat);
  const longitude = readNumber(record.lon);
  if (latitude == null || longitude == null) {
    return null;
  }

  const rawTimezone = record.timezone;
  const timezone =
    typeof rawTimezone === "string"
      ? rawTimezone
      : rawTimezone && typeof rawTimezone === "object" && !Array.isArray(rawTimezone)
        ? optionalString((rawTimezone as Record<string, unknown>).name)
        : null;

  const rank = record.rank;
  const confidence =
    rank && typeof rank === "object" && !Array.isArray(rank)
      ? readNumber((rank as Record<string, unknown>).confidence)
      : null;

  return {
    latitude,
    longitude,
    formattedAddress: optionalString(record.formatted),
    timezone,
    confidence,
    raw: record
  };
}

function normalizeOpenStreetMapCandidate(value: unknown): GeocodingCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const latitude = readNumber(record.lat);
  const longitude = readNumber(record.lon);
  if (latitude == null || longitude == null) {
    return null;
  }

  return {
    latitude,
    longitude,
    formattedAddress: optionalString(record.display_name),
    timezone: null,
    confidence: readNumber(record.importance),
    raw: record
  };
}

function resolveTopCandidate(candidates: GeocodingCandidate[]): GeocodingResult {
  if (candidates.length === 0) {
    throw new GeocodingNoResultError("No matching geocoding result was returned.");
  }

  const sorted = [...candidates].sort((left, right) => {
    const rightConfidence = right.confidence ?? -1;
    const leftConfidence = left.confidence ?? -1;
    return rightConfidence - leftConfidence;
  });

  const [best, second] = sorted;
  if (!best) {
    throw new GeocodingNoResultError("No matching geocoding result was returned.");
  }

  if (second) {
    const bestConfidence = best.confidence ?? null;
    const secondConfidence = second.confidence ?? null;
    if (bestConfidence == null || secondConfidence == null) {
      throw new GeocodingAmbiguousError("Ambiguous geocoding result; no clear top match was returned.");
    }
    if (Math.abs(bestConfidence - secondConfidence) < 0.1) {
      throw new GeocodingAmbiguousError("Ambiguous geocoding result; no clear top match was returned.");
    }
  }

  return {
    latitude: best.latitude,
    longitude: best.longitude,
    formattedAddress: best.formattedAddress,
    timezone: best.timezone,
    confidence: best.confidence,
    raw: best.raw ?? null
  };
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNullableString(value: unknown): string | null {
  return optionalString(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
