import { Router } from 'express';
import { ZodError } from 'zod';
import {
    AgentIdSchema,
    CreateAgentRequestSchema,
    UpdateAgentRequestSchema,
} from '../types/index.js';
import { MongooseAgentStore } from '../adapters/mongoose/mongooseAgentStore.js';
import { createAgentRegistryService } from '../services/agentRegistryService.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router: Router = Router();

function formatZodError(error: ZodError): { error: string; issues: typeof error.issues } {
    return {
        error: error.issues.map((i) => i.message).join('; '),
        issues: error.issues,
    };
}

let cachedService: ReturnType<typeof createAgentRegistryService> | null = null;
function getService() {
    if (cachedService) return cachedService;
    const store = new MongooseAgentStore();
    cachedService = createAgentRegistryService({ store });
    return cachedService;
}

router.get(
    '/',
    asyncHandler(async (req, res) => {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : undefined;

        const agents = await getService().listAgents({ limit, offset });
        return res.json({ agents });
    })
);

router.post(
    '/',
    asyncHandler(async (req, res) => {
        const parseResult = CreateAgentRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json(formatZodError(parseResult.error));
        }

        const created = await getService().createAgent({
            config: parseResult.data.config,
        });

        return res.status(201).json({ agent: created });
    })
);

router.get(
    '/:agentId',
    asyncHandler(async (req, res) => {
        const parseId = AgentIdSchema.safeParse(req.params.agentId);
        if (!parseId.success) {
            return res.status(400).json(formatZodError(parseId.error));
        }

        const agent = await getService().getAgent(parseId.data);
        if (!agent) return res.status(404).json({ error: 'Agent not found' });
        return res.json({ agent });
    })
);

router.put(
    '/:agentId',
    asyncHandler(async (req, res) => {
        const parseId = AgentIdSchema.safeParse(req.params.agentId);
        if (!parseId.success) {
            return res.status(400).json(formatZodError(parseId.error));
        }

        const parseBody = UpdateAgentRequestSchema.safeParse(req.body);
        if (!parseBody.success) {
            return res.status(400).json(formatZodError(parseBody.error));
        }

        const updated = await getService().updateAgent(parseId.data, {
            config: parseBody.data.config,
        });
        if (!updated) return res.status(404).json({ error: 'Agent not found' });
        return res.json({ agent: updated });
    })
);

router.delete(
    '/:agentId',
    asyncHandler(async (req, res) => {
        const parseId = AgentIdSchema.safeParse(req.params.agentId);
        if (!parseId.success) {
            return res.status(400).json(formatZodError(parseId.error));
        }

        const deleted = await getService().deleteAgent(parseId.data);
        if (!deleted) return res.status(404).json({ error: 'Agent not found' });
        return res.status(204).send();
    })
);

export default router;

