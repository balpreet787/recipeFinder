import pino from "pino";

const prettyLogsEnabled = process.env.LOG_PRETTY === "true";

const transport = prettyLogsEnabled
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname"
      }
    }
  : undefined;

export const errorSerializer = pino.stdSerializers.err;

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "headers.authorization"
    ],
    censor: "[REDACTED]"
  },
  transport
});

export function buildErrorLogObject(error, context = {}) {
  if (error instanceof Error) {
    return {
      ...context,
      err: error
    };
  }

  return {
    ...context,
    error
  };
}
