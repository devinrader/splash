type LogFields = Record<string, unknown>;

export interface Logger {
  info(event: string, message: string, fields?: LogFields): void;
  warn(event: string, message: string, fields?: LogFields): void;
  error(event: string, message: string, fields?: LogFields): void;
}

function write(level: string, event: string, message: string, fields?: LogFields): void {
  const record = {
    ts: new Date().toISOString(),
    level,
    service: "splash-api",
    event,
    message,
    ...fields
  };

  process.stdout.write(`${JSON.stringify(record)}\n`);
}

export function createLogger(): Logger {
  return {
    info(event, message, fields) {
      write("info", event, message, fields);
    },
    warn(event, message, fields) {
      write("warn", event, message, fields);
    },
    error(event, message, fields) {
      write("error", event, message, fields);
    }
  };
}
