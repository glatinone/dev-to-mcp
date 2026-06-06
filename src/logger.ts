import pino from "pino";
import { getConfig, isDevelopment } from "./config.ts";

const config = getConfig();

// Always write to stderr — stdout is reserved for JSON-RPC in stdio transport mode.
export const logger = isDevelopment()
  ? pino({
      level: config.LOG_LEVEL,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
          destination: 2,
        },
      },
      base: {
        service: config.SERVER_NAME,
        version: config.SERVER_VERSION,
        environment: config.NODE_ENV,
      },
      formatters: {
        level: (label) => ({ level: label }),
      },
    })
  : pino(
      {
        level: config.LOG_LEVEL,
        base: {
          service: config.SERVER_NAME,
          version: config.SERVER_VERSION,
          environment: config.NODE_ENV,
        },
        formatters: {
          level: (label) => ({ level: label }),
        },
      },
      pino.destination({ fd: 2, sync: false }),
    );
