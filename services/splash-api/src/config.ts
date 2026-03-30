export interface ApiConfig {
  poolId: string;
  natsUrl: string;
  httpBind: string;
  logLevel: string;
  timezone: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    poolId: required(env, "API_POOL_ID"),
    natsUrl: required(env, "NATS_URL"),
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
