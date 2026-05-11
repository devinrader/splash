export interface ApiConfig {
  poolId: string;
  natsUrl: string;
  natsMonitoringUrl: string | null;
  serialHealthUrl?: string | null;
  protocolHealthUrl?: string | null;
  httpBind: string;
  logLevel: string;
  timezone: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    poolId: required(env, "API_POOL_ID"),
    natsUrl: required(env, "NATS_URL"),
    natsMonitoringUrl: optionalUrl(env, "API_NATS_MONITORING_URL"),
    serialHealthUrl: optionalUrl(env, "API_SERIAL_HEALTH_URL"),
    protocolHealthUrl: optionalUrl(env, "API_PROTOCOL_HEALTH_URL"),
    httpBind: required(env, "API_HTTP_BIND"),
    logLevel: env.LOG_LEVEL ?? "info",
    timezone: env.TZ ?? "UTC"
  };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalUrl(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key];
  return value && value.length > 0 ? value : null;
}
