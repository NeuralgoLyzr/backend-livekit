import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

import type {
    CreateIntegrationInput,
    StoredIntegration,
    TelephonyIntegrationStorePort,
} from '../src/telephony/ports/telephonyIntegrationStorePort.js';
import type {
    StoredBinding,
    TelephonyBindingStorePort,
    UpsertBindingInput,
} from '../src/telephony/ports/telephonyBindingStorePort.js';

vi.mock('../src/telephony/adapters/plivo/plivoClient.js', () => {
    const MockPlivoClient = vi.fn();
    MockPlivoClient.prototype.verifyCredentials = vi.fn();
    MockPlivoClient.prototype.listPhoneNumbers = vi.fn();
    MockPlivoClient.prototype.getPhoneNumber = vi.fn();
    MockPlivoClient.prototype.setNumberAppId = vi.fn();
    MockPlivoClient.prototype.listInboundTrunks = vi.fn();
    MockPlivoClient.prototype.createInboundTrunk = vi.fn();
    MockPlivoClient.prototype.deleteInboundTrunk = vi.fn();
    MockPlivoClient.prototype.listOriginationUris = vi.fn();
    MockPlivoClient.prototype.createOriginationUri = vi.fn();
    MockPlivoClient.prototype.deleteOriginationUri = vi.fn();

    return {
        PlivoClient: MockPlivoClient,
        isPlivoClientError: vi.fn().mockReturnValue(false),
    };
});

import { PlivoOnboardingService } from '../src/telephony/management/plivoOnboardingService.js';
import { PlivoClient } from '../src/telephony/adapters/plivo/plivoClient.js';

const ENCRYPTION_KEY = randomBytes(32);
const SIP_HOST = 'sip.livekit.cloud';

