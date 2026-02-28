import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setRequiredEnv } from './testUtils.js';

const ORG_ID = '96f0cee4-bb87-4477-8eff-577ef2780614';
const USER_ID = 'member_user_1';
const AGENT_ID = '507f1f77bcf86cd799439011';

type Harness = ReturnType<typeof createHarness>;

function buildApp(harness: Harness) {
    const app = express();
    app.use(express.json({ limit: '10mb' }));

    app.use(
        '/session',
        harness.createSessionRouter(harness.sessionService, {
            transcriptService: harness.transcriptService,
            sessionStore: harness.sessionStore,
            pagosAuthService: {
                resolveAuthContext: harness.resolveAuthContext,
            },
            audioStorageService: {
                save: harness.saveAudio,
                get: harness.getAudio,
            },
        })
    );

    app.use(
        (
            err: unknown,
            _req: express.Request,
            res: express.Response,
            _next: express.NextFunction
        ) => {
            const status = harness.getErrorStatus(err);
            res.status(status).json(harness.formatErrorResponse(err));
        }
    );

    return app;
}

function createHarness() {
    const createDispatch = vi.fn().mockResolvedValue({ id: 'dispatch-1' });
    const deleteRoom = vi.fn().mockResolvedValue({ status: 'deleted' });
    const resolveAuthContext = vi.fn().mockResolvedValue({
        orgId: ORG_ID,
        userId: USER_ID,
        role: 'member',
        isAdmin: false,
    });

    const saveAudio = vi.fn().mockResolvedValue('audio-recording.ogg');
    const getAudio = vi.fn().mockResolvedValue({
        data: Buffer.from('fake-ogg-data'),
        contentType: 'audio/ogg',
    });

    const savedTranscripts: Array<Record<string, unknown>> = [];
    const transcriptStore = {
        save: vi.fn(async (input: Record<string, unknown>) => {
            savedTranscripts.push(input);
            return {
                id: `tr-${savedTranscripts.length}`,
                sessionId: String(input.sessionId),
                roomName: String(input.roomName),
                agentId: (input.agentId ?? null) as string | null,
                orgId: String(input.orgId),
                createdByUserId: (input.createdByUserId ?? null) as string | null,
                sessionReport: input.sessionReport,
                chatHistory: input.chatHistory,
                closeReason: (input.closeReason ?? null) as string | null,
                durationMs: (input.durationMs ?? null) as number | null,
                messageCount: Number(input.messageCount ?? 0),
                startedAt: (input.startedAt as Date).toISOString(),
                endedAt: (input.endedAt as Date).toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
        }),
        findBySessionId: vi.fn().mockResolvedValue(null),
        findByAgentId: vi.fn().mockResolvedValue({
            items: [],
            total: 0,
            limit: 50,
            offset: 0,
            nextOffset: null,
        }),
        list: vi.fn().mockResolvedValue({
            items: [],
            total: 0,
            limit: 50,
            offset: 0,
            nextOffset: null,
        }),
        getAgentStats: vi.fn().mockResolvedValue({
            totalCalls: 0,
            browserCalls: 0,
            phoneCalls: 0,
            avgMessages: null,
        }),
    };

    const agentStore = {
        list: vi.fn().mockResolvedValue([]),
        getById: vi.fn().mockResolvedValue({
            id: AGENT_ID,
            config: {
                prompt: 'Stored prompt',
                tools: ['get_weather'],
            },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        listVersions: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        activateVersion: vi.fn(),
        delete: vi.fn(),
    };

    return {
        createDispatch,
        deleteRoom,
        resolveAuthContext,
        saveAudio,
        getAudio,
        savedTranscripts,
        transcriptStore,
        agentStore,
    };
}

describe('session routes (integration)', () => {
    beforeEach(() => {
        vi.resetModules();
        setRequiredEnv({ TELEPHONY_ENABLED: 'false' });
    });

    it('creates, ends, ingests observability, and cleans up session end-to-end', async () => {
        const harness = createHarness();

        const [
            { createSessionRouter },
            { createSessionService },
            { createTokenService },
            { createAgentService },
            { createRoomService },
            { createAgentConfigResolverService },
            { createTranscriptService },
            { InMemorySessionStore },
            { getErrorStatus, formatErrorResponse },
        ] = await Promise.all([
            import('../dist/routes/session.js'),
            import('../dist/services/sessionService.js'),
            import('../dist/services/tokenService.js'),
            import('../dist/services/agentService.js'),
            import('../dist/services/roomService.js'),
            import('../dist/services/agentConfigResolverService.js'),
            import('../dist/services/transcriptService.js'),
            import('../dist/lib/storage.js'),
            import('../dist/lib/httpErrors.js'),
        ]);

        const sessionStore = new InMemorySessionStore();

        const tokenService = createTokenService({
            createAccessToken: ((identity: string) => ({
                addGrant: (_grant: unknown) => undefined,
                toJwt: () => `jwt-${identity}`,
            })) as never,
        });

        const agentService = createAgentService({
            client: {
                createDispatch: harness.createDispatch,
            } as never,
            agentName: 'integration-agent',
        });

        const roomService = createRoomService({
            client: {
                deleteRoom: harness.deleteRoom,
            } as never,
        });

        const agentConfigResolver = createAgentConfigResolverService({
            agentStore: harness.agentStore as never,
        });

        const transcriptService = createTranscriptService({
            store: harness.transcriptStore as never,
        });

        const sessionService = createSessionService({
            store: sessionStore,
            tokenService,
            agentService,
            roomService,
            agentConfigResolver,
            livekitUrl: 'wss://example.livekit.invalid',
        });

        const app = buildApp({
            ...harness,
            createSessionRouter,
            sessionService,
            transcriptService,
            sessionStore,
            getErrorStatus,
            formatErrorResponse,
        });

        const createRes = await request(app)
            .post('/session')
            .set('x-api-key', 'integration-key')
            .send({
                userIdentity: 'user_1',
                roomName: 'room-int-1',
                agentConfig: {
                    prompt: 'Hello there',
                    tools: ['get_weather'],
                },
            })
            .expect(200);

        expect(createRes.body.userToken).toBe('jwt-user_1');
        expect(createRes.body.roomName).toBe('room-int-1');
        expect(createRes.body.agentDispatched).toBe(true);

        expect(harness.createDispatch).toHaveBeenCalledTimes(1);
        const [_roomName, _agentName, dispatchOptions] = harness.createDispatch.mock.calls[0] as [
            string,
            string,
            { metadata: string },
        ];
        const metadata = JSON.parse(dispatchOptions.metadata) as Record<string, unknown>;
        expect(metadata.user_id).toBe('user_1');
        expect(metadata.session_id).toBe(createRes.body.sessionId);
        expect(metadata.prompt).toBe('Hello there');

        const storedSession = await sessionStore.get('room-int-1');
        expect(storedSession).toMatchObject({
            orgId: ORG_ID,
            createdByUserId: USER_ID,
            userIdentity: 'user_1',
        });

        await request(app)
            .post('/session/end')
            .set('x-api-key', 'integration-key')
            .send({ roomName: 'room-int-1' })
            .expect(204);

        const endedSession = await sessionStore.get('room-int-1');
        expect(endedSession?.endedAt).toBeDefined();

        await request(app)
            .post('/session/observability')
            .send({
                roomName: 'room-int-1',
                sessionId: createRes.body.sessionId,
                closeReason: null,
                sessionReport: {
                    job_id: 'job-1',
                    room_id: 'rid-1',
                    room: 'room-int-1',
                    events: [{ type: 'close', created_at: 1, reason: 'done' }],
                    timestamp: 2,
                },
            })
            .expect(204);

        expect(harness.savedTranscripts).toHaveLength(1);
        expect(harness.savedTranscripts[0]).toMatchObject({
            roomName: 'room-int-1',
            sessionId: createRes.body.sessionId,
            orgId: ORG_ID,
            createdByUserId: USER_ID,
        });
        expect(harness.deleteRoom).toHaveBeenCalledWith('room-int-1');
        expect(await sessionStore.has('room-int-1')).toBe(false);
    });

    it('resolves stored agent config via agentId with org/user scope before dispatch', async () => {
        const harness = createHarness();

        const [
            { createSessionRouter },
            { createSessionService },
            { createTokenService },
            { createAgentService },
            { createRoomService },
            { createAgentConfigResolverService },
            { createTranscriptService },
            { InMemorySessionStore },
            { getErrorStatus, formatErrorResponse },
        ] = await Promise.all([
            import('../dist/routes/session.js'),
            import('../dist/services/sessionService.js'),
            import('../dist/services/tokenService.js'),
            import('../dist/services/agentService.js'),
            import('../dist/services/roomService.js'),
            import('../dist/services/agentConfigResolverService.js'),
            import('../dist/services/transcriptService.js'),
            import('../dist/lib/storage.js'),
            import('../dist/lib/httpErrors.js'),
        ]);

        const sessionStore = new InMemorySessionStore();

        const tokenService = createTokenService({
            createAccessToken: ((identity: string) => ({
                addGrant: (_grant: unknown) => undefined,
                toJwt: () => `jwt-${identity}`,
            })) as never,
        });

        const agentService = createAgentService({
            client: {
                createDispatch: harness.createDispatch,
            } as never,
            agentName: 'integration-agent',
        });

        const roomService = createRoomService({
            client: {
                deleteRoom: harness.deleteRoom,
            } as never,
        });

        const agentConfigResolver = createAgentConfigResolverService({
            agentStore: harness.agentStore as never,
        });

        const transcriptService = createTranscriptService({
            store: harness.transcriptStore as never,
        });

        const sessionService = createSessionService({
            store: sessionStore,
            tokenService,
            agentService,
            roomService,
            agentConfigResolver,
            livekitUrl: 'wss://example.livekit.invalid',
        });

        const app = buildApp({
            ...harness,
            createSessionRouter,
            sessionService,
            transcriptService,
            sessionStore,
            getErrorStatus,
            formatErrorResponse,
        });

        await request(app)
            .post('/session')
            .set('x-api-key', 'integration-key')
            .send({
                userIdentity: 'user_1',
                agentId: AGENT_ID,
                agentConfig: {
                    prompt: 'Override prompt',
                },
            })
            .expect(200);

        expect(harness.agentStore.getById).toHaveBeenCalledWith(AGENT_ID, {
            orgId: ORG_ID,
            createdByUserId: USER_ID,
        });

        const dispatchCall = harness.createDispatch.mock.calls[0] as [
            string,
            string,
            { metadata: string },
        ];
        const dispatchOptions = dispatchCall[2];
        const metadata = JSON.parse(dispatchOptions.metadata) as Record<string, unknown>;

        expect(metadata.prompt).toBe('Override prompt');
        expect(metadata.agentId).toBe(AGENT_ID);
        expect(metadata.tools).toEqual(['get_weather']);
    });
});
