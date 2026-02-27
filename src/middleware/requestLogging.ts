import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { ENABLE_TAIL_SAMPLING, SLOW_REQUEST_MS, SUCCESS_SAMPLE_RATE } from '../CONSTS.js';
import { isDevEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { runWithRequestContext } from '../lib/requestContext.js';

type Outcome = 'success' | 'error';
type Pathname = `/${string}` | '';

function getOutcome(statusCode: number): Outcome {
    return statusCode >= 400 ? 'error' : 'success';
}

export interface HttpWideEvent {
    event: 'http_request';
    requestId: string;
    method: string;
    path: string;
    /**
     * Optional correlation id for a LiveKit session lifecycle.
     * This is populated by session routes when available.
     */
    sessionId?: string;
    /**
     * LiveKit room name (known after /session allocates it, or when explicitly provided).
     */
    roomName?: string;
    /**
     * End-user identity for the session (when available).
     */
    userIdentity?: string;
    statusCode?: number;
    durationMs?: number;
    outcome?: Outcome;
    operationTimingsMs?: Record<string, number>;
    userAgent?: string;
    ip?: string;
}

function shouldSample(event: HttpWideEvent, req: Request): boolean {
    if (!ENABLE_TAIL_SAMPLING) return true;

    const statusCode = event.statusCode ?? 0;
    if (statusCode >= 400) return true;

    const durationMs = event.durationMs ?? 0;
    if (durationMs > SLOW_REQUEST_MS) return true;

    const debugHeader = req.header('x-debug-log');
    if (isDevEnv() && debugHeader === '1') return true;

    return Math.random() < SUCCESS_SAMPLE_RATE;
}

function getPathname(url: string): Pathname {
    const pathname = url.split('?')[0] ?? '';
    return (pathname.startsWith('/') ? pathname : '') as Pathname;
}

function isHealthCheckRequest(req: Request): boolean {
    // Skip noisy health-check polling in logs.
    const raw = req.originalUrl || req.url || '';
    const pathname = getPathname(raw);
    return pathname === '/health' || pathname === '/health/';
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
    const headerRequestId = req.header('x-request-id');
    const requestId =
        headerRequestId && headerRequestId.trim().length > 0 ? headerRequestId : randomUUID();

    res.setHeader('X-Request-Id', requestId);

    const start = Date.now();
    const isHealthCheck = isHealthCheckRequest(req);

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
        wideEvent.outcome = getOutcome(res.statusCode);

        // Health endpoint is typically polled frequently by load balancers / uptime checks.
        // Keep logs clean by skipping successful health checks (still log 5xx).
        if (isHealthCheck && res.statusCode < 500) return;

        if (shouldSample(wideEvent, req)) {
            // requestId will also be included by logger mixin, but keeping it explicit helps downstream queries.
            logger.info(wideEvent);
        }
    });

    runWithRequestContext({ requestId }, () => {
        next();
    });
}