function setupDefaultClientMocks() {
    (PlivoClient.prototype.verifyCredentials as ReturnType<typeof vi.fn>).mockResolvedValue({
        valid: true,
    });
    (PlivoClient.prototype.listPhoneNumbers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (PlivoClient.prototype.getPhoneNumber as ReturnType<typeof vi.fn>).mockResolvedValue({
        number: '+15551234567',
        alias: 'Main',
        appId: null,
    });
    (PlivoClient.prototype.setNumberAppId as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (PlivoClient.prototype.listInboundTrunks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (PlivoClient.prototype.createInboundTrunk as ReturnType<typeof vi.fn>).mockResolvedValue({
        trunkId: 'TRUNK_1',
        primaryUriId: 'ORI_1',
    });
    (PlivoClient.prototype.deleteInboundTrunk as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (PlivoClient.prototype.listOriginationUris as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (PlivoClient.prototype.createOriginationUri as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ORI_1',
    });
    (
        PlivoClient.prototype.deleteOriginationUri as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
}

function makeIntegration(
    overrides?: Partial<StoredIntegration & { encryptedApiKey: string }>
): StoredIntegration & { encryptedApiKey: string } {
    return {
        id: 'int_1',
        provider: 'plivo',
        name: 'Test',
        apiKeyFingerprint: 'fp_abc',
        status: 'active',
        providerResources: {},
        encryptedApiKey: 'v1.encrypted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

function makeBinding(overrides?: Partial<StoredBinding>): StoredBinding {
    return {
        id: 'bind_1',
        integrationId: 'int_1',
        provider: 'plivo',
        providerNumberId: '+15551234567',
        e164: '+15551234567',
        agentId: null,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

function stubIntegrationStore(): TelephonyIntegrationStorePort {
    const stored = makeIntegration();
    return {
        create: vi.fn(async (input: CreateIntegrationInput) => ({
            ...stored,
            provider: input.provider,
            name: input.name ?? null,
            apiKeyFingerprint: input.apiKeyFingerprint,
        })),
        getById: vi.fn(async () => stored),
        updateProviderResources: vi.fn(async (_id: string, resources: Record<string, unknown>) => ({
            ...stored,
            providerResources: resources,
        })),
        deleteById: vi.fn(async () => true),
        listByProvider: vi.fn(async () => [stored]),
    };
}

function stubBindingStore(): TelephonyBindingStorePort {
    const binding = makeBinding();
    return {
        upsertBinding: vi.fn(async (input: UpsertBindingInput) => ({
            ...binding,
            ...input,
            agentId: input.agentId ?? null,
        })),
        getBindingByE164: vi.fn(async () => binding),
        getBindingById: vi.fn(async () => binding),
        listBindings: vi.fn(async () => [binding]),
        listBindingsByIntegrationId: vi.fn(async () => [binding]),
        deleteBinding: vi.fn(async () => true),
    };
}

function createService(overrides?: {
    integrationStore?: TelephonyIntegrationStorePort;
    bindingStore?: TelephonyBindingStorePort;
}) {
    return new PlivoOnboardingService({
        integrationStore: overrides?.integrationStore ?? stubIntegrationStore(),
        bindingStore: overrides?.bindingStore ?? stubBindingStore(),
        encryptionKey: ENCRYPTION_KEY,
        livekitSipHost: SIP_HOST,
        livekitProvisioning: {
            ensureInboundSetupForDid: vi.fn().mockResolvedValue({
                normalizedDid: '+15551234567',
                inboundTrunkId: 'trunk_1',
                dispatchRuleId: 'rule_1',
            }),
            removeInboundSetupForDid: vi.fn().mockResolvedValue({
                normalizedDid: '+15551234567',
                inboundTrunkId: 'trunk_1',
                trunkDeleted: false,
                dispatchRuleUpdated: false,
                dispatchRuleDeleted: false,
            }),
        },
    });
}

describe('PlivoOnboardingService', () => {
    beforeEach(() => {
        setupDefaultClientMocks();
    });

    it('verifyCredentials delegates to PlivoClient.verifyCredentials', async () => {
        const service = createService();

        const result = await service.verifyCredentials({
            authId: 'MAUTH123',
            authToken: 'secret',
        });

        expect(result).toEqual({ valid: true });
        expect(PlivoClient).toHaveBeenCalledWith({
            authId: 'MAUTH123',
            authToken: 'secret',
        });
        expect(PlivoClient.prototype.verifyCredentials).toHaveBeenCalledOnce();
    });

    it('createIntegration encrypts credentials, stores integration, and sets up trunk + origination uri', async () => {
        const integrationStore = stubIntegrationStore();
        const service = createService({ integrationStore });

        const result = await service.createIntegration({
            authId: 'MAUTH123',
            authToken: 'secret',
            name: 'My Plivo',
        });

        expect(result.provider).toBe('plivo');
        expect(result.name).toBe('My Plivo');

        expect(integrationStore.create).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'plivo',
                name: 'My Plivo',
                encryptedApiKey: expect.stringContaining('v1.'),
                apiKeyFingerprint: expect.any(String),
            })
        );

        expect(PlivoClient.prototype.listOriginationUris).toHaveBeenCalledWith();
        expect(PlivoClient.prototype.createOriginationUri).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'LiveKit SIP Host',
                uri: SIP_HOST,
            })
        );
        expect(PlivoClient.prototype.listInboundTrunks).toHaveBeenCalledOnce();
        expect(PlivoClient.prototype.createInboundTrunk).toHaveBeenCalledWith(
            'livekit-inbound-int_1',
            'ORI_1'
        );

        expect(integrationStore.updateProviderResources).toHaveBeenCalledWith(
            'int_1',
            expect.objectContaining({
                trunkId: 'TRUNK_1',
                originationUriId: 'ORI_1',
            })
        );
    });

    it('listNumbers decrypts credentials and calls client', async () => {
        const { encryptString } = await import('../src/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({
                authId: 'MAUTH123',
                authToken: 'secret',
            }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({ encryptedApiKey: encrypted })
        );

        const mockNumbers = [{ number: '+15551234567', alias: 'Main', appId: null }];
        (PlivoClient.prototype.listPhoneNumbers as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockNumbers
        );

        const service = createService({ integrationStore });
        const numbers = await service.listNumbers('int_1');

        expect(numbers).toEqual(mockNumbers);
        expect(PlivoClient.prototype.listPhoneNumbers).toHaveBeenCalledOnce();
    });

    it('connectNumber sets app_id to trunk and upserts binding', async () => {
        const { encryptString } = await import('../src/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({
                authId: 'MAUTH123',
                authToken: 'secret',
            }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { trunkId: 'TRUNK_EXISTING' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        const result = await service.connectNumber('int_1', {
            providerNumberId: '+15551234567',
            e164: '+15551234567',
            agentId: 'agent-1',
        });

        expect(PlivoClient.prototype.setNumberAppId).toHaveBeenCalledWith(
            '+15551234567',
            'TRUNK_EXISTING'
        );
        expect(bindingStore.upsertBinding).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'int_1',
                provider: 'plivo',
                providerNumberId: '+15551234567',
                e164: '+15551234567',
                agentId: 'agent-1',
            })
        );
        expect(result.e164).toBe('+15551234567');
    });

    it('connectNumber rejects when requested e164 does not match provider number', async () => {
        const { encryptString } = await import('../src/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({
                authId: 'MAUTH123',
                authToken: 'secret',
            }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { trunkId: 'TRUNK_EXISTING' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        await expect(
            service.connectNumber('int_1', {
                providerNumberId: '+15551234567',
                e164: '+15559999999',
            })
        ).rejects.toMatchObject({ status: 422 });
        expect(bindingStore.upsertBinding).not.toHaveBeenCalled();
    });

    it('disconnectNumber deprovisions, clears app_id, and deletes binding', async () => {
        const { encryptString } = await import('../src/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({
                authId: 'MAUTH123',
                authToken: 'secret',
            }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { trunkId: 'TRUNK_1', originationUriId: 'ORI_1' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        await service.disconnectNumber('bind_1');

        expect(PlivoClient.prototype.setNumberAppId).toHaveBeenCalledWith('+15551234567', null);
        expect(bindingStore.deleteBinding).toHaveBeenCalledWith('bind_1');
    });

    it('deleteIntegration cascades number disconnects and deletes provider resources', async () => {
        const { encryptString } = await import('../src/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({ authId: 'MAUTH123', authToken: 'secret' }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { trunkId: 'TRUNK_1', originationUriId: 'ORI_1' },
            })
        );

        const bindingStore = stubBindingStore();
        (bindingStore.listBindingsByIntegrationId as ReturnType<typeof vi.fn>).mockResolvedValue([
            makeBinding({ id: 'bind_1' }),
            makeBinding({ id: 'bind_2', providerNumberId: '+15552222222', e164: '+15552222222' }),
        ]);

        const service = createService({ integrationStore, bindingStore });

        const result = await service.deleteIntegration('int_1');

        expect(result).toEqual({ deletedBindings: 2 });
        expect(PlivoClient.prototype.deleteOriginationUri).toHaveBeenCalledWith('ORI_1');
        expect(PlivoClient.prototype.deleteInboundTrunk).toHaveBeenCalledWith('TRUNK_1');
        expect(integrationStore.deleteById).toHaveBeenCalledWith('int_1');
    });

    it('listNumbers throws 409 when stored credentials cannot be decrypted', async () => {
        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({ encryptedApiKey: 'v1.badpayload' })
        );

        const service = createService({ integrationStore });

        await expect(service.listNumbers('int_1')).rejects.toMatchObject({ status: 409 });
    });
});
