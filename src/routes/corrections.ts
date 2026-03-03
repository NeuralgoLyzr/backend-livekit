import { Router } from 'express';
import { z } from 'zod';

import type { CorrectionService } from '../services/correctionService.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { formatZodError } from '../lib/zod.js';
import {
    AgentIdSchema,
    CreateCorrectionRequestSchema,
    UpdateCorrectionRequestSchema,
} from '../types/index.js';
import { HttpError } from '../lib/httpErrors.js';
import type { RequestAuthLocals } from '../middleware/apiKeyAuth.js';

const CorrectionIdSchema = z.string().uuid('correctionId must be a valid UUID');

function requireAuth(res: { locals: unknown }): {
    orgId: string;
    userId: string;
    isAdmin: boolean;
} {
    const auth = (res.locals as RequestAuthLocals).auth;
    if (!auth) {
        throw new HttpError(401, 'Missing auth context');
    }
    return auth;
}

function toScope(auth: { orgId: string; userId: string; isAdmin: boolean }) {
    return auth.isAdmin ? { orgId: auth.orgId } : { orgId: auth.orgId, createdByUserId: auth.userId };
}

export function createCorrectionsRouter(correctionService: CorrectionService): Router {
    const router: Router = Router({ mergeParams: true });

    router.get(
        '/',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const parseId = AgentIdSchema.safeParse(req.params.agentId);
            if (!parseId.success) {
                return res.status(400).json(formatZodError(parseId.error));
            }

            const corrections = await correctionService.list(parseId.data, toScope(auth));
            return res.json({ corrections });
        }),
    );

    router.post(
        '/',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const parseId = AgentIdSchema.safeParse(req.params.agentId);
            if (!parseId.success) {
                return res.status(400).json(formatZodError(parseId.error));
            }

            const parseBody = CreateCorrectionRequestSchema.safeParse(req.body);
            if (!parseBody.success) {
                return res.status(400).json(formatZodError(parseBody.error));
            }

            const correction = await correctionService.create(
                parseId.data,
                parseBody.data,
                toScope(auth),
            );
            return res.status(201).json({ correction });
        }),
    );

    router.patch(
        '/:correctionId',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const parseAgentId = AgentIdSchema.safeParse(req.params.agentId);
            if (!parseAgentId.success) {
                return res.status(400).json(formatZodError(parseAgentId.error));
            }

            const parseCorrectionId = CorrectionIdSchema.safeParse(req.params.correctionId);
            if (!parseCorrectionId.success) {
                return res.status(400).json(formatZodError(parseCorrectionId.error));
            }

            const parseBody = UpdateCorrectionRequestSchema.safeParse(req.body);
            if (!parseBody.success) {
                return res.status(400).json(formatZodError(parseBody.error));
            }

            const correction = await correctionService.update(
                parseAgentId.data,
                parseCorrectionId.data,
                parseBody.data,
                toScope(auth),
            );
            return res.json({ correction });
        }),
    );

    router.delete(
        '/:correctionId',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const parseAgentId = AgentIdSchema.safeParse(req.params.agentId);
            if (!parseAgentId.success) {
                return res.status(400).json(formatZodError(parseAgentId.error));
            }

            const parseCorrectionId = CorrectionIdSchema.safeParse(req.params.correctionId);
            if (!parseCorrectionId.success) {
                return res.status(400).json(formatZodError(parseCorrectionId.error));
            }

            await correctionService.remove(
                parseAgentId.data,
                parseCorrectionId.data,
                toScope(auth),
            );
            return res.status(204).send();
        }),
    );

    return router;
}
