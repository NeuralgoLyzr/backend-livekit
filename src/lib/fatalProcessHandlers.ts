import type { Logger } from 'pino';

type FatalEvent =
    | { kind: 'uncaughtException'; error: Error; origin: NodeJS.UncaughtExceptionOrigin }
    | { kind: 'unhandledRejection'; reason: unknown };

export interface InstallFatalProcessHandlersOptions {
    logger: Logger;
    /**
     * Called after logging but before exiting the process.
     * Use for best-effort cleanup (close HTTP server, flush logs, close DB).
     */
    onFatal: (event: FatalEvent) => Promise<void>;
    /**
     * If cleanup hangs, force exit after this timeout.
     */
    exitTimeoutMs?: number;
}

function toError(value: unknown): Error {
    if (value instanceof Error) return value;
    if (typeof value === 'string') return new Error(value);

    try {
        return new Error(JSON.stringify(value));
    } catch {
        return new Error(String(value));
    }
}

export function installFatalProcessHandlers(options: InstallFatalProcessHandlersOptions): void {
    const exitTimeoutMs = Math.max(options.exitTimeoutMs ?? 5000, 500);
    let handlingFatal = false;

    async function handleFatal(event: FatalEvent): Promise<void> {
        if (handlingFatal) {
            // If we re-enter, just exit (avoid loops).
            process.exit(1);
        }
        handlingFatal = true;

        const forceExit = setTimeout(() => {
            try {
                options.logger.error(
                    { event: 'fatal_force_exit', exitTimeoutMs },
                    'Forced process exit after fatal error'
                );
            } catch {
                // Ignore.
            }
            process.exit(1);
        }, exitTimeoutMs);
        // Don't keep the event loop alive just for this timer.
        forceExit.unref();

        try {
            if (event.kind === 'uncaughtException') {
                options.logger.error(
                    {
                        event: 'process_fatal',
                        kind: event.kind,
                        origin: event.origin,
                        err: event.error,
                    },
                    'Uncaught exception'
                );
            } else {
                options.logger.error(
                    {
                        event: 'process_fatal',
                        kind: event.kind,
                        reason: event.reason instanceof Error ? event.reason : toError(event.reason),
                    },
                    'Unhandled promise rejection'
                );
            }

            await options.onFatal(event);
        } catch (error) {
            // Avoid throwing from the fatal handler; just log and exit.
            try {
                options.logger.error(
                    { event: 'fatal_handler_failed', err: error },
                    'Fatal handler cleanup failed'
                );
            } catch {
                // Ignore.
            }
        } finally {
            clearTimeout(forceExit);
            process.exit(1);
        }
    }

    process.once('uncaughtException', (error, origin) => {
        void handleFatal({ kind: 'uncaughtException', error, origin });
    });

    process.once('unhandledRejection', (reason) => {
        void handleFatal({ kind: 'unhandledRejection', reason });
    });
}

