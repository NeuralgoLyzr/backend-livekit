import { Router } from 'express';
import { z } from 'zod';

import type { TranscriptService } from '../services/transcriptService.js';
import type { AudioStorageService } from '../services/audioStorageService.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { formatZodError } from '../lib/zod.js';
import { AgentIdSchema } from '../types/index.js';
import { HttpError } from '../lib/httpErrors.js';
import type { RequestAuthLocals } from '../middleware/apiKeyAuth.js';

const SessionIdParamSchema = z.string().uuid('sessionId must be a valid UUID');
const OrgIdQuerySchema = z.string().uuid('orgId must be a valid UUID');

const PaginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    sort: z.enum(['asc', 'desc']).optional(),
});

const ListFiltersSchema = PaginationQuerySchema.extend({
    agentId: AgentIdSchema.optional(),
    orgId: OrgIdQuerySchema.optional(),
    sessionId: SessionIdParamSchema.optional(),
    from: z.string().date().or(z.string().datetime({ offset: true })).optional(),
    to: z.string().date().or(z.string().datetime({ offset: true })).optional(),
});

function requireAuth(res: { locals: unknown }): { orgId: string; userId: string; isAdmin: boolean } {
    const auth = (res.locals as RequestAuthLocals).auth;
    if (!auth) {
        throw new HttpError(401, 'Missing auth context');
    }
    return auth;
}

export function createTranscriptsRouter(
    transcriptService: TranscriptService,
    audioStorageService?: AudioStorageService
): Router {
    const router: Router = Router();

    router.get(
        '/:sessionId/audio',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);

            const parseId = SessionIdParamSchema.safeParse(req.params.sessionId);
            if (!parseId.success) {
                return res.status(400).json(formatZodError(parseId.error));
            }

            const transcript = await transcriptService.getBySessionId(parseId.data);
            if (!transcript) {
                return res.status(404).json({ error: 'Transcript not found' });
            }

            if (transcript.orgId !== auth.orgId) {
                return res.status(404).json({ error: 'Transcript not found' });
            }
            if (!auth.isAdmin && transcript.createdByUserId !== auth.userId) {
                return res.status(404).json({ error: 'Transcript not found' });
            }

            if (!audioStorageService) {
                return res.status(404).json({ error: 'Audio recordings not configured' });
            }

            const audioObject = await audioStorageService.get(parseId.data);
            if (!audioObject) {
                return res.status(404).json({ error: 'Audio recording not found' });
            }

            res.setHeader('Content-Type', audioObject.contentType || 'audio/ogg');
            res.setHeader('Content-Disposition', `inline; filename="${parseId.data}.ogg"`);
            return res.send(audioObject.data);
        })
    );

    router.get(
        '/',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);

            const parse = ListFiltersSchema.safeParse(req.query);
            if (!parse.success) {
                return res.status(400).json(formatZodError(parse.error));
            }

            const { limit, offset, sort, ...filters } = parse.data;
            const result = await transcriptService.list(
                {
                    ...filters,
                    orgId: auth.orgId,
                    ...(auth.isAdmin ? {} : { createdByUserId: auth.userId }),
                },
                { limit, offset, sort }
            );
            return res.json(result);
        })
    );

    router.get(
        '/agent/:agentId/stats',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);

            const parseId = AgentIdSchema.safeParse(req.params.agentId);
            if (!parseId.success) {
                return res.status(400).json(formatZodError(parseId.error));
            }

            const stats = await transcriptService.getAgentStats({
                orgId: auth.orgId,
                agentId: parseId.data,
                ...(auth.isAdmin ? {} : { createdByUserId: auth.userId }),
            });
            return res.json(stats);
        })
    );

    router.get(
        '/agent/:agentId',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);

            const parseId = AgentIdSchema.safeParse(req.params.agentId);
            if (!parseId.success) {
                return res.status(400).json(formatZodError(parseId.error));
            }

            const parsePag = PaginationQuerySchema.safeParse(req.query);
            if (!parsePag.success) {
                return res.status(400).json(formatZodError(parsePag.error));
            }

            const result = await transcriptService.listByAgentId(
                {
                    orgId: auth.orgId,
                    agentId: parseId.data,
                    ...(auth.isAdmin ? {} : { createdByUserId: auth.userId }),
                },
                parsePag.data
            );
            return res.json(result);
        })
    );

    router.get(
        '/:sessionId',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);

            const parseId = SessionIdParamSchema.safeParse(req.params.sessionId);
            if (!parseId.success) {
                return res.status(400).json(formatZodError(parseId.error));
            }

            const transcript = await transcriptService.getBySessionId(parseId.data);
            if (!transcript) {
                return res.status(404).json({ error: 'Transcript not found' });
            }

            if (transcript.orgId !== auth.orgId) {
                return res.status(404).json({ error: 'Transcript not found' });
            }
            if (!auth.isAdmin && transcript.createdByUserId !== auth.userId) {
                return res.status(404).json({ error: 'Transcript not found' });
            }

            return res.json({ transcript });
        })
    );

    return router;
}
