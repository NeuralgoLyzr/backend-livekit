import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { setRequiredEnv } from './testUtils.js';

const EXPECTED_DISPATCH_METADATA_KEYS = [
    'agentId',
    'agent_description',
    'agent_name',
    'agentic_rag',
    'apiKey',
    'audio_recording_enabled',
    'avatar',
    'background_audio',
    'conversation_start',
    'dynamic_variable_defaults',
    'dynamic_variables',
    'engine',
    'lyzr_rag',
    'lyzr_tools',
    'managed_agents',
    'noise_cancellation',
    'preemptive_generation',
    'prompt',
    'pronunciation_correction',
    'pronunciation_rules',
    'session_id',
    'tools',
    'turn_detection',
    'user_id',
    'vad_enabled',
] as const;

const DispatchMetadataContractSchema = z
    .object({
        engine: z.object({ kind: z.enum(['pipeline', 'realtime']) }).passthrough(),
        prompt: z.string(),
        dynamic_variables: z.record(z.string(), z.string()).optional(),
        dynamic_variable_defaults: z.record(z.string(), z.string()).optional(),
        turn_detection: z.enum(['english', 'multilingual']),
        noise_cancellation: z
            .object({
                enabled: z.boolean(),
                type: z.enum(['auto', 'telephony', 'standard', 'none']),
            })
            .optional(),
        conversation_start: z
            .object({
                who: z.enum(['human', 'ai']),
                greeting: z.string().optional(),
            })
            .optional(),
        agent_name: z.string().optional(),
        agent_description: z.string().optional(),
        apiKey: z.string().optional(),
        agentId: z.string().optional(),
        managed_agents: z
            .object({
                enabled: z.boolean(),
                agents: z.array(
                    z.object({
                        id: z.string(),
                        name: z.string(),
                        usage_description: z.string(),
                    })
                ),
            })
            .optional(),
        user_id: z.string().optional(),
        session_id: z.string().optional(),
        tools: z.array(z.string()),
        lyzr_tools: z
            .array(
                z.object({
                    tool_name: z.string(),
                    tool_source: z.string(),
                    action_names: z.array(z.string()),
                    persist_auth: z.boolean(),
                })
            )
            .optional(),
        lyzr_rag: z
            .object({
                base_url: z.string(),
                rag_id: z.string(),
                rag_name: z.string().optional(),
            })
            .optional(),
        agentic_rag: z.array(
            z.object({
                rag_id: z.string(),
                top_k: z.number(),
                retrieval_type: z.string(),
                score_threshold: z.number(),
            })
        ),
        vad_enabled: z.boolean(),
        preemptive_generation: z.boolean(),
        pronunciation_correction: z.boolean(),
        pronunciation_rules: z.record(z.string(), z.string()).optional(),
        audio_recording_enabled: z.boolean(),
        background_audio: z
            .object({
                ambient: z
                    .object({
                        enabled: z.boolean().optional(),
                        source: z.string().optional(),
                        volume: z.number().optional(),
                    })
                    .optional(),
                tool_call: z
                    .object({
                        enabled: z.boolean().optional(),
                        sources: z
                            .array(
                                z.object({
                                    source: z.string(),
                                    volume: z.number().optional(),
                                    probability: z.number().optional(),
                                })
                            )
                            .optional(),
                    })
                    .optional(),
                turn_taking: z
                    .object({
                        enabled: z.boolean().optional(),
                        sources: z
                            .array(
                                z.object({
                                    source: z.string(),
                                    volume: z.number().optional(),
                                    probability: z.number().optional(),
                                })
                            )
                            .optional(),
                    })
                    .optional(),
            })
            .optional(),
        avatar: z
            .object({
                enabled: z.boolean(),
                provider: z.string().optional(),
                avatar_participant_name: z.string().optional(),
            })
            .passthrough()
            .optional(),
    })
    .strict();

