import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

import type {
    CreateIntegrationInput,
    StoredIntegration,
    TelephonyIntegrationStorePort,
} from '../dist/telephony/ports/telephonyIntegrationStorePort.js';
import type {
    StoredBinding,
    TelephonyBindingStorePort,
    UpsertBindingInput,
} from '../dist/telephony/ports/telephonyBindingStorePort.js';

vi.mock('../dist/telephony/adapters/twilio/twilioClient.js', () => {
    const MockTwilioClient = vi.fn();
    MockTwilioClient.prototype.verifyCredentials = vi.fn();
    MockTwilioClient.prototype.listIncomingPhoneNumbers = vi.fn();
    MockTwilioClient.prototype.getIncomingPhoneNumber = vi.fn();
    MockTwilioClient.prototype.listTrunks = vi.fn();
    MockTwilioClient.prototype.createTrunk = vi.fn();
    MockTwilioClient.prototype.listOriginationUrls = vi.fn();
    MockTwilioClient.prototype.createOriginationUrl = vi.fn();
    MockTwilioClient.prototype.listTrunkPhoneNumbers = vi.fn();
    MockTwilioClient.prototype.attachPhoneNumberToTrunk = vi.fn();
    MockTwilioClient.prototype.detachPhoneNumberFromTrunk = vi.fn();
    MockTwilioClient.prototype.deleteTrunk = vi.fn();

    return {
        TwilioClient: MockTwilioClient,
        isTwilioClientError: vi.fn().mockReturnValue(false),
    };
});

import { TwilioOnboardingService } from '../dist/telephony/management/twilioOnboardingService.js';
import { TwilioClient } from '../dist/telephony/adapters/twilio/twilioClient.js';

const ENCRYPTION_KEY = randomBytes(32);
const SIP_HOST = 'sip.livekit.cloud';

