/**
 * Session endpoint
 * Creates user tokens and dispatches agents with custom configuration
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { tokenService } from '../services/tokenService.js';
import { agentService } from '../services/agentService.js';
import { roomService } from '../services/roomService.js';
import { storage } from '../lib/storage.js';
import { config } from '../config/index.js';
import { deriveRagConfigFromFeatures, normalizeTools } from '../config/tools.js';
import {
    SessionRequestSchema,
    EndSessionRequestSchema,
    type AgentConfig,
} from '../types/index.js';
import { ZodError } from 'zod';

const router: Router = Router();

function formatZodError(error: ZodError): { error: string; issues: typeof error.issues } {
    return {
        error: error.issues.map((i) => i.message).join('; '),
        issues: error.issues,
    };
}

router.post('/', async (req, res) => {
    try {
        const parseResult = SessionRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                ...formatZodError(parseResult.error),
                example: {
                    userIdentity: 'user123',
                    roomName: 'optional-room-name',
                    agentConfig: {
                        stt: 'assemblyai/universal-streaming:en',
                        tts: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
                        llm: 'openai/gpt-4o-mini',
                        prompt: 'You are a helpful voice AI assistant.',
                        greeting: "Say, 'Hi I'm Maya, how can I help you today?'",
                        realtime: false,
                        realtime_model: 'gpt-4o-realtime-preview',
                        realtime_voice: 'sage',
                        vad_enabled: true,
                        turn_detection_enabled: true,
                        noise_cancellation_enabled: true,
                        noise_cancellation_type: 'auto',
                        avatar: {
                            enabled: true,
                            provider: 'anam',
                            anam: {
                                name: 'Maya',
                                avatarId: '<anam-avatar-id>',
                            },
                        },
                    },
                },
            });
        }

        const { userIdentity, roomName, agentConfig } = parseResult.data;
        const normalizedTools = normalizeTools(agentConfig);
        const derivedRag = deriveRagConfigFromFeatures(agentConfig);
        const finalAgentConfig: AgentConfig = {
            ...agentConfig,
            tools: normalizedTools,
            ...derivedRag,
        };

        // Generate room name if not provided
        const finalRoomName = roomName?.trim() || `room-${randomUUID()}`;

        // Ensure external tools can correlate requests.
        const agentConfigWithIds: AgentConfig = {
            ...finalAgentConfig,
            user_id: userIdentity.trim(),
            session_id: finalRoomName,
        };

        // Generate user token
        const userToken = await tokenService.createUserToken(userIdentity.trim(), finalRoomName);

        if (process.env.NODE_ENV !== 'production') {
            console.log('[session] Dispatching agent config:', agentConfigWithIds);
        }

        // Dispatch agent with custom configuration
        await agentService.dispatchAgent(finalRoomName, agentConfigWithIds);

        // Store session metadata only after successful dispatch
        storage.set(finalRoomName, {
            userIdentity: userIdentity.trim(),
            agentConfig: agentConfigWithIds,
            createdAt: new Date().toISOString(),
        });

        // Return session details
        res.json({
            userToken,
            roomName: finalRoomName,
            livekitUrl: config.livekit.url,
            agentDispatched: true,
            agentConfig: {
                stt: finalAgentConfig?.stt ?? 'assemblyai/universal-streaming:en',
                tts:
                    finalAgentConfig?.tts ??
                    'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
                llm: finalAgentConfig?.llm ?? 'openai/gpt-4o-mini',
                realtime: finalAgentConfig?.realtime ?? false,
                tools: finalAgentConfig?.tools ?? [],
            },
        });
    } catch (error) {
        console.error('Session creation error:', error);
        res.status(500).json({
            error: 'Failed to create session',
            // Only expose error details in development
            ...(process.env.NODE_ENV !== 'production' && {
                details: error instanceof Error ? error.message : 'Unknown error',
            }),
        });
    }
});

router.post('/end', async (req, res) => {
    try {
        const parseResult = EndSessionRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json(formatZodError(parseResult.error));
        }

        const { roomName } = parseResult.data;
        const normalizedRoomName = roomName.trim();

        if (!storage.has(normalizedRoomName)) {
            return res.status(404).json({ error: 'Session not found for room' });
        }

        try {
            await roomService.deleteRoom(normalizedRoomName);
        } catch (error) {
            console.error(`Failed to delete room "${normalizedRoomName}":`, error);
            return res.status(502).json({
                error: 'Failed to delete LiveKit room',
                ...(error instanceof Error && { details: error.message }),
            });
        }

        storage.delete(normalizedRoomName);
        res.status(204).send();
    } catch (error) {
        console.error('Session termination error:', error);
        res.status(500).json({
            error: 'Failed to end session',
            ...(process.env.NODE_ENV !== 'production' && {
                details: error instanceof Error ? error.message : 'Unknown error',
            }),
        });
    }
});

export default router;
