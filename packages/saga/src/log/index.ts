import { type DestinationStream, type Level, type Logger, pino } from 'pino'

export type { Logger, Level }

export interface LoggerOptions {
	/** Service name; emitted as the `service` binding on every log line. */
	service: string
	/** Minimum level emitted. Defaults to `info`. */
	level?: Level
	/**
	 * When true, routes output through pino-pretty for human-readable dev
	 * logs. Leave off in production — JSON-per-line is the contract for log
	 * shippers.
	 */
	pretty?: boolean
	/**
	 * Override the destination stream. Primarily useful for tests; in
	 * production omit to write to stdout.
	 */
	destination?: DestinationStream
}

/**
 * Creates a Pino logger with saga's defaults — JSON output, ISO
 * timestamps, level emitted as a string label, and a `service` binding
 * on every line. Returns the underlying Pino logger directly so callers
 * can use `logger.child({...})` and the rest of Pino's API without a
 * thin wrapper sitting in the way.
 */
export function createLogger(options: LoggerOptions): Logger {
	const config = {
		name: options.service,
		level: options.level ?? 'info',
		base: { service: options.service },
		formatters: {
			level: (label: string) => ({ level: label }),
		},
		timestamp: pino.stdTimeFunctions.isoTime,
		...(options.pretty
			? {
					transport: {
						target: 'pino-pretty',
						options: { colorize: true, singleLine: false, ignore: 'pid,hostname' },
					},
				}
			: {}),
	}

	return options.destination ? pino(config, options.destination) : pino(config)
}
