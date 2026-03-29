export interface ProtocolConfig {
  natsUrl: string;
  httpBind: string;
  commandTimeoutMs: number;
  logLevel: string;
  timezone: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function parsePositiveInteger(name: string): number {
  const value = required(name);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function validateBindTarget(value: string): string {
  const index = value.lastIndexOf(":");
  if (index <= 0 || index === value.length - 1) {
    throw new Error("PROTOCOL_HTTP_BIND must be a valid host:port bind target");
  }

  const port = Number.parseInt(value.slice(index + 1), 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PROTOCOL_HTTP_BIND must include a valid port");
  }

  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ProtocolConfig {
  const previous = process.env;
  process.env = env;
  try {
    return {
      natsUrl: required("NATS_URL"),
      httpBind: validateBindTarget(required("PROTOCOL_HTTP_BIND")),
      commandTimeoutMs: parsePositiveInteger("PROTOCOL_COMMAND_TIMEOUT_MS"),
      logLevel: env.LOG_LEVEL ?? "info",
      timezone: env.TZ ?? "UTC"
    };
  } finally {
    process.env = previous;
  }
}
