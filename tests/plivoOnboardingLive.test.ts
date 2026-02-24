/**
 * End-to-end live integration tests for PlivoOnboardingService.
 *
 * Exercises the full onboarding flow against real Plivo APIs:
 *   createIntegration → listNumbers → connectNumber → disconnectNumber → deleteIntegration
 *
 * Requires PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, and PLIVO_TEST_PHONE_NUMBER (e164) in the environment.
 * Uses in-memory stores and a stubbed LiveKit provisioning port.
 *
 * Run with: pnpm test:plivo-onboarding-live
 */

import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    CreateIntegrationInput,
    StoredIntegration,
    TelephonyIntegrationStorePort,
    TelephonyProvider,
} from '../dist/telephony/ports/telephonyIntegrationStorePort.js';
import type {
    StoredBinding,
    TelephonyBindingStorePort,
    UpsertBindingInput,
} from '../dist/telephony/ports/telephonyBindingStorePort.js';
import type { LiveKitTelephonyProvisioningPort } from '../dist/telephony/management/livekitTelephonyProvisioningService.js';
import { PlivoOnboardingService } from '../dist/telephony/management/plivoOnboardingService.js';

const AUTH_ID = process.env.PLIVO_AUTH_ID || '';
const AUTH_TOKEN = process.env.PLIVO_AUTH_TOKEN || '';
const TEST_PHONE_NUMBER = process.env.PLIVO_TEST_PHONE_NUMBER || '';
const ENCRYPTION_KEY = randomBytes(32);
const SIP_HOST = process.env.LIVEKIT_SIP_HOST || 'sip.livekit.cloud';

function normalizeNumberForComparison(input: string): string {
    return input.replaceAll(/\D/g, '');
}

function createInMemoryIntegrationStore(): TelephonyIntegrationStorePort {
    const store = new Map<string, StoredIntegration & { encryptedApiKey: string }>();

    return {
        async create(input: CreateIntegrationInput): Promise<StoredIntegration> {
            const id = randomUUID();
            const now = new Date().toISOString();
            const record = {
                id,
                provider: input.provider,
                name: input.name ?? null,
                encryptedApiKey: input.encryptedApiKey,
                apiKeyFingerprint: input.apiKeyFingerprint,
                status: 'active' as const,
                providerResources: {},
                createdAt: now,
                updatedAt: now,
            };
            store.set(id, record);
            const { encryptedApiKey: _, ...stored } = record;
            return stored;
        },
        async getById(id: string) {
            return store.get(id) ?? null;
        },
        async updateProviderResources(id: string, resources: Record<string, unknown>) {
            const existing = store.get(id);
            if (!existing) return null;
            const updated = { ...existing, providerResources: resources, updatedAt: new Date().toISOString() };
            store.set(id, updated);
            const { encryptedApiKey: _, ...stored } = updated;
            return stored;
        },
        async deleteById(id: string) {
            return store.delete(id);
        },
        async listByProvider(provider: TelephonyProvider) {
            return [...store.values()]
                .filter((r) => r.provider === provider)
                .map(({ encryptedApiKey: _, ...stored }) => stored);
        },
    };
}

function createInMemoryBindingStore(): TelephonyBindingStorePort {
    const store = new Map<string, StoredBinding>();

    return {
        async upsertBinding(input: UpsertBindingInput): Promise<StoredBinding> {
            const existing = [...store.values()].find((b) => b.e164 === input.e164);
            const id = existing?.id ?? randomUUID();
            const now = new Date().toISOString();
            const record: StoredBinding = {
                id,
                integrationId: input.integrationId,
                provider: input.provider,
                providerNumberId: input.providerNumberId,
                e164: input.e164,
                agentId: input.agentId ?? null,
                enabled: true,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
            };
            store.set(id, record);
            return record;
        },
        async getBindingByE164(e164: string) {
            return [...store.values()].find((b) => b.e164 === e164 && b.enabled) ?? null;
        },
        async getBindingById(id: string) {
            return store.get(id) ?? null;
        },
        async listBindings() {
            return [...store.values()];
        },
        async listBindingsByIntegrationId(integrationId: string) {
            return [...store.values()].filter((b) => b.integrationId === integrationId);
        },
        async deleteBinding(id: string) {
            return store.delete(id);
        },
    };
}

function createMockLivekitProvisioning(): LiveKitTelephonyProvisioningPort & {
    ensureInboundSetupForDid: ReturnType<typeof vi.fn>;
    removeInboundSetupForDid: ReturnType<typeof vi.fn>;
} {
    return {
        ensureInboundSetupForDid: vi.fn().mockImplementation(async (e164: string) => ({
            normalizedDid: e164,
            inboundTrunkId: `mock-trunk-${Date.now()}`,
            dispatchRuleId: `mock-rule-${Date.now()}`,
        })),
        removeInboundSetupForDid: vi.fn().mockImplementation(async (e164: string) => ({
            normalizedDid: e164,
            inboundTrunkId: `mock-trunk-${Date.now()}`,
            trunkDeleted: false,
            dispatchRuleUpdated: false,
            dispatchRuleDeleted: false,
        })),
    };
}

