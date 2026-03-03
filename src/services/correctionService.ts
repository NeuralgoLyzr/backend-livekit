import { randomUUID } from 'node:crypto';
import type {
    Correction,
    CreateCorrectionRequest,
    UpdateCorrectionRequest,
} from '../types/index.js';
import type { AgentStorePort } from '../ports/agentStorePort.js';
import { HttpError } from '../lib/httpErrors.js';
import { logger } from '../lib/logger.js';

const MAX_CORRECTIONS_PER_AGENT = 50;

async function distillRule(originalAnswer: string, userFeedback: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return userFeedback.trim();
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                temperature: 0,
                max_tokens: 150,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a concise rule writer. Given an AI agent\'s original answer and user feedback about what was wrong, write a single concise correction rule (one sentence, max 120 words) that the agent should follow in future conversations. Start with an action verb. Do not include quotes or bullet points.',
                    },
                    {
                        role: 'user',
                        content: `Original agent answer:\n${originalAnswer}\n\nUser feedback:\n${userFeedback}`,
                    },
                ],
            }),
        });

        if (!response.ok) {
            logger.warn(
                { event: 'correction_distill_failed', status: response.status },
                'OpenAI distillation failed, using raw feedback',
            );
            return userFeedback.trim();
        }

        const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content?.trim();
        return content || userFeedback.trim();
    } catch (error) {
        logger.warn(
            { event: 'correction_distill_error', err: error },
            'OpenAI distillation error, using raw feedback',
        );
        return userFeedback.trim();
    }
}

export interface CorrectionService {
    list(agentId: string, scope: { orgId: string; createdByUserId?: string }): Promise<Correction[]>;
    create(
        agentId: string,
        input: CreateCorrectionRequest,
        scope: { orgId: string; createdByUserId?: string },
    ): Promise<Correction>;
    update(
        agentId: string,
        correctionId: string,
        input: UpdateCorrectionRequest,
        scope: { orgId: string; createdByUserId?: string },
    ): Promise<Correction>;
    remove(
        agentId: string,
        correctionId: string,
        scope: { orgId: string; createdByUserId?: string },
    ): Promise<void>;
}

function getCorrections(config: Record<string, unknown>): Correction[] {
    return (Array.isArray(config.corrections) ? config.corrections : []) as Correction[];
}

export function createCorrectionService(deps: {
    agentStore: AgentStorePort;
}): CorrectionService {
    async function getAgentOrThrow(
        agentId: string,
        scope: { orgId: string; createdByUserId?: string },
    ) {
        const agent = await deps.agentStore.getById(agentId, scope);
        if (!agent) {
            throw new HttpError(404, 'Agent not found');
        }
        return agent;
    }

    async function saveCorrections(
        agentId: string,
        corrections: Correction[],
        config: Record<string, unknown>,
        scope: { orgId: string; createdByUserId?: string },
    ): Promise<void> {
        const updated = await deps.agentStore.update(
            agentId,
            { config: { ...config, corrections } as never },
            scope,
        );
        if (!updated) {
            throw new HttpError(404, 'Agent not found');
        }
    }

    return {
        async list(agentId, scope) {
            const agent = await getAgentOrThrow(agentId, scope);
            return getCorrections(agent.config as Record<string, unknown>);
        },

        async create(agentId, input, scope) {
            const agent = await getAgentOrThrow(agentId, scope);
            const config = agent.config as Record<string, unknown>;
            const corrections = getCorrections(config);

            const enabledCount = corrections.filter((c) => c.enabled).length;
            if (enabledCount >= MAX_CORRECTIONS_PER_AGENT) {
                throw new HttpError(
                    422,
                    `Maximum of ${MAX_CORRECTIONS_PER_AGENT} enabled corrections reached. Disable or delete existing corrections first.`,
                );
            }

            const correctedRule = await distillRule(input.originalAnswer, input.userFeedback);
            const now = new Date().toISOString();
            const correction: Correction = {
                id: randomUUID(),
                sourceSessionId: input.sourceSessionId,
                sourceMessageId: input.sourceMessageId,
                originalAnswer: input.originalAnswer,
                userFeedback: input.userFeedback,
                correctedRule,
                enabled: true,
                createdAt: now,
                updatedAt: now,
            };

            corrections.push(correction);
            await saveCorrections(agentId, corrections, config, scope);
            return correction;
        },

        async update(agentId, correctionId, input, scope) {
            const agent = await getAgentOrThrow(agentId, scope);
            const config = agent.config as Record<string, unknown>;
            const corrections = getCorrections(config);

            const index = corrections.findIndex((c) => c.id === correctionId);
            if (index === -1) {
                throw new HttpError(404, 'Correction not found');
            }

            const existing = corrections[index];
            const updated: Correction = {
                ...existing,
                correctedRule: input.correctedRule ?? existing.correctedRule,
                enabled: input.enabled ?? existing.enabled,
                updatedAt: new Date().toISOString(),
            };
            corrections[index] = updated;
            await saveCorrections(agentId, corrections, config, scope);
            return updated;
        },

        async remove(agentId, correctionId, scope) {
            const agent = await getAgentOrThrow(agentId, scope);
            const config = agent.config as Record<string, unknown>;
            const corrections = getCorrections(config);

            const index = corrections.findIndex((c) => c.id === correctionId);
            if (index === -1) {
                throw new HttpError(404, 'Correction not found');
            }

            corrections.splice(index, 1);
            await saveCorrections(agentId, corrections, config, scope);
        },
    };
}
