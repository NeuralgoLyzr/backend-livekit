import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';

import type {
    TelephonyIntegrationStorePort,
    StoredIntegration,
    CreateIntegrationInput,
} from '../dist/telephony/ports/telephonyIntegrationStorePort.js';
import type {
    TelephonyBindingStorePort,
    StoredBinding,
    UpsertBindingInput,
} from '../dist/telephony/ports/telephonyBindingStorePort.js';

vi.mock('../dist/telephony/adapters/telnyx/telnyxClient.js', () => {
    const MockTelnyxClient = vi.fn();
    MockTelnyxClient.prototype.verifyCredentials = vi.fn();
    MockTelnyxClient.prototype.listPhoneNumbers = vi.fn();
    MockTelnyxClient.prototype.listFqdnConnections = vi.fn();
    MockTelnyxClient.prototype.createFqdnConnection = vi.fn();
    MockTelnyxClient.prototype.listFqdns = vi.fn();
    MockTelnyxClient.prototype.createFqdn = vi.fn();
    MockTelnyxClient.prototype.assignPhoneNumberToConnection = vi.fn();

    return {
        TelnyxClient: MockTelnyxClient,
        isTelnyxClientError: vi.fn().mockReturnValue(false),
    };
});

import { TelnyxOnboardingService } from '../dist/telephony/management/telnyxOnboardingService.js';
import { TelnyxClient } from '../dist/telephony/adapters/telnyx/telnyxClient.js';

const ENCRYPTION_KEY = randomBytes(32);
const SIP_HOST = 'sip.livekit.cloud';

function setupDefaultClientMocks() {
    (TelnyxClient.prototype.verifyCredentials as ReturnType<typeof vi.fn>).mockResolvedValue({
        valid: true,
    });
    (TelnyxClient.prototype.listPhoneNumbers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (TelnyxClient.prototype.listFqdnConnections as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (TelnyxClient.prototype.createFqdnConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'conn_1',
        connection_name: 'livekit-inbound-int_1',
    });
    (TelnyxClient.prototype.listFqdns as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (TelnyxClient.prototype.createFqdn as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'fqdn_1',
        fqdn: SIP_HOST,
        connection_id: 'conn_1',
    });
    (
        TelnyxClient.prototype.assignPhoneNumberToConnection as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
}

function makeIntegration(
    overrides?: Partial<StoredIntegration & { encryptedApiKey: string }>
): StoredIntegration & { encryptedApiKey: string } {
    return {
        id: 'int_1',
        provider: 'telnyx',
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
        provider: 'telnyx',
        providerNumberId: 'pn_1',
        e164: '+15551234567',
        agentId: null,
        agentConfig: null,
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
        disable: vi.fn(async () => true),
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
            agentConfig: input.agentConfig ?? null,
        })),
        getBindingByE164: vi.fn(async () => binding),
        getBindingById: vi.fn(async () => binding),
        listBindings: vi.fn(async () => [binding]),
        disableBinding: vi.fn(async () => true),
    };
}

function createService(overrides?: {
    integrationStore?: TelephonyIntegrationStorePort;
    bindingStore?: TelephonyBindingStorePort;
}) {
    return new TelnyxOnboardingService({
        integrationStore: overrides?.integrationStore ?? stubIntegrationStore(),
        bindingStore: overrides?.bindingStore ?? stubBindingStore(),
        encryptionKey: ENCRYPTION_KEY,
        livekitSipHost: SIP_HOST,
    });
}

describe('TelnyxOnboardingService', () => {
    beforeEach(() => {
        setupDefaultClientMocks();
    });

    // ── verifyApiKey ──────────────────────────────────────────────────

    it('verifyApiKey delegates to TelnyxClient.verifyCredentials', async () => {
        const service = createService();
        const result = await service.verifyApiKey('key_test');

        expect(result).toEqual({ valid: true });
        expect(TelnyxClient).toHaveBeenCalledWith('key_test');
        expect(TelnyxClient.prototype.verifyCredentials).toHaveBeenCalledOnce();
    });

    // ── createIntegration ─────────────────────────────────────────────

    it('createIntegration encrypts key, stores, and sets up trunk', async () => {
        const integrationStore = stubIntegrationStore();
        const service = createService({ integrationStore });

        const result = await service.createIntegration({ apiKey: 'key_test', name: 'My Telnyx' });

        expect(result.provider).toBe('telnyx');
        expect(result.name).toBe('My Telnyx');
        expect(integrationStore.create).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'telnyx',
                name: 'My Telnyx',
                encryptedApiKey: expect.stringContaining('v1.'),
                apiKeyFingerprint: expect.any(String),
            })
        );
        expect(TelnyxClient.prototype.listFqdnConnections).toHaveBeenCalled();
        expect(integrationStore.updateProviderResources).toHaveBeenCalledWith(
            'int_1',
            expect.objectContaining({
                fqdnConnectionId: 'conn_1',
                fqdnId: 'fqdn_1',
            })
        );
    });

    // ── listNumbers ───────────────────────────────────────────────────

    it('listNumbers decrypts key and calls client', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString('key_list_test', ENCRYPTION_KEY);

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({ encryptedApiKey: encrypted })
        );

        const mockNumbers = [
            {
                id: 'pn_1',
                phone_number: '+15551234567',
                status: 'active',
                connection_id: null,
                connection_name: null,
            },
        ];
        (TelnyxClient.prototype.listPhoneNumbers as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockNumbers
        );

        const service = createService({ integrationStore });
        const numbers = await service.listNumbers('int_1');

        expect(numbers).toEqual(mockNumbers);
        expect(TelnyxClient.prototype.listPhoneNumbers).toHaveBeenCalledOnce();
    });

    // ── connectNumber ─────────────────────────────────────────────────

    it('connectNumber assigns number and creates binding', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString('key_connect_test', ENCRYPTION_KEY);

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { fqdnConnectionId: 'conn_existing' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        const result = await service.connectNumber('int_1', {
            providerNumberId: 'pn_1',
            e164: '+15551234567',
        });

        expect(
            TelnyxClient.prototype.assignPhoneNumberToConnection
        ).toHaveBeenCalledWith('pn_1', 'conn_existing');
        expect(bindingStore.upsertBinding).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'int_1',
                provider: 'telnyx',
                providerNumberId: 'pn_1',
                e164: '+15551234567',
            })
        );
        expect(result.e164).toBe('+15551234567');
    });

    // ── disconnectNumber ──────────────────────────────────────────────

    it('disconnectNumber disables binding', async () => {
        const bindingStore = stubBindingStore();
        const service = createService({ bindingStore });

        await service.disconnectNumber('bind_1');

        expect(bindingStore.disableBinding).toHaveBeenCalledWith('bind_1');
    });
});