describe('agent dispatch metadata contract', () => {
    it('matches the backend->python metadata contract for a fully populated config', async () => {
        setRequiredEnv();

        const [{ createAgentService }, { AgentConfigSchema }] = await Promise.all([
            import('../src/services/agentService.js'),
            import('../src/types/index.js'),
        ]);

        const configResult = AgentConfigSchema.safeParse({
            engine: {
                kind: 'pipeline',
                stt: 'assemblyai/universal-streaming:en',
                llm: 'openai/gpt-4.1-mini',
                tts: 'cartesia/sonic-2',
                voice_id: 'voice-1',
                language: 'en',
            },
            prompt: 'You are helpful.',
            dynamic_variables: {
                customer_name: 'Alice',
            },
            dynamic_variable_defaults: {
                customer_name: 'Customer',
            },
            turn_detection: 'english',
            noise_cancellation: {
                enabled: true,
                type: 'auto',
            },
            conversation_start: {
                who: 'ai',
                greeting: 'Hello!',
            },
            agent_name: 'Contract Agent',
            agent_description: 'Contract validation agent',
            api_key: 'api-key-1',
            agent_id: '507f1f77bcf86cd799439011',
            managed_agents: {
                enabled: true,
                agents: [{ id: 'sales', name: 'Sales', usage_description: 'Sales escalation' }],
            },
            user_id: 'user-1',
            session_id: '00000000-0000-4000-8000-000000000000',
            tools: ['get_weather'],
            lyzr_tools: [
                {
                    tool_name: 'search_docs',
                    tool_source: 'lyzr',
                    action_names: ['find'],
                    persist_auth: false,
                },
            ],
            lyzr_rag: {
                base_url: 'https://example.com',
                rag_id: 'rag-1',
                rag_name: 'KB',
            },
            agentic_rag: [
                {
                    rag_id: 'rag-1',
                    top_k: 5,
                    retrieval_type: 'hybrid',
                    score_threshold: 0.3,
                },
            ],
            vad_enabled: true,
            preemptive_generation: true,
            pronunciation_correction: true,
            pronunciation_rules: {
                AI: 'A.I.',
            },
            audio_recording_enabled: true,
            background_audio: {
                enabled: true,
                ambient: {
                    enabled: true,
                    source: 'rain.mp3',
                    volume: 0.2,
                },
                tool_call: {
                    enabled: true,
                    sources: [
                        {
                            source: 'tool.mp3',
                            volume: 0.3,
                            probability: 1,
                        },
                    ],
                },
            },
            avatar: {
                enabled: true,
                provider: 'anam',
                anam: {
                    avatarId: 'av-1',
                    name: 'Maya',
                },
                avatar_participant_name: 'avatar-worker',
            },
        });

        expect(configResult.success).toBe(true);
        if (!configResult.success) {
            throw new Error('Agent config fixture is invalid');
        }

        const createDispatch = vi.fn().mockResolvedValue({ id: 'dispatch-contract-1' });
        const service = createAgentService({
            client: {
                createDispatch,
            } as never,
            agentName: 'contract-agent',
        });

        await service.dispatchAgent('room-contract-1', configResult.data);

        const call = createDispatch.mock.calls[0] as [string, string, { metadata: string }];
        const options = call[2];
        const metadata = JSON.parse(options.metadata) as Record<string, unknown>;

        const parseResult = DispatchMetadataContractSchema.safeParse(metadata);
        expect(parseResult.success).toBe(true);

        const keys = Object.keys(metadata).sort();
        expect(keys).toEqual([...EXPECTED_DISPATCH_METADATA_KEYS].sort());
    });

    it('keeps defaulted dispatch metadata fields stable when config is empty', async () => {
        setRequiredEnv();

        const [{ createAgentService }, { AGENT_DEFAULTS }] = await Promise.all([
            import('../src/services/agentService.js'),
            import('../src/CONSTS.js'),
        ]);

        const createDispatch = vi.fn().mockResolvedValue({ id: 'dispatch-contract-2' });
        const service = createAgentService({
            client: {
                createDispatch,
            } as never,
            agentName: 'contract-agent',
        });

        await service.dispatchAgent('room-contract-2', {});

        const call = createDispatch.mock.calls[0] as [string, string, { metadata: string }];
        const options = call[2];
        const metadata = JSON.parse(options.metadata) as Record<string, unknown>;

        expect(metadata.engine).toEqual(AGENT_DEFAULTS.engine);
        expect(metadata.prompt).toBe(AGENT_DEFAULTS.prompt);
        expect(metadata.turn_detection).toBe(AGENT_DEFAULTS.turn_detection);
        expect(metadata.noise_cancellation).toEqual(AGENT_DEFAULTS.noise_cancellation);
        expect(metadata.conversation_start).toEqual(AGENT_DEFAULTS.conversation_start);
        expect(metadata.tools).toEqual(AGENT_DEFAULTS.tools);
        expect(metadata.agentic_rag).toEqual(AGENT_DEFAULTS.agentic_rag);
        expect(metadata.vad_enabled).toBe(AGENT_DEFAULTS.vad_enabled);
        expect(metadata.preemptive_generation).toBe(false);
        expect(metadata.pronunciation_correction).toBe(false);
        expect(metadata.audio_recording_enabled).toBe(false);
        expect(metadata.apiKey).toBeUndefined();
        expect(metadata.agentId).toBeUndefined();
    });
});
