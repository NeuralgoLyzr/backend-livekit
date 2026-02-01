import { Router } from 'express';
import { ZodError } from 'zod';
import {
    AgentIdSchema,
    CreateAgentRequestSchema,
    UpdateAgentRequestSchema,
} from '../types/index.js';
import { formatErrorResponse, getErrorStatus } from '../lib/httpErrors.js';
import { MongooseAgentStore } from '../adapters/mongoose/mongooseAgentStore.js';
import { createAgentRegistryService } from '../services/agentRegistryService.js';

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

router.get('/', async (req, res) => {
    try {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : undefined;

        const agents = await getService().listAgents({ limit, offset });
        return res.json({ agents });
    } catch (error) {
        res.status(getErrorStatus(error)).json(
            formatErrorResponse(error, {
                fallbackMessage: 'Failed to list agents',
            })
        );
    }
});

router.post('/', async (req, res) => {
    try {
        const parseResult = CreateAgentRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json(formatZodError(parseResult.error));
        }

        const created = await getService().createAgent({
            name: parseResult.data.name,
            description: parseResult.data.description ?? null,
            config: parseResult.data.config ?? {},
        });

        return res.status(201).json({ agent: created });
    } catch (error) {
        res.status(getErrorStatus(error)).json(
            formatErrorResponse(error, {
                fallbackMessage: 'Failed to create agent',
            })
        );
    }
});

router.get('/:agentId', async (req, res) => {
    try {
        const parseId = AgentIdSchema.safeParse(req.params.agentId);
        if (!parseId.success) {
            return res.status(400).json(formatZodError(parseId.error));
        }

        const agent = await getService().getAgent(parseId.data);
        if (!agent) return res.status(404).json({ error: 'Agent not found' });
        return res.json({ agent });
    } catch (error) {
        res.status(getErrorStatus(error)).json(
            formatErrorResponse(error, {
                fallbackMessage: 'Failed to fetch agent',
            })
        );
    }
});

router.put('/:agentId', async (req, res) => {
    try {
        const parseId = AgentIdSchema.safeParse(req.params.agentId);
        if (!parseId.success) {
            return res.status(400).json(formatZodError(parseId.error));
        }

        const parseBody = UpdateAgentRequestSchema.safeParse(req.body);
        if (!parseBody.success) {
            return res.status(400).json(formatZodError(parseBody.error));
        }

        const updated = await getService().updateAgent(parseId.data, {
            ...parseBody.data,
        });
        if (!updated) return res.status(404).json({ error: 'Agent not found' });
        return res.json({ agent: updated });
    } catch (error) {
        res.status(getErrorStatus(error)).json(
            formatErrorResponse(error, {
                fallbackMessage: 'Failed to update agent',
            })
        );
    }
});

router.delete('/:agentId', async (req, res) => {
    try {
        const parseId = AgentIdSchema.safeParse(req.params.agentId);
        if (!parseId.success) {
            return res.status(400).json(formatZodError(parseId.error));
        }

        const deleted = await getService().deleteAgent(parseId.data);
        if (!deleted) return res.status(404).json({ error: 'Agent not found' });
        return res.status(204).send();
    } catch (error) {
        res.status(getErrorStatus(error)).json(
            formatErrorResponse(error, {
                fallbackMessage: 'Failed to delete agent',
            })
        );
    }
});

export default router;

