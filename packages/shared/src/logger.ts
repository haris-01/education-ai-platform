type LogFn = (message: string) => void;

export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  return {
    info: (message) => console.log(`${prefix} ${message}`),
    warn: (message) => console.warn(`${prefix} ${message}`),
    error: (message) => console.error(`${prefix} ${message}`),
  };
}
