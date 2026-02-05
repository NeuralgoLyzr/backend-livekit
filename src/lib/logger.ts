import pino from 'pino';
import { getRequestId } from './requestContext.js';

function getLogLevel(): string {
    // Allow standard LOG_LEVEL; default to info.
    return process.env.LOG_LEVEL?.trim() || 'info';
}

export const logger = pino({
    level: getLogLevel(),
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
            '*.api_key',
            'api_key',
            'agentConfig.api_key',
            'metadata.api_key',
        ],
        remove: true,
    },
});

