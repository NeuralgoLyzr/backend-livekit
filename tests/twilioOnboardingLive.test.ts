/**
 * End-to-end live integration tests for TwilioOnboardingService.
 *
 * Exercises the full onboarding flow against real Twilio APIs:
 *   createIntegration → listNumbers → connectNumber → disconnectNumber → deleteIntegration
 *
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_TEST_PHONE_NUMBER (e164) in the environment.
 * Uses in-memory stores and a stubbed LiveKit provisioning port.
 *
 * Run with: pnpm test:twilio-onboarding-live
 */

import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';

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
import { TwilioOnboardingService } from '../dist/telephony/management/twilioOnboardingService.js';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TEST_PHONE_NUMBER = process.env.TWILIO_TEST_PHONE_NUMBER || '';
const ENCRYPTION_KEY = randomBytes(32);
const SIP_HOST = 'test-e2e.sip.example.com';

// ── In-memory stores ──────────────────────────────────────────────────────

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

describe.skipIf(!ACCOUNT_SID || !AUTH_TOKEN || !TEST_PHONE_NUMBER)(
    'TwilioOnboardingService E2E (live)',
    () => {
        let integrationStore: TelephonyIntegrationStorePort;
        let bindingStore: TelephonyBindingStorePort;
        let livekitProvisioning: ReturnType<typeof createMockLivekitProvisioning>;
        let service: TwilioOnboardingService;

        beforeEach(() => {
            integrationStore = createInMemoryIntegrationStore();
            bindingStore = createInMemoryBindingStore();
            livekitProvisioning = createMockLivekitProvisioning();
            service = new TwilioOnboardingService({
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
                    accountSid: ACCOUNT_SID,
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
                        accountSid: ACCOUNT_SID,
                        authToken: 'invalid_token_12345',
                    })
                ).rejects.toThrow();
            },
            { timeout: 30_000 }
        );

        it(
            'full lifecycle: createIntegration → listNumbers → connectNumber → disconnectNumber → deleteIntegration',
            async () => {
                // 1. Create integration
                const integration = await service.createIntegration({
                    accountSid: ACCOUNT_SID,
                    authToken: AUTH_TOKEN,
                    name: `e2e-test-${Date.now()}`,
                });
                expect(integration.id).toBeTruthy();
                expect(integration.provider).toBe('twilio');
                expect(integration.status).toBe('active');

                try {
                    // 2. List numbers
                    const numbers = await service.listNumbers(integration.id);
                    expect(Array.isArray(numbers)).toBe(true);
                    expect(numbers.length).toBeGreaterThan(0);

                    // Find the test phone number
                    const testNumber = numbers.find(
                        (n) =>
                            n.phoneNumber.replaceAll(/\s/g, '') ===
                            TEST_PHONE_NUMBER.replaceAll(/\s/g, '')
                    );
                    expect(testNumber).toBeDefined();

                    // 3. Connect number
                    const binding = await service.connectNumber(integration.id, {
                        providerNumberId: testNumber!.sid,
                        e164: testNumber!.phoneNumber,
                        agentId: 'test-agent-e2e',
                    });
                    expect(binding.id).toBeTruthy();
                    expect(binding.provider).toBe('twilio');
                    expect(binding.agentId).toBe('test-agent-e2e');
                    expect(binding.enabled).toBe(true);
                    expect(livekitProvisioning.ensureInboundSetupForDid).toHaveBeenCalledOnce();

                    // 4. Disconnect number
                    await service.disconnectNumber(binding.id);
                    expect(livekitProvisioning.removeInboundSetupForDid).toHaveBeenCalledOnce();

                    // Verify binding is removed from store
                    const deletedBinding = await bindingStore.getBindingById(binding.id);
                    expect(deletedBinding).toBeNull();

                    // 5. Delete integration (cleans up Twilio trunk)
                    const deleteResult = await service.deleteIntegration(integration.id);
                    expect(deleteResult.deletedBindings).toBe(0); // already disconnected
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
                // 1. Create integration
                const integration = await service.createIntegration({
                    accountSid: ACCOUNT_SID,
                    authToken: AUTH_TOKEN,
                    name: `e2e-cascade-${Date.now()}`,
                });

                try {
                    // 2. Connect a number (leave it connected)
                    const numbers = await service.listNumbers(integration.id);
                    const testNumber = numbers.find(
                        (n) =>
                            n.phoneNumber.replaceAll(/\s/g, '') ===
                            TEST_PHONE_NUMBER.replaceAll(/\s/g, '')
                    );
                    expect(testNumber).toBeDefined();

                    await service.connectNumber(integration.id, {
                        providerNumberId: testNumber!.sid,
                        e164: testNumber!.phoneNumber,
                    });

                    // 3. Delete integration – should auto-disconnect the number
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
