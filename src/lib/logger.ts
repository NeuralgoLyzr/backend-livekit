import pino from 'pino';
import { once } from 'node:events';
import { getRequestId } from './requestContext.js';

function getLogLevel(): string {
    // Allow standard LOG_LEVEL; default to info.
    return process.env.LOG_LEVEL?.trim() || 'info';
}

function parseBoolEnv(value: string | undefined): boolean {
    return (value ?? '').trim().toLowerCase() === 'true';
}

function getAxiomTransportOptions(): { dataset: string; token: string } | null {
    if (!parseBoolEnv(process.env.AXIOM_ENABLED)) return null;

    const dataset = process.env.AXIOM_DATASET?.trim() ?? '';
    const token = process.env.AXIOM_TOKEN?.trim() ?? '';

    if (!dataset || !token) return null;

    return { dataset, token };
}

const axiomOptions = getAxiomTransportOptions();
const transport = axiomOptions
    ? pino.transport<Record<string, unknown>>({
          targets: [
              // Keep JSON logs on stdout (containers / local dev).
              { target: 'pino/file', options: { destination: 1 } },
              // Ship to Axiom (official transport).
              { target: '@axiomhq/pino', options: axiomOptions },
          ],
      })
    : undefined;

const baseLoggerOptions: pino.LoggerOptions = {
    level: getLogLevel(),
    formatters: {
        level(label) {
            // Emit textual levels (`info`, `debug`, etc.) instead of numeric values.
            return { level: label };
        },
    },
    base: {
        service: 'backend-livekit',
        env: process.env.NODE_ENV ?? 'development',
    },
    // Automatically attach requestId when available.
    mixin() {
        const requestId = getRequestId();
        return requestId ? { requestId } : {};
    },
    // Defensive redaction in case upstream accidentally logs secrets.
    // NOTE: keep this list intentionally broad; add more paths as needed.
    redact: {
        paths: [
            'authorization',
            'Authorization',
            'headers.authorization',
            'headers.Authorization',
            'req.headers.authorization',
            'req.headers.Authorization',
            '*.apiSecret',
            '*.apiKey',
            '*.api_key',
            'api_key',
            'apiKey',
            'agentConfig.api_key',
            'metadata.api_key',
            'metadata.apiKey',
        ],
        remove: true,
    },
    serializers: {
        err: pino.stdSerializers.err,
    },
};

export const logger = transport ? pino(baseLoggerOptions, transport) : pino(baseLoggerOptions);

if (parseBoolEnv(process.env.AXIOM_ENABLED) && !axiomOptions) {
    logger.warn(
        {
            event: 'axiom_transport_disabled',
            reason: 'missing_env',
            hasDataset: Boolean(process.env.AXIOM_DATASET?.trim()),
            hasToken: Boolean(process.env.AXIOM_TOKEN?.trim()),
        },
        'Axiom is enabled but not configured; shipping disabled'
    );
}

async function closeTransport(timeoutMs: number): Promise<void> {
    if (!transport) return;

    // `@axiomhq/pino` flushes on transport close.
    transport.end();

    await Promise.race([
        once(transport, 'close'),
        once(transport, 'finish'),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
}

export async function shutdownLogger(options?: { timeoutMs?: number }): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? 2000;

    try {
        // Best-effort flush for non-transport destinations.
        logger.flush();
    } catch {
        // Ignore: flush isn't guaranteed for all destinations.
    }

    await closeTransport(timeoutMs);
}
