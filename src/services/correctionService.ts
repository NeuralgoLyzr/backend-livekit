import { randomUUID } from 'node:crypto';
import type {
    Correction,
    ConversationContextItem,
    CreateCorrectionRequest,
    UpdateCorrectionRequest,
} from '../types/index.js';
import type { AgentStorePort } from '../ports/agentStorePort.js';
import { HttpError } from '../lib/httpErrors.js';
import { logger } from '../lib/logger.js';

const MAX_CORRECTIONS_PER_AGENT = 50;

function buildFallbackRule(
    originalAnswer: string,
    userFeedback: string,
    conversationContext?: ConversationContextItem[]
): string {
    const userQuestion =
        conversationContext?.findLast((m: ConversationContextItem) => m.role === 'user')?.content ??
        '';
    const questionPart = userQuestion
        ? `When asked "${userQuestion.slice(0, 500)}", `
        : 'When responding, ';
    return `${questionPart}you answered "${originalAnswer.slice(0, 500)}", and the user instructed you to: ${userFeedback.trim()}`;
}

function formatConversationContext(context: ConversationContextItem[]): string {
    return context.map((m) => `[${m.role}]: ${m.content}`).join('\n');
}

async function distillRule(
    originalAnswer: string,
    userFeedback: string,
    conversationContext?: ConversationContextItem[]
): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return buildFallbackRule(originalAnswer, userFeedback, conversationContext);
    }

    const contextSection = conversationContext?.length
        ? `\n\nConversation context (surrounding messages):\n${formatConversationContext(conversationContext)}`
        : '';

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-5.2',
                temperature: 0,
                max_tokens: 300,
                messages: [
                    {
                        role: 'system',
                        content:
                            "You are a correction rule writer for a voice AI agent. Given the conversation context, the agent's answer, and the reviewer's feedback, write a correction rule in this exact format:\n\n\"When asked <summarize the user's question/topic>, you answered <summarize what the agent said wrong>, and the user instructed you to <summarize the correct behavior>.\"\n\nKeep each section concise but preserve the important details from the feedback. The rule must be a single paragraph, max 250 words. Do not add quotes around the entire output.",
                    },
                    {
                        role: 'user',
                        content: `Agent's answer:\n${originalAnswer}\n\nReviewer feedback:\n${userFeedback}${contextSection}`,
                    },
                ],
            }),
        });

        if (!response.ok) {
            logger.warn(
                { event: 'correction_distill_failed', status: response.status },
                'OpenAI distillation failed, using fallback rule'
            );
            return buildFallbackRule(originalAnswer, userFeedback, conversationContext);
        }

        const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content?.trim();
        return content || buildFallbackRule(originalAnswer, userFeedback, conversationContext);
    } catch (error) {
        logger.warn(
            { event: 'correction_distill_error', err: error },
            'OpenAI distillation error, using fallback rule'
        );
        return buildFallbackRule(originalAnswer, userFeedback, conversationContext);
    }
}

export interface CorrectionService {
    list(
        agentId: string,
        scope: { orgId: string; createdByUserId?: string }
    ): Promise<Correction[]>;
    create(
        agentId: string,
        input: CreateCorrectionRequest,
        scope: { orgId: string; createdByUserId?: string }
    ): Promise<Correction>;
    update(
        agentId: string,
        correctionId: string,
        input: UpdateCorrectionRequest,
        scope: { orgId: string; createdByUserId?: string }
    ): Promise<Correction>;
    remove(
        agentId: string,
        correctionId: string,
        scope: { orgId: string; createdByUserId?: string }
    ): Promise<void>;
}

function getCorrections(config: Record<string, unknown>): Correction[] {
    return (Array.isArray(config.corrections) ? config.corrections : []) as Correction[];
}

export function createCorrectionService(deps: { agentStore: AgentStorePort }): CorrectionService {
    async function getAgentOrThrow(
        agentId: string,
        scope: { orgId: string; createdByUserId?: string }
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
        scope: { orgId: string; createdByUserId?: string }
    ): Promise<void> {
        const updated = await deps.agentStore.update(
            agentId,
            { config: { ...config, corrections } as never },
            scope
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
                    `Maximum of ${MAX_CORRECTIONS_PER_AGENT} enabled corrections reached. Disable or delete existing corrections first.`
                );
            }

            const correctedRule = await distillRule(
                input.originalAnswer,
                input.userFeedback,
                input.conversationContext
            );
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
