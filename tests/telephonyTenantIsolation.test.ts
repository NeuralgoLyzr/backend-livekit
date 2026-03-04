import type { Express } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { setRequiredEnv } from './testUtils';

type IntegrationRecord = {
    id: string;
    orgId: string;
    provider: 'telnyx';
    name: string | null;
    status: 'active' | 'disabled';
    apiKeyFingerprint: string;
    providerResources: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

type BindingRecord = {
    id: string;
    orgId: string;
    integrationId: string;
    provider: 'telnyx';
    providerNumberId: string;
    e164: string;
    agentId: string | null;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

function toStoredIntegration(record: IntegrationRecord) {
    return {
        id: record.id,
        orgId: record.orgId,
        provider: record.provider,
        name: record.name,
        status: record.status,
        apiKeyFingerprint: record.apiKeyFingerprint,
        providerResources: record.providerResources,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

function toStoredBinding(record: BindingRecord) {
    return {
        id: record.id,
        orgId: record.orgId,
        integrationId: record.integrationId,
        provider: record.provider,
        providerNumberId: record.providerNumberId,
        e164: record.e164,
        agentId: record.agentId,
        enabled: record.enabled,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

async function buildTenantHarness(): Promise<{
    app: Express;
    listByProvider: ReturnType<typeof vi.fn>;
    listBindings: ReturnType<typeof vi.fn>;
}> {
    vi.resetModules();
    setRequiredEnv({
        TELEPHONY_ENABLED: 'true',
        APP_ENV: 'production',
    });

    const { HttpError } = await import('../src/lib/httpErrors.js');

    let integrationCounter = 0;
    let bindingCounter = 0;
    const integrations: IntegrationRecord[] = [];
    const bindings: BindingRecord[] = [];

    const listByProvider = vi.fn(async (provider: 'telnyx', scope: { orgId: string }) => {
        return integrations
            .filter(
                (integration) =>
                    integration.provider === provider &&
                    integration.orgId === scope.orgId &&
                    integration.status === 'active'
            )
            .map(toStoredIntegration);
    });

    const listBindings = vi.fn(async (scope: { orgId: string }) => {
        return bindings
            .filter((binding) => binding.orgId === scope.orgId && binding.enabled)
            .map(toStoredBinding);
    });

    const telnyxOnboarding = {
        verifyApiKey: vi.fn(async () => ({ valid: true as const })),
        createIntegration: vi.fn(
            async (input: { apiKey: string; name?: string }, scope: { orgId: string }) => {
                const now = new Date().toISOString();
                integrationCounter += 1;
                const created: IntegrationRecord = {
                    id: `int_${integrationCounter}`,
                    orgId: scope.orgId,
                    provider: 'telnyx',
                    name: input.name ?? null,
                    status: 'active',
                    apiKeyFingerprint: `fp_${integrationCounter}`,
                    providerResources: {},
                    createdAt: now,
                    updatedAt: now,
                };
                integrations.push(created);
                return toStoredIntegration(created);
            }
        ),
        listNumbers: vi.fn(async (integrationId: string, scope: { orgId: string }) => {
            const integration = integrations.find(
                (candidate) => candidate.id === integrationId && candidate.orgId === scope.orgId
            );
            if (!integration) {
                throw new HttpError(404, `Integration ${integrationId} not found`);
            }
            return [
                {
                    id: 'pn_1',
                    phone_number: '+15551234567',
                    status: 'active',
                    connection_id: null,
                    connection_name: null,
                },
            ];
        }),
        connectNumber: vi.fn(
            async (
                integrationId: string,
                input: { providerNumberId: string; e164: string; agentId?: string },
                scope: { orgId: string }
            ) => {
                const integration = integrations.find(
                    (candidate) => candidate.id === integrationId && candidate.orgId === scope.orgId
                );
                if (!integration) {
                    throw new HttpError(404, `Integration ${integrationId} not found`);
                }

                bindingCounter += 1;
                const now = new Date().toISOString();
                const created: BindingRecord = {
                    id: `bind_${bindingCounter}`,
                    orgId: scope.orgId,
                    integrationId: integration.id,
                    provider: 'telnyx',
                    providerNumberId: input.providerNumberId,
                    e164: input.e164,
                    agentId: input.agentId ?? null,
                    enabled: true,
                    createdAt: now,
                    updatedAt: now,
                };
                bindings.push(created);
                return toStoredBinding(created);
            }
        ),
        disconnectNumber: vi.fn(async (bindingId: string, scope: { orgId: string }) => {
            const index = bindings.findIndex(
                (candidate) => candidate.id === bindingId && candidate.orgId === scope.orgId
            );
            if (index === -1) {
                throw new HttpError(404, `Binding ${bindingId} not found`);
            }
            bindings.splice(index, 1);
        }),
        deleteIntegration: vi.fn(async (integrationId: string, scope: { orgId: string }) => {
            const index = integrations.findIndex(
                (candidate) => candidate.id === integrationId && candidate.orgId === scope.orgId
            );
            if (index === -1) {
                throw new HttpError(404, `Integration ${integrationId} not found`);
            }

            const ownedBindingIds = new Set(
                bindings
                    .filter(
                        (binding) =>
                            binding.integrationId === integrationId && binding.orgId === scope.orgId
                    )
                    .map((binding) => binding.id)
            );
            const deletedBindings = ownedBindingIds.size;

            for (let i = bindings.length - 1; i >= 0; i -= 1) {
                if (ownedBindingIds.has(bindings[i].id)) {
                    bindings.splice(i, 1);
                }
            }

            integrations.splice(index, 1);
            return { deletedBindings };
        }),
        debugInspectNumber: vi.fn(),
        debugSetTransportProtocol: vi.fn(),
    };

    const resolveAuthContext = vi.fn(async (apiKey: string) => {
        if (apiKey === 'key-org-a') {
            return {
                orgId: ORG_A,
                userId: 'user-a',
                role: 'owner',
                isAdmin: true,
            };
        }
        if (apiKey === 'key-org-b') {
            return {
                orgId: ORG_B,
                userId: 'user-b',
                role: 'owner',
                isAdmin: true,
            };
        }
        throw new HttpError(401, 'Invalid x-api-key');
    });

    vi.doMock('../src/composition.ts', () => ({
        services: {
            sessionService: {
                createSession: vi.fn(),
                endSession: vi.fn(),
                cleanupSession: vi.fn().mockResolvedValue({
                    roomDelete: { status: 'deleted' },
                    storeDelete: { status: 'ok' },
                }),
            },
            ttsVoicesService: {
                listProviders: vi.fn().mockReturnValue({ providers: [] }),
                listVoices: vi.fn().mockResolvedValue({ voices: [] }),
            },
            ttsVoicePreviewService: {
                fetchPreview: vi.fn().mockResolvedValue({
                    contentType: 'audio/mpeg',
                    body: Buffer.from(''),
                }),
            },
            pagosAuthService: { resolveAuthContext },
            transcriptService: {
                saveFromObservability: vi.fn(),
                getBySessionId: vi.fn(),
                listByAgentId: vi.fn(),
                getAgentStats: vi.fn(),
                list: vi.fn(),
            },
            sessionTraceService: {
                listBySession: vi.fn(),
                getBySessionAndTraceId: vi.fn(),
            },
            audioStorageService: {
                save: vi.fn(),
                get: vi.fn(),
            },
            sessionStore: {
                get: vi.fn(),
                set: vi.fn(),
                has: vi.fn(),
                delete: vi.fn(),
                entries: vi.fn().mockReturnValue([]),
            },
            agentRegistryService: {
                listAgents: vi.fn().mockResolvedValue([]),
                getAgent: vi.fn().mockResolvedValue(null),
                listAgentVersions: vi.fn().mockResolvedValue([]),
                createAgent: vi.fn(),
                updateAgent: vi.fn(),
                activateAgentVersion: vi.fn(),
                deleteAgent: vi.fn(),
                listAgentShares: vi.fn(),
                shareAgent: vi.fn(),
                unshareAgent: vi.fn(),
            },
            correctionService: {
                list: vi.fn().mockResolvedValue([]),
                create: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
            },
        },
    }));

    vi.doMock('../src/telephony/telephonyModule.js', () => ({
        telephonyModule: {
            store: {
                listCalls: vi.fn(async () => []),
                getCallById: vi.fn(async () => null),
                getCallByRoomName: vi.fn(async () => null),
            },
            routing: {},
            agentDispatch: {},
            webhookVerifier: {
                verifyAndDecode: vi.fn(async () => ({})),
            },
            sessionService: {
                handleLiveKitEvent: vi.fn(async () => ({
                    firstSeen: true,
                    ignoredReason: null,
                    dispatchAttempted: false,
                    dispatchSucceeded: false,
                    callId: null,
                })),
            },
            integrationStore: {
                listByProvider,
            },
            bindingStore: {
                listBindings,
            },
            telnyxOnboarding,
            twilioOnboarding: null,
            plivoOnboarding: null,
        },
    }));

    const { app } = await import('../src/app.ts');
    return { app, listByProvider, listBindings };
}

describe('telephony tenant isolation (HTTP)', () => {
    it('isolates integration listings by auth org scope', async () => {
        const { app, listByProvider } = await buildTenantHarness();

        const created = await request(app)
            .post('/v1/telephony/providers/telnyx/credentials')
            .set('x-api-key', 'key-org-a')
            .send({ apiKey: 'telnyx-key-a', name: 'Org A Integration' })
            .expect(200);

        const integrationId = created.body.integrationId as string;
        expect(integrationId).toBeTruthy();

        const orgAList = await request(app)
            .get('/v1/telephony/providers/telnyx/integrations')
            .set('x-api-key', 'key-org-a')
            .expect(200);
        expect(orgAList.body.integrations).toHaveLength(1);
        expect(orgAList.body.integrations[0].id).toBe(integrationId);

        const orgBList = await request(app)
            .get('/v1/telephony/providers/telnyx/integrations')
            .set('x-api-key', 'key-org-b')
            .expect(200);
        expect(orgBList.body.integrations).toEqual([]);

        expect(listByProvider).toHaveBeenCalledWith('telnyx', { orgId: ORG_A });
        expect(listByProvider).toHaveBeenCalledWith('telnyx', { orgId: ORG_B });
    });

    it('blocks cross-org delete/disconnect while preserving owner visibility', async () => {
        const { app, listBindings } = await buildTenantHarness();

        const created = await request(app)
            .post('/v1/telephony/providers/telnyx/credentials')
            .set('x-api-key', 'key-org-a')
            .send({ apiKey: 'telnyx-key-a', name: 'Org A Integration' })
            .expect(200);
        const integrationId = created.body.integrationId as string;

        const connected = await request(app)
            .post(`/v1/telephony/providers/telnyx/numbers/pn_1/connect?integrationId=${integrationId}`)
            .set('x-api-key', 'key-org-a')
            .send({ e164: '+15551234567' })
            .expect(200);
        const bindingId = connected.body.id as string;
        expect(bindingId).toBeTruthy();

        await request(app)
            .delete(`/v1/telephony/providers/telnyx/integrations/${integrationId}`)
            .set('x-api-key', 'key-org-b')
            .expect(404);

        await request(app)
            .delete(`/v1/telephony/providers/telnyx/bindings/${bindingId}`)
            .set('x-api-key', 'key-org-b')
            .expect(404);

        const ownerBindings = await request(app)
            .get('/v1/telephony/bindings')
            .set('x-api-key', 'key-org-a')
            .expect(200);
        expect(ownerBindings.body.bindings).toHaveLength(1);
        expect(ownerBindings.body.bindings[0].id).toBe(bindingId);

        const otherOrgBindings = await request(app)
            .get('/v1/telephony/bindings')
            .set('x-api-key', 'key-org-b')
            .expect(200);
        expect(otherOrgBindings.body.bindings).toEqual([]);

        expect(listBindings).toHaveBeenCalledWith({ orgId: ORG_A });
        expect(listBindings).toHaveBeenCalledWith({ orgId: ORG_B });
    });
});
