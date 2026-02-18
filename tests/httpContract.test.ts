import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { importFreshApp } from './testUtils';

describe('backend HTTP contract', () => {
    it('GET / returns API metadata and endpoints (telephony disabled)', async () => {
        const app = await importFreshApp({
            env: { TELEPHONY_ENABLED: 'false' },
        });

        const res = await request(app).get('/').expect(200);

        expect(res.body.name).toBe('LiveKit Backend API');
        expect(res.body.version).toBe('1.0.0');
        expect(res.body.endpoints).toMatchObject({
            health: 'GET /health',
            createSession: 'POST /session',
            endSession: 'POST /session/end',
            agents: 'GET /agents',
            sessionTraces: 'GET /api/traces/session/:sessionId',
            sessionTraceById: 'GET /api/traces/session/:sessionId/:traceId',
        });
        expect(res.body.endpoints.telephonyWebhook).toBeUndefined();
    });

    it('GET / includes telephony webhook endpoint when enabled', async () => {
        const app = await importFreshApp({
            env: { TELEPHONY_ENABLED: 'true' },
        });

        const res = await request(app).get('/').expect(200);
        expect(res.body.endpoints.telephonyWebhook).toBe('POST /telephony/livekit-webhook');
    });

    it('GET /health returns ok + timestamp + uptime', async () => {
        const app = await importFreshApp();
        const res = await request(app).get('/health').expect(200);

        expect(res.body.status).toBe('ok');
        expect(typeof res.body.timestamp).toBe('string');
        expect(typeof res.body.uptime).toBe('number');
    });

    it('GET /config/tools returns the tool registry', async () => {
        const app = await importFreshApp();
        const res = await request(app).get('/config/tools').expect(200);

        const ids = (res.body.tools as Array<{ id: string }>).map((t) => t.id);
        expect(ids).toEqual(
            expect.arrayContaining([
                'get_weather',
                'search_wikipedia',
                'add_note',
                'list_notes',
                'call_sub_agent',
                'search_knowledge_base',
            ])
        );
    });

    it('GET /config/realtime-options includes xAI Grok provider', async () => {
        const app = await importFreshApp();
        const res = await request(app).get('/config/realtime-options').expect(200);

        const providers = res.body.providers as Array<{
            providerId: string;
            displayName: string;
            requiredEnv: string[];
            warning?: string;
            models: Array<{ id: string; name: string; languages?: string[] }>;
            voices: Array<{ id: string; name: string }>;
        }>;

        const xai = providers.find((provider) => provider.providerId === 'xai');
        expect(xai).toBeDefined();
        expect(xai).toMatchObject({
            providerId: 'xai',
            displayName: 'xAI Grok',
            requiredEnv: ['XAI_API_KEY'],
        });
        expect(xai?.models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'grok-voice-agent-latest',
                    name: 'Grok Voice Agent Latest',
                }),
            ])
        );
        expect(xai?.models[0]?.languages).toEqual(expect.arrayContaining(['en']));
        expect(xai?.voices).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'ara', name: 'Ara' }),
            ])
        );
    });

    it('GET unknown route returns JSON 404', async () => {
        const app = await importFreshApp();
        const res = await request(app).get('/nope').expect(404);
        expect(res.body).toEqual({ error: 'Not found', path: '/nope' });
    });

    it('POST /session validates and returns example on 400', async () => {
        const createSession = vi.fn();
        const app = await importFreshApp({ sessionServiceMock: { createSession } });

        const res = await request(app).post('/session').set('x-api-key', 'dev').send({}).expect(400);
        expect(res.body.error).toBeTruthy();
        expect(res.body.issues).toBeTruthy();
        expect(res.body.example?.userIdentity).toBeTruthy();

        expect(createSession).not.toHaveBeenCalled();
    });

    it('POST /session returns the session service response on success', async () => {
        const createSession = vi.fn().mockResolvedValue({
            userToken: 'tok',
            roomName: 'room-123',
            livekitUrl: 'wss://example.livekit.invalid',
            agentDispatched: true,
            agentConfig: { engine: { kind: 'pipeline', stt: 's', llm: 'l', tts: 't' }, tools: [] },
        });
        const app = await importFreshApp({ sessionServiceMock: { createSession } });

        const res = await request(app)
            .post('/session')
            .set('x-api-key', 'dev')
            .send({ userIdentity: 'user_1', roomName: 'room-123' })
            .expect(200);

        expect(res.body).toMatchObject({
            userToken: 'tok',
            roomName: 'room-123',
            agentDispatched: true,
        });
        expect(createSession).toHaveBeenCalledTimes(1);
    });

    it('POST /session/end validates and returns 204 on success', async () => {
        const endSession = vi.fn().mockResolvedValue(undefined);
        const app = await importFreshApp({ sessionServiceMock: { endSession } });

        await request(app)
            .post('/session/end')
            .set('x-api-key', 'dev')
            .send({ roomName: 'room-123' })
            .expect(204);
        expect(endSession).toHaveBeenCalledWith({
            roomName: 'room-123',
            auth: {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'mem_test_user',
                isAdmin: true,
            },
        });
    });
});
