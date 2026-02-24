import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { importFreshApp } from './testUtils';

describe('agents routes (HTTP)', () => {
    it('GET /agents forwards auth context and pagination to listAgents', async () => {
        const listAgents = vi.fn().mockResolvedValue([]);
        const app = await importFreshApp({
            sessionServiceMock: {},
            agentRegistryServiceMock: { listAgents },
            pagosAuthServiceMock: {
                resolveAuthContext: vi.fn().mockResolvedValue({
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    userId: 'member_user_1',
                    role: 'member',
                    isAdmin: false,
                }),
            },
        });

        await request(app).get('/agents?limit=10&offset=5').set('x-api-key', 'dev').expect(200);

        expect(listAgents).toHaveBeenCalledWith(
            {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'member_user_1',
                role: 'member',
                isAdmin: false,
            },
            {
                limit: 10,
                offset: 5,
            }
        );
    });

    it('POST /agents forwards auth context to createAgent', async () => {
        const createAgent = vi.fn().mockResolvedValue({
            id: '507f1f77bcf86cd799439011',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            config: { agent_name: 'A', tools: [] },
        });

        const app = await importFreshApp({
            sessionServiceMock: {},
            agentRegistryServiceMock: { createAgent },
            pagosAuthServiceMock: {
                resolveAuthContext: vi.fn().mockResolvedValue({
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    userId: 'admin_user_1',
                    role: 'owner',
                    isAdmin: true,
                }),
            },
        });

        await request(app)
            .post('/agents')
            .set('x-api-key', 'dev')
            .send({ config: { agent_name: 'A', tools: [] } })
            .expect(201);

        expect(createAgent).toHaveBeenCalledWith(
            {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'admin_user_1',
                role: 'owner',
                isAdmin: true,
            },
            {
                config: { agent_name: 'A', tools: [] },
            }
        );
    });

    it('GET /agents/:agentId/versions forwards auth context to listAgentVersions', async () => {
        const listAgentVersions = vi.fn().mockResolvedValue([
            {
                versionId: '6ca631d2-7f1f-4dbd-9b66-d3c0ecae0136',
                active: true,
                config: { agent_name: 'A', tools: [] },
                createdAt: '2026-02-19T00:00:00.000Z',
            },
        ]);
        const app = await importFreshApp({
            sessionServiceMock: {},
            agentRegistryServiceMock: { listAgentVersions },
            pagosAuthServiceMock: {
                resolveAuthContext: vi.fn().mockResolvedValue({
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    userId: 'member_user_1',
                    role: 'member',
                    isAdmin: false,
                }),
            },
        });

        const response = await request(app)
            .get('/agents/507f1f77bcf86cd799439011/versions')
            .set('x-api-key', 'dev')
            .expect(200);

        expect(response.body).toEqual({
            agent_id: '507f1f77bcf86cd799439011',
            versions: [
                {
                    version_id: '6ca631d2-7f1f-4dbd-9b66-d3c0ecae0136',
                    active: true,
                    config: { agent_name: 'A', tools: [] },
                    created_at: '2026-02-19T00:00:00.000Z',
                },
            ],
        });

        expect(listAgentVersions).toHaveBeenCalledWith(
            {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'member_user_1',
                role: 'member',
                isAdmin: false,
            },
            '507f1f77bcf86cd799439011'
        );
    });

    it('POST /agents/:agentId/versions/:versionId/activate forwards auth context', async () => {
        const activateAgentVersion = vi.fn().mockResolvedValue({
            id: '507f1f77bcf86cd799439011',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            config: { agent_name: 'Activated', tools: [] },
        });
        const app = await importFreshApp({
            sessionServiceMock: {},
            agentRegistryServiceMock: { activateAgentVersion },
            pagosAuthServiceMock: {
                resolveAuthContext: vi.fn().mockResolvedValue({
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    userId: 'admin_user_1',
                    role: 'owner',
                    isAdmin: true,
                }),
            },
        });

        await request(app)
            .post(
                '/agents/507f1f77bcf86cd799439011/versions/6ca631d2-7f1f-4dbd-9b66-d3c0ecae0136/activate'
            )
            .set('x-api-key', 'dev')
            .expect(200);

        expect(activateAgentVersion).toHaveBeenCalledWith(
            {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'admin_user_1',
                role: 'owner',
                isAdmin: true,
            },
            '507f1f77bcf86cd799439011',
            '6ca631d2-7f1f-4dbd-9b66-d3c0ecae0136'
        );
    });

    it('GET /agents/:agentId/shares forwards auth context and returns user_ids', async () => {
        const listAgentShares = vi.fn().mockResolvedValue(['user_1', 'user_2']);
        const app = await importFreshApp({
            sessionServiceMock: {},
            agentRegistryServiceMock: { listAgentShares },
            pagosAuthServiceMock: {
                resolveAuthContext: vi.fn().mockResolvedValue({
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    userId: 'member_user_1',
                    role: 'member',
                    isAdmin: false,
                }),
            },
        });

        const response = await request(app)
            .get('/agents/507f1f77bcf86cd799439011/shares')
            .set('x-api-key', 'dev')
            .expect(200);

        expect(response.body).toEqual({
            agent_id: '507f1f77bcf86cd799439011',
            user_ids: ['user_1', 'user_2'],
        });
        expect(listAgentShares).toHaveBeenCalledWith(
            {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'member_user_1',
                role: 'member',
                isAdmin: false,
            },
            '507f1f77bcf86cd799439011'
        );
    });

    it('POST /agents/:agentId/share forwards payload and bearer token', async () => {
        const shareAgent = vi.fn().mockResolvedValue({ message: 'shared' });
        const app = await importFreshApp({
            sessionServiceMock: {},
            agentRegistryServiceMock: { shareAgent },
            pagosAuthServiceMock: {
                resolveAuthContext: vi.fn().mockResolvedValue({
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    userId: 'owner_user_1',
                    role: 'owner',
                    isAdmin: true,
                }),
            },
        });

        await request(app)
            .post('/agents/507f1f77bcf86cd799439011/share')
            .set('x-api-key', 'dev')
            .set('Authorization', 'Bearer token-abc')
            .send({ email_ids: ['a@example.com'], admin_user_id: 'admin_123' })
            .expect(200);

        expect(shareAgent).toHaveBeenCalledWith(
            {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'owner_user_1',
                role: 'owner',
                isAdmin: true,
            },
            '507f1f77bcf86cd799439011',
            {
                emailIds: ['a@example.com'],
                adminUserId: 'admin_123',
                bearerToken: 'token-abc',
            }
        );
    });

    it('POST /agents/:agentId/unshare forwards payload and bearer token', async () => {
        const unshareAgent = vi.fn().mockResolvedValue({ message: 'unshared' });
        const app = await importFreshApp({
            sessionServiceMock: {},
            agentRegistryServiceMock: { unshareAgent },
            pagosAuthServiceMock: {
                resolveAuthContext: vi.fn().mockResolvedValue({
                    orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                    userId: 'owner_user_1',
                    role: 'owner',
                    isAdmin: true,
                }),
            },
        });

        await request(app)
            .post('/agents/507f1f77bcf86cd799439011/unshare')
            .set('x-api-key', 'dev')
            .set('Authorization', 'Bearer token-xyz')
            .send({ email_ids: ['a@example.com'] })
            .expect(200);

        expect(unshareAgent).toHaveBeenCalledWith(
            {
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'owner_user_1',
                role: 'owner',
                isAdmin: true,
            },
            '507f1f77bcf86cd799439011',
            {
                emailIds: ['a@example.com'],
                adminUserId: undefined,
                bearerToken: 'token-xyz',
            }
        );
    });
});
