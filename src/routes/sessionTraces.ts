import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../lib/asyncHandler.js';
import { HttpError } from '../lib/httpErrors.js';
import { formatZodError } from '../lib/zod.js';
import type { RequestAuthLocals } from '../middleware/apiKeyAuth.js';
import type {
    SessionTraceAccessContext,
    SessionTraceService,
} from '../services/sessionTraceService.js';

const SessionIdParamSchema = z.string().uuid('sessionId must be a valid UUID');
const TraceIdParamSchema = z
    .string()
    .min(1, 'traceId is required')
    .max(256, 'traceId must be 256 characters or less');

const TraceListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

function requireAuth(res: { locals: unknown }): SessionTraceAccessContext {
    const auth = (res.locals as RequestAuthLocals).auth;
    if (!auth) {
        throw new HttpError(401, "Missing auth context");
    }
    return auth;
}

export function createSessionTracesRouter(sessionTraceService: SessionTraceService): Router {
    const router: Router = Router();

    router.get(
        '/session/:sessionId',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const parsedSessionId = SessionIdParamSchema.safeParse(req.params.sessionId);
            if (!parsedSessionId.success) {
                return res.status(400).json(formatZodError(parsedSessionId.error));
            }

            const parsedQuery = TraceListQuerySchema.safeParse(req.query);
            if (!parsedQuery.success) {
                return res.status(400).json(formatZodError(parsedQuery.error));
            }

            const result = await sessionTraceService.listBySession({
                sessionId: parsedSessionId.data,
                auth,
                page: parsedQuery.data.page,
                limit: parsedQuery.data.limit,
            });
            return res.json(result);
        })
    );

    router.get(
        '/session/:sessionId/:traceId',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const parsedSessionId = SessionIdParamSchema.safeParse(req.params.sessionId);
            if (!parsedSessionId.success) {
                return res.status(400).json(formatZodError(parsedSessionId.error));
            }

            const parsedTraceId = TraceIdParamSchema.safeParse(req.params.traceId);
            if (!parsedTraceId.success) {
                return res.status(400).json(formatZodError(parsedTraceId.error));
            }

            const result = await sessionTraceService.getBySessionAndTraceId({
                sessionId: parsedSessionId.data,
                traceId: parsedTraceId.data,
                auth,
            });
            return res.json(result);
        })
    );

    return router;
}