function setupDefaultClientMocks() {
    (TwilioClient.prototype.verifyCredentials as ReturnType<typeof vi.fn>).mockResolvedValue({
        valid: true,
    });
    (TwilioClient.prototype.listIncomingPhoneNumbers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (TwilioClient.prototype.getIncomingPhoneNumber as ReturnType<typeof vi.fn>).mockResolvedValue({
        sid: 'PN_1',
        phoneNumber: '+15551234567',
        friendlyName: 'n1',
    });
    (TwilioClient.prototype.listTrunks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (TwilioClient.prototype.createTrunk as ReturnType<typeof vi.fn>).mockResolvedValue({ sid: 'TRUNK_1' });
    (TwilioClient.prototype.listOriginationUrls as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (TwilioClient.prototype.createOriginationUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
        sid: 'ORIG_1',
    });
    (TwilioClient.prototype.attachPhoneNumberToTrunk as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined
    );
    (TwilioClient.prototype.detachPhoneNumberFromTrunk as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined
    );
    (TwilioClient.prototype.deleteTrunk as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
}

function makeIntegration(
    overrides?: Partial<StoredIntegration & { encryptedApiKey: string }>
): StoredIntegration & { encryptedApiKey: string } {
    return {
        id: 'int_1',
        provider: 'twilio',
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
        provider: 'twilio',
        providerNumberId: 'PN_1',
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
    return new TwilioOnboardingService({
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

describe('TwilioOnboardingService', () => {
    beforeEach(() => {
        setupDefaultClientMocks();
    });

    it('verifyCredentials delegates to TwilioClient.verifyCredentials', async () => {
        const service = createService();

        const result = await service.verifyCredentials({
            accountSid: 'AC123',
            authToken: 'secret',
        });

        expect(result).toEqual({ valid: true });
        expect(TwilioClient).toHaveBeenCalledWith({
            accountSid: 'AC123',
            authToken: 'secret',
        });
        expect(TwilioClient.prototype.verifyCredentials).toHaveBeenCalledOnce();
    });

    it('createIntegration encrypts credentials, stores integration, and sets up trunk + origination url', async () => {
        const integrationStore = stubIntegrationStore();
        const service = createService({ integrationStore });

        const result = await service.createIntegration({
            accountSid: 'AC123',
            authToken: 'secret',
            name: 'My Twilio',
        });

        expect(result.provider).toBe('twilio');
        expect(result.name).toBe('My Twilio');

        expect(integrationStore.create).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'twilio',
                name: 'My Twilio',
                encryptedApiKey: expect.stringContaining('v1.'),
                apiKeyFingerprint: expect.any(String),
            })
        );

        expect(TwilioClient.prototype.listTrunks).toHaveBeenCalledOnce();
        expect(TwilioClient.prototype.createTrunk).toHaveBeenCalledWith(
            expect.objectContaining({
                friendlyName: 'livekit-inbound-int_1',
                domainName: 'livekit-inbound-int_1.pstn.twilio.com',
            })
        );

        expect(TwilioClient.prototype.listOriginationUrls).toHaveBeenCalledWith('TRUNK_1');
        expect(TwilioClient.prototype.createOriginationUrl).toHaveBeenCalledWith(
            'TRUNK_1',
            expect.objectContaining({
                sipUrl: `sip:${SIP_HOST}`,
                enabled: true,
            })
        );

        expect(integrationStore.updateProviderResources).toHaveBeenCalledWith(
            'int_1',
            expect.objectContaining({
                trunkSid: 'TRUNK_1',
                originationUrlSid: 'ORIG_1',
            })
        );
    });

    it('listNumbers decrypts credentials and calls client', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({
                accountSid: 'AC123',
                authToken: 'secret',
            }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({ encryptedApiKey: encrypted })
        );

        const mockNumbers = [
            { sid: 'PN1', phoneNumber: '+15551234567', friendlyName: 'n1' },
        ];
        (
            TwilioClient.prototype.listIncomingPhoneNumbers as ReturnType<typeof vi.fn>
        ).mockResolvedValue(mockNumbers);

        const service = createService({ integrationStore });
        const numbers = await service.listNumbers('int_1');

        expect(numbers).toEqual(mockNumbers);
        expect(TwilioClient.prototype.listIncomingPhoneNumbers).toHaveBeenCalledOnce();
    });

    it('connectNumber ensures trunk and attaches phone number, then upserts binding', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({
                accountSid: 'AC123',
                authToken: 'secret',
            }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { trunkSid: 'TRUNK_EXISTING' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        const result = await service.connectNumber('int_1', {
            providerNumberId: 'PN_1',
            e164: '+15551234567',
        });

        expect(TwilioClient.prototype.attachPhoneNumberToTrunk).toHaveBeenCalledWith(
            'TRUNK_EXISTING',
            'PN_1'
        );
        expect(bindingStore.upsertBinding).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'int_1',
                provider: 'twilio',
                providerNumberId: 'PN_1',
                e164: '+15551234567',
            })
        );
        expect(result.e164).toBe('+15551234567');
    });

    it('connectNumber rejects when requested e164 does not match provider number', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({
                accountSid: 'AC123',
                authToken: 'secret',
            }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { trunkSid: 'TRUNK_EXISTING' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        await expect(
            service.connectNumber('int_1', {
                providerNumberId: 'PN_1',
                e164: '+15559999999',
            })
        ).rejects.toMatchObject({
            status: 422,
        });
        expect(bindingStore.upsertBinding).not.toHaveBeenCalled();
    });

    it('connectNumber stores the provided agentId on the binding', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({
                accountSid: 'AC123',
                authToken: 'secret',
            }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { trunkSid: 'TRUNK_EXISTING' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        await service.connectNumber('int_1', {
            providerNumberId: 'PN_1',
            e164: '+15551234567',
            agentId: 'agent-1',
        });

        expect(bindingStore.upsertBinding).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'int_1',
                provider: 'twilio',
                providerNumberId: 'PN_1',
                e164: '+15551234567',
                agentId: 'agent-1',
            })
        );
    });

    it('disconnectNumber deprovisions and deletes binding', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({
                accountSid: 'AC123',
                authToken: 'secret',
            }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { trunkSid: 'TRUNK_1' },
            })
        );
        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        await service.disconnectNumber('bind_1');
        expect(TwilioClient.prototype.detachPhoneNumberFromTrunk).toHaveBeenCalledWith(
            'TRUNK_1',
            'PN_1'
        );
        expect(bindingStore.deleteBinding).toHaveBeenCalledWith('bind_1');
    });

    it('deleteIntegration cascades number disconnects then deletes integration', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString(
            JSON.stringify({
                accountSid: 'AC123',
                authToken: 'secret',
            }),
            ENCRYPTION_KEY
        );

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { trunkSid: 'TRUNK_1' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        const result = await service.deleteIntegration('int_1');
        expect(result).toEqual({ deletedBindings: 1 });
        expect(bindingStore.deleteBinding).toHaveBeenCalledWith('bind_1');
        expect(TwilioClient.prototype.deleteTrunk).toHaveBeenCalledWith('TRUNK_1');
        expect(integrationStore.deleteById).toHaveBeenCalledWith('int_1');
    });
});