describe.skipIf(!AUTH_ID || !AUTH_TOKEN || !TEST_PHONE_NUMBER)(
    'PlivoOnboardingService E2E (live)',
    () => {
        let integrationStore: TelephonyIntegrationStorePort;
        let bindingStore: TelephonyBindingStorePort;
        let livekitProvisioning: ReturnType<typeof createMockLivekitProvisioning>;
        let service: PlivoOnboardingService;

        beforeEach(() => {
            integrationStore = createInMemoryIntegrationStore();
            bindingStore = createInMemoryBindingStore();
            livekitProvisioning = createMockLivekitProvisioning();
            service = new PlivoOnboardingService({
                integrationStore,
                bindingStore,
                encryptionKey: ENCRYPTION_KEY,
                livekitSipHost: SIP_HOST,
                livekitProvisioning,
            });
        });

        it(
            'verifyCredentials succeeds with valid credentials',
            async () => {
                const result = await service.verifyCredentials({
                    authId: AUTH_ID,
                    authToken: AUTH_TOKEN,
                });
                expect(result).toEqual({ valid: true });
            },
            { timeout: 30_000 }
        );

        it(
            'verifyCredentials rejects invalid credentials',
            async () => {
                await expect(
                    service.verifyCredentials({
                        authId: AUTH_ID,
                        authToken: 'invalid_token_12345',
                    })
                ).rejects.toThrow();
            },
            { timeout: 30_000 }
        );

        it(
            'full lifecycle: createIntegration → listNumbers → connectNumber → disconnectNumber → deleteIntegration',
            async () => {
                const integration = await service.createIntegration({
                    authId: AUTH_ID,
                    authToken: AUTH_TOKEN,
                    name: `e2e-test-${Date.now()}`,
                });
                expect(integration.id).toBeTruthy();
                expect(integration.provider).toBe('plivo');
                expect(integration.status).toBe('active');

                try {
                    const numbers = await service.listNumbers(integration.id);
                    expect(Array.isArray(numbers)).toBe(true);
                    expect(numbers.length).toBeGreaterThan(0);

                    const normalizedTarget = normalizeNumberForComparison(TEST_PHONE_NUMBER);
                    const testNumber = numbers.find(
                        (n) => normalizeNumberForComparison(n.number) === normalizedTarget
                    );
                    expect(testNumber).toBeDefined();

                    const binding = await service.connectNumber(integration.id, {
                        providerNumberId: testNumber!.number,
                        e164: testNumber!.number,
                        agentId: 'test-agent-e2e',
                    });
                    expect(binding.id).toBeTruthy();
                    expect(binding.provider).toBe('plivo');
                    expect(binding.agentId).toBe('test-agent-e2e');
                    expect(binding.enabled).toBe(true);
                    expect(livekitProvisioning.ensureInboundSetupForDid).toHaveBeenCalledOnce();

                    await service.disconnectNumber(binding.id);
                    expect(livekitProvisioning.removeInboundSetupForDid).toHaveBeenCalledOnce();

                    const deletedBinding = await bindingStore.getBindingById(binding.id);
                    expect(deletedBinding).toBeNull();

                    const deleteResult = await service.deleteIntegration(integration.id);
                    expect(deleteResult.deletedBindings).toBe(0);
                } catch (err) {
                    await service.deleteIntegration(integration.id).catch(() => {});
                    throw err;
                }
            },
            { timeout: 120_000 }
        );

        it(
            'deleteIntegration cascades: auto-disconnects bound numbers',
            async () => {
                const integration = await service.createIntegration({
                    authId: AUTH_ID,
                    authToken: AUTH_TOKEN,
                    name: `e2e-cascade-${Date.now()}`,
                });

                try {
                    const numbers = await service.listNumbers(integration.id);
                    const normalizedTarget = normalizeNumberForComparison(TEST_PHONE_NUMBER);
                    const testNumber = numbers.find(
                        (n) => normalizeNumberForComparison(n.number) === normalizedTarget
                    );
                    expect(testNumber).toBeDefined();

                    await service.connectNumber(integration.id, {
                        providerNumberId: testNumber!.number,
                        e164: testNumber!.number,
                    });

                    const deleteResult = await service.deleteIntegration(integration.id);
                    expect(deleteResult.deletedBindings).toBe(1);
                    expect(livekitProvisioning.removeInboundSetupForDid).toHaveBeenCalled();
                } catch (err) {
                    await service.deleteIntegration(integration.id).catch(() => {});
                    throw err;
                }
            },
            { timeout: 120_000 }
        );
    }
);
