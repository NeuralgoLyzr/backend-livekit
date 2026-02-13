import { randomUUID } from 'crypto';
import type { SessionStorePort } from '../ports/sessionStorePort.js';
import { finalizeAgentConfig } from '../config/tools.js';
import type { AgentConfig } from '../types/index.js';
import { HttpError } from '../lib/httpErrors.js';
import { isDevelopment } from '../lib/env.js';
import { AGENT_DEFAULTS } from '../CONSTS.js';
import { summarizeAgentConfigForLog } from '../lib/agentConfigSummary.js';
import { logger } from '../lib/logger.js';
import type { AgentService } from './agentService.js';
import type { TokenService } from './tokenService.js';
import type { RoomService } from './roomService.js';
import type { AgentConfigResolverService } from './agentConfigResolverService.js';

export interface CreateSessionInput {
    userIdentity: string;
    roomName?: string;
    sessionId?: string;
    agentId?: string;
    agentConfig?: AgentConfig;
    /**
     * Tenant id derived from `x-api-key` (Pagos). Used for transcript scoping.
     */
    orgId?: string;
    /**
     * Agent Studio user id derived from Pagos policy. Used for Phase 2 RBAC.
     */
    createdByUserId?: string;
}

export interface CreateSessionResponse {
    userToken: string;
    roomName: string;
    sessionId: string;
    livekitUrl: string;
    agentDispatched: true;
    agentConfig: {
        engine: NonNullable<AgentConfig['engine']>;
        tools: string[];
    };
}

function buildResponseAgentSummary(
    agentConfig?: AgentConfig
): CreateSessionResponse['agentConfig'] {
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
    tokenService: TokenService;
    agentService: AgentService;
    roomService: RoomService;
    agentConfigResolver: AgentConfigResolverService;
    livekitUrl: string;
}

export function createSessionService(deps: SessionServiceDeps) {
    return {
        async createSession(input: CreateSessionInput): Promise<CreateSessionResponse> {
            const userIdentity = input.userIdentity.trim();
            const requestedRoomName = input.roomName?.trim() ?? '';
            const requestedSessionId = input.sessionId?.trim() ?? '';

            const roomName =
                requestedRoomName.length > 0 ? requestedRoomName : `room-${randomUUID()}`;
            const sessionId = requestedSessionId.length > 0 ? requestedSessionId : randomUUID();

            const resolvedConfig = input.agentId
                ? await deps.agentConfigResolver.resolveByAgentId({
                      agentId: input.agentId,
                      overrides: input.agentConfig,
                  })
                : (input.agentConfig ?? {});

            const finalAgentConfig = finalizeAgentConfig(resolvedConfig);
            const finalAgentConfigWithDefaults = applyDefaultDynamicVariables(finalAgentConfig);

            const agentConfigWithIds: AgentConfig = {
                ...finalAgentConfigWithDefaults,
                ...(input.agentId ? { agent_id: input.agentId } : {}),
                user_id: userIdentity,
                session_id: sessionId,
            };

            const userToken = await deps.tokenService.createUserToken(userIdentity, roomName);

            if (isDevelopment()) {
                logger.debug(
                    {
                        event: 'session_create_dispatch_attempt',
                        roomName,
                        userIdentity,
                        agentId: input.agentId,
                        agentConfig: summarizeAgentConfigForLog(finalAgentConfigWithDefaults),
                        hasApiKey: Boolean(agentConfigWithIds.api_key),
                    },
                    'Dispatching agent (dev)'
                );
            }

            try {
                await deps.agentService.dispatchAgent(roomName, agentConfigWithIds);
            } catch (error) {
                throw new HttpError(
                    502,
                    'Failed to dispatch agent',
                    error instanceof Error ? error.message : error
                );
            }

            deps.store.set(roomName, {
                userIdentity,
                sessionId,
                orgId: input.orgId,
                createdByUserId: input.createdByUserId,
                agentConfig: agentConfigWithIds,
                createdAt: new Date().toISOString(),
            });

            return {
                userToken,
                roomName,
                sessionId,
                livekitUrl: deps.livekitUrl,
                agentDispatched: true,
                agentConfig: buildResponseAgentSummary(finalAgentConfig),
            };
        },

        async endSession(input: { roomName?: string; sessionId?: string }): Promise<void> {
            const normalizedRoomName = input.roomName?.trim() ?? '';
            const normalizedSessionId = input.sessionId?.trim() ?? '';

            let roomName = normalizedRoomName;
            if (!roomName && normalizedSessionId) {
                const match = deps.store
                    .entries()
                    .find(([, data]) => data.sessionId === normalizedSessionId);
                roomName = match?.[0] ?? '';
            }

            if (!roomName) {
                if (normalizedSessionId) {
                    throw new HttpError(404, 'Session not found for sessionId');
                }
                throw new HttpError(400, 'Must provide roomName or sessionId');
            }

            if (!deps.store.has(roomName)) {
                throw new HttpError(404, 'Session not found for room');
            }

            // IMPORTANT:
            // Do NOT delete the LiveKit room here. Deleting the room immediately can
            // prevent the agent session from closing cleanly, which in turn can
            // prevent post-call observability hooks (session history/report) from
            // being emitted.
            //
            // Instead, mark the session as ended and let a later step (e.g.
            // `/session/observability`) perform cleanup once transcripts/reports
            // have been received.
            const existing = deps.store.get(roomName);
            if (existing) {
                deps.store.set(roomName, {
                    ...existing,
                    endedAt: new Date().toISOString(),
                });
            }
        },

        async cleanupSession(roomName: string): Promise<void> {
            const normalizedRoomName = roomName.trim();

            try {
                await deps.roomService.deleteRoom(normalizedRoomName);
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

export type SessionService = ReturnType<typeof createSessionService>;
