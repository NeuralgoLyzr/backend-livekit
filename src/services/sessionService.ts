import { randomUUID } from 'crypto';
import { tokenService } from './tokenService.js';
import { agentService } from './agentService.js';
import { roomService } from './roomService.js';
import type { SessionStorePort } from '../ports/sessionStorePort.js';
import { sessionStore } from '../lib/storage.js';
import { config } from '../config/index.js';
import { deriveRagConfigFromKnowledgeBase, normalizeTools } from '../config/tools.js';
import type { AgentConfig } from '../types/index.js';
import { HttpError } from '../lib/httpErrors.js';
import { isDevelopment } from '../lib/env.js';
import { AGENT_DEFAULTS } from '../CONSTS.js';
import { MongooseAgentStore } from '../adapters/mongoose/mongooseAgentStore.js';
import { createAgentConfigResolverService } from './agentConfigResolverService.js';

export interface CreateSessionInput {
    userIdentity: string;
    roomName?: string;
    agentId?: string;
    agentConfig?: AgentConfig;
}

export interface CreateSessionResponse {
    userToken: string;
    roomName: string;
    livekitUrl: string;
    agentDispatched: true;
    agentConfig: {
        engine: NonNullable<AgentConfig['engine']>;
        tools: string[];
    };
}

function summarizeAgentConfig(agentConfig?: AgentConfig): CreateSessionResponse['agentConfig'] {
    return {
        engine: agentConfig?.engine ?? AGENT_DEFAULTS.engine,
        tools: agentConfig?.tools ?? AGENT_DEFAULTS.tools,
    };
}

/**
 * Placeholder hook to set default dynamic variables.
 *
 * Intentionally returns the config unchanged for now (no defaults set by default),
 * but provides a single place to add future logic (e.g. app-wide defaults).
 */
function applyDefaultDynamicVariables(agentConfig: AgentConfig): AgentConfig {
    return agentConfig;
}

export interface SessionServiceDeps {
    store: SessionStorePort;
}

export function createSessionService(deps: SessionServiceDeps) {
    let resolver:
        | ReturnType<typeof createAgentConfigResolverService>
        | null = null;
    function getResolver() {
        if (resolver) return resolver;
        resolver = createAgentConfigResolverService({ agentStore: new MongooseAgentStore() });
        return resolver;
    }

    return {
        async createSession(input: CreateSessionInput): Promise<CreateSessionResponse> {
            const userIdentity = input.userIdentity.trim();
            const requestedRoomName = input.roomName?.trim() ?? '';

            // Generate room name if not provided
            const roomName =
                requestedRoomName.length > 0 ? requestedRoomName : `room-${randomUUID()}`;

            const agentConfig =
                input.agentId
                    ? await getResolver().resolveByAgentId({
                        agentId: input.agentId,
                        overrides: input.agentConfig,
                    })
                    : (input.agentConfig ?? {});
            const normalizedTools = normalizeTools(agentConfig);
            const derivedRag = deriveRagConfigFromKnowledgeBase(agentConfig);

            const finalAgentConfig: AgentConfig = {
                ...agentConfig,
                tools: normalizedTools,
                ...derivedRag,
            };
            const finalAgentConfigWithDefaults = applyDefaultDynamicVariables(finalAgentConfig);

            // Keep legacy correlation fields (used by some tools and logs).
            // Note: unrelated to dynamic prompt variables.
            const agentConfigWithIds: AgentConfig = {
                ...finalAgentConfigWithDefaults,
                user_id: userIdentity,
                session_id: roomName,
            };

            const userToken = await tokenService.createUserToken(userIdentity, roomName);

            if (isDevelopment()) {
                console.log(
                    '[sessionService] Dispatching agent config:',
                    agentConfigWithIds
                );
            }

            try {
                await agentService.dispatchAgent(roomName, agentConfigWithIds);
            } catch (error) {
                throw new HttpError(
                    502,
                    'Failed to dispatch agent',
                    error instanceof Error ? error.message : error
                );
            }

            deps.store.set(roomName, {
                userIdentity,
                agentConfig: agentConfigWithIds,
                createdAt: new Date().toISOString(),
            });

            return {
                userToken,
                roomName,
                livekitUrl: config.livekit.url,
                agentDispatched: true,
                agentConfig: summarizeAgentConfig(finalAgentConfig),
            };
        },

        async endSession(roomName: string): Promise<void> {
            const normalizedRoomName = roomName.trim();

            if (!deps.store.has(normalizedRoomName)) {
                throw new HttpError(404, 'Session not found for room');
            }

            try {
                await roomService.deleteRoom(normalizedRoomName);
            } catch (error) {
                throw new HttpError(
                    502,
                    `Failed to delete LiveKit room "${normalizedRoomName}"`,
                    error instanceof Error ? error.message : error
                );
            }

            deps.store.delete(normalizedRoomName);
        },
    };
}

export const sessionService = createSessionService({ store: sessionStore });

