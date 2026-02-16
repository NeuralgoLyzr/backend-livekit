import { Router } from 'express';
import {
    AgentIdSchema,
    CreateAgentRequestSchema,
    UpdateAgentRequestSchema,
} from '../types/index.js';
import type { AgentRegistryService } from '../services/agentRegistryService.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { formatZodError } from '../lib/zod.js';
import type { RequestAuthLocals } from '../middleware/apiKeyAuth.js';
import { HttpError } from '../lib/httpErrors.js';

function requireAuth(res: { locals: unknown }): { orgId: string; userId: string; isAdmin: boolean } {
    const auth = (res.locals as RequestAuthLocals).auth;
    if (!auth) {
        throw new HttpError(401, 'Missing auth context');
    }
    return auth;
}

export function createAgentsRouter(agentRegistryService: AgentRegistryService): Router {
    const router: Router = Router();

    router.get(
        '/',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const rawLimit = req.query.limit ? Number(req.query.limit) : undefined;
            const rawOffset = req.query.offset ? Number(req.query.offset) : undefined;
            const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;
            const offset = Number.isFinite(rawOffset) ? rawOffset : undefined;

            const agents = await agentRegistryService.listAgents(auth, { limit, offset });
            return res.json({ agents });
        })
    );

    router.post(
        '/',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const parseResult = CreateAgentRequestSchema.safeParse(req.body);
            if (!parseResult.success) {
                return res.status(400).json(formatZodError(parseResult.error));
            }

            const created = await agentRegistryService.createAgent(auth, {
                config: parseResult.data.config,
            });

            return res.status(201).json({ agent: created });
        })
    );

    router.get(
        '/:agentId',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const parseId = AgentIdSchema.safeParse(req.params.agentId);
            if (!parseId.success) {
                return res.status(400).json(formatZodError(parseId.error));
            }

            const agent = await agentRegistryService.getAgent(auth, parseId.data);
            if (!agent) return res.status(404).json({ error: 'Agent not found' });
            return res.json({ agent });
        })
    );

    router.put(
        '/:agentId',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const parseId = AgentIdSchema.safeParse(req.params.agentId);
            if (!parseId.success) {
                return res.status(400).json(formatZodError(parseId.error));
            }

            const parseBody = UpdateAgentRequestSchema.safeParse(req.body);
            if (!parseBody.success) {
                return res.status(400).json(formatZodError(parseBody.error));
            }

            const updated = await agentRegistryService.updateAgent(auth, parseId.data, {
                config: parseBody.data.config,
            });
            if (!updated) return res.status(404).json({ error: 'Agent not found' });
            return res.json({ agent: updated });
        })
    );

    router.delete(
        '/:agentId',
        asyncHandler(async (req, res) => {
            const auth = requireAuth(res);
            const parseId = AgentIdSchema.safeParse(req.params.agentId);
            if (!parseId.success) {
                return res.status(400).json(formatZodError(parseId.error));
            }

            const deleted = await agentRegistryService.deleteAgent(auth, parseId.data);
            if (!deleted) return res.status(404).json({ error: 'Agent not found' });
            return res.status(204).send();
        })
    );

    return router;
}
