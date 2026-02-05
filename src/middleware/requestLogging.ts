import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { ENABLE_TAIL_SAMPLING, SLOW_REQUEST_MS, SUCCESS_SAMPLE_RATE } from '../CONSTS.js';
import { logger } from '../lib/logger.js';
import { runWithRequestContext } from '../lib/requestContext.js';

type Outcome = 'success' | 'error';

export interface HttpWideEvent {
    event: 'http_request';
    requestId: string;
    method: string;
    path: string;
    statusCode?: number;
    durationMs?: number;
    outcome?: Outcome;
    userAgent?: string;
    ip?: string;
}

function shouldSample(event: HttpWideEvent, req: Request): boolean {
    if (!ENABLE_TAIL_SAMPLING) return true;

    const statusCode = event.statusCode ?? 0;
    if (statusCode >= 500) return true;

    const durationMs = event.durationMs ?? 0;
    if (durationMs > SLOW_REQUEST_MS) return true;

    const debugHeader = req.header('x-debug-log');
    if (process.env.NODE_ENV !== 'production' && debugHeader === '1') return true;

    return Math.random() < SUCCESS_SAMPLE_RATE;
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
    const headerRequestId = req.header('x-request-id');
    const requestId = headerRequestId && headerRequestId.trim().length > 0 ? headerRequestId : randomUUID();

    res.setHeader('X-Request-Id', requestId);

    const start = Date.now();

    const wideEvent: HttpWideEvent = {
        event: 'http_request',
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        userAgent: req.header('user-agent') ?? undefined,
        ip: req.ip,
    };

    res.locals.wideEvent = wideEvent;

    res.on('finish', () => {
        wideEvent.statusCode = res.statusCode;
        wideEvent.durationMs = Date.now() - start;
        wideEvent.outcome = res.statusCode >= 500 ? 'error' : 'success';

        if (shouldSample(wideEvent, req)) {
            // requestId will also be included by logger mixin, but keeping it explicit helps downstream queries.
            logger.info(wideEvent);
        }
    });

    runWithRequestContext({ requestId }, () => {
        next();
    });
}

