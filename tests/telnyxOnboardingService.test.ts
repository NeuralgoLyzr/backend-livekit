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
    MockTelnyxClient.prototype.getPhoneNumber = vi.fn();
    MockTelnyxClient.prototype.listFqdnConnections = vi.fn();
    MockTelnyxClient.prototype.createFqdnConnection = vi.fn();
    MockTelnyxClient.prototype.getFqdnConnection = vi.fn();
    MockTelnyxClient.prototype.updateFqdnConnectionTransport = vi.fn();
    MockTelnyxClient.prototype.listFqdns = vi.fn();
    MockTelnyxClient.prototype.createFqdn = vi.fn();
    MockTelnyxClient.prototype.assignPhoneNumberToConnection = vi.fn();
    MockTelnyxClient.prototype.unassignPhoneNumberFromConnection = vi.fn();
    MockTelnyxClient.prototype.deleteFqdn = vi.fn();
    MockTelnyxClient.prototype.deleteFqdnConnection = vi.fn();

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
    (TelnyxClient.prototype.getPhoneNumber as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pn_1',
        phone_number: '+15551234567',
        status: 'active',
        connection_id: null,
        connection_name: null,
    });
    (TelnyxClient.prototype.listFqdnConnections as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (TelnyxClient.prototype.createFqdnConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'conn_1',
        connection_name: 'livekit-inbound-int_1',
    });
    (TelnyxClient.prototype.getFqdnConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'conn_1',
        connection_name: 'livekit-inbound-int_1',
        transport_protocol: 'TCP',
        encrypted_media: null,
    });
    (
        TelnyxClient.prototype.updateFqdnConnectionTransport as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    (TelnyxClient.prototype.listFqdns as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (TelnyxClient.prototype.createFqdn as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'fqdn_1',
        fqdn: SIP_HOST,
        connection_id: 'conn_1',
    });
    (
        TelnyxClient.prototype.assignPhoneNumberToConnection as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    (
        TelnyxClient.prototype.unassignPhoneNumberFromConnection as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    (TelnyxClient.prototype.deleteFqdn as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (TelnyxClient.prototype.deleteFqdnConnection as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined
    );
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
    return new TelnyxOnboardingService({
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

    it('connectNumber rejects when requested e164 does not match provider number', async () => {
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

        await expect(
            service.connectNumber('int_1', {
                providerNumberId: 'pn_1',
                e164: '+15559999999',
            })
        ).rejects.toMatchObject({
            status: 422,
        });
        expect(bindingStore.upsertBinding).not.toHaveBeenCalled();
    });

    it('connectNumber stores the provided agentId on the binding', async () => {
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

        await service.connectNumber('int_1', {
            providerNumberId: 'pn_1',
            e164: '+15551234567',
            agentId: 'agent-1',
        });

        expect(bindingStore.upsertBinding).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'int_1',
                provider: 'telnyx',
                providerNumberId: 'pn_1',
                e164: '+15551234567',
                agentId: 'agent-1',
            })
        );
    });

    // ── disconnectNumber ──────────────────────────────────────────────

    it('disconnectNumber deprovisions and deletes binding', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString('key_disconnect_test', ENCRYPTION_KEY);

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { fqdnConnectionId: 'conn_1', fqdnId: 'fqdn_1' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });
        await service.disconnectNumber('bind_1');

        expect(TelnyxClient.prototype.unassignPhoneNumberFromConnection).toHaveBeenCalledWith(
            'pn_1'
        );
        expect(bindingStore.deleteBinding).toHaveBeenCalledWith('bind_1');
    });

    it('disconnectNumber calls removeInboundSetupForDid before unassigning from provider', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString('key_order_test', ENCRYPTION_KEY);

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { fqdnConnectionId: 'conn_1', fqdnId: 'fqdn_1' },
            })
        );

        const bindingStore = stubBindingStore();
        const livekitProvisioning = {
            ensureInboundSetupForDid: vi.fn(),
            removeInboundSetupForDid: vi.fn().mockResolvedValue({
                normalizedDid: '+15551234567',
                inboundTrunkId: 'trunk_1',
                trunkDeleted: false,
                dispatchRuleUpdated: false,
                dispatchRuleDeleted: false,
            }),
        };

        const service = new TelnyxOnboardingService({
            integrationStore,
            bindingStore,
            encryptionKey: ENCRYPTION_KEY,
            livekitSipHost: SIP_HOST,
            livekitProvisioning,
        });

        const callOrder: string[] = [];
        livekitProvisioning.removeInboundSetupForDid.mockImplementation(async () => {
            callOrder.push('removeInboundSetupForDid');
            return {
                normalizedDid: '+15551234567',
                inboundTrunkId: 'trunk_1',
                trunkDeleted: false,
                dispatchRuleUpdated: false,
                dispatchRuleDeleted: false,
            };
        });
        (
            TelnyxClient.prototype.unassignPhoneNumberFromConnection as ReturnType<typeof vi.fn>
        ).mockImplementation(async () => {
            callOrder.push('unassignPhoneNumberFromConnection');
        });

        await service.disconnectNumber('bind_1');

        expect(livekitProvisioning.removeInboundSetupForDid).toHaveBeenCalledWith('+15551234567');
        expect(TelnyxClient.prototype.unassignPhoneNumberFromConnection).toHaveBeenCalledWith(
            'pn_1'
        );
        expect(bindingStore.deleteBinding).toHaveBeenCalledWith('bind_1');
        expect(callOrder).toEqual(['removeInboundSetupForDid', 'unassignPhoneNumberFromConnection']);
    });

    it('disconnectNumber does not delete binding when unassign fails', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString('key_unassign_fail', ENCRYPTION_KEY);

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { fqdnConnectionId: 'conn_1', fqdnId: 'fqdn_1' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        (
            TelnyxClient.prototype.unassignPhoneNumberFromConnection as ReturnType<typeof vi.fn>
        ).mockRejectedValue(new Error('provider unavailable'));

        await expect(service.disconnectNumber('bind_1')).rejects.toThrow();
        expect(bindingStore.deleteBinding).not.toHaveBeenCalled();
    });

    it('disconnectNumber does not delete binding when removeInboundSetupForDid fails', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString('key_lk_fail', ENCRYPTION_KEY);

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { fqdnConnectionId: 'conn_1', fqdnId: 'fqdn_1' },
            })
        );

        const bindingStore = stubBindingStore();
        const livekitProvisioning = {
            ensureInboundSetupForDid: vi.fn(),
            removeInboundSetupForDid: vi
                .fn()
                .mockRejectedValue(new Error('LiveKit provisioning failed')),
        };

        const service = new TelnyxOnboardingService({
            integrationStore,
            bindingStore,
            encryptionKey: ENCRYPTION_KEY,
            livekitSipHost: SIP_HOST,
            livekitProvisioning,
        });

        await expect(service.disconnectNumber('bind_1')).rejects.toThrow();
        expect(TelnyxClient.prototype.unassignPhoneNumberFromConnection).not.toHaveBeenCalled();
        expect(bindingStore.deleteBinding).not.toHaveBeenCalled();
    });

    it('disconnectNumber throws 404 for non-existent binding', async () => {
        const bindingStore = stubBindingStore();
        (bindingStore.getBindingById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const service = createService({ bindingStore });

        await expect(service.disconnectNumber('bind_missing')).rejects.toMatchObject({
            status: 404,
        });
    });

    it('disconnectNumber throws 400 for wrong-provider binding', async () => {
        const bindingStore = stubBindingStore();
        (bindingStore.getBindingById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeBinding({ provider: 'twilio' })
        );

        const service = createService({ bindingStore });

        await expect(service.disconnectNumber('bind_1')).rejects.toMatchObject({
            status: 400,
        });
    });

    it('deleteIntegration cascades number disconnects then deletes integration', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString('key_delete_test', ENCRYPTION_KEY);

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { fqdnConnectionId: 'conn_1', fqdnId: 'fqdn_1' },
            })
        );

        const bindingStore = stubBindingStore();
        const service = createService({ integrationStore, bindingStore });

        const result = await service.deleteIntegration('int_1');
        expect(result).toEqual({ deletedBindings: 1 });
        expect(bindingStore.deleteBinding).toHaveBeenCalledWith('bind_1');
        expect(TelnyxClient.prototype.deleteFqdn).toHaveBeenCalledWith('fqdn_1');
        expect(TelnyxClient.prototype.deleteFqdnConnection).toHaveBeenCalledWith('conn_1');
        expect(integrationStore.deleteById).toHaveBeenCalledWith('int_1');
    });

    it('deleteIntegration calls removeInboundSetupForDid for each binding', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString('key_cascade_test', ENCRYPTION_KEY);

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { fqdnConnectionId: 'conn_1', fqdnId: 'fqdn_1' },
            })
        );

        const binding1 = makeBinding({ id: 'bind_1', e164: '+15551111111', providerNumberId: 'pn_1' });
        const binding2 = makeBinding({ id: 'bind_2', e164: '+15552222222', providerNumberId: 'pn_2' });
        const bindingStore = stubBindingStore();
        (bindingStore.listBindingsByIntegrationId as ReturnType<typeof vi.fn>).mockResolvedValue([
            binding1,
            binding2,
        ]);

        const livekitProvisioning = {
            ensureInboundSetupForDid: vi.fn(),
            removeInboundSetupForDid: vi.fn().mockResolvedValue({
                normalizedDid: '+15551111111',
                inboundTrunkId: 'trunk_1',
                trunkDeleted: false,
                dispatchRuleUpdated: false,
                dispatchRuleDeleted: false,
            }),
        };

        const service = new TelnyxOnboardingService({
            integrationStore,
            bindingStore,
            encryptionKey: ENCRYPTION_KEY,
            livekitSipHost: SIP_HOST,
            livekitProvisioning,
        });

        const result = await service.deleteIntegration('int_1');
        expect(result).toEqual({ deletedBindings: 2 });
        expect(livekitProvisioning.removeInboundSetupForDid).toHaveBeenCalledTimes(2);
        expect(livekitProvisioning.removeInboundSetupForDid).toHaveBeenCalledWith('+15551111111');
        expect(livekitProvisioning.removeInboundSetupForDid).toHaveBeenCalledWith('+15552222222');
        expect(TelnyxClient.prototype.unassignPhoneNumberFromConnection).toHaveBeenCalledTimes(2);
        expect(bindingStore.deleteBinding).toHaveBeenCalledTimes(2);
    });

    it('deleteIntegration skips non-telnyx bindings in cascade', async () => {
        const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
        const encrypted = encryptString('key_skip_test', ENCRYPTION_KEY);

        const integrationStore = stubIntegrationStore();
        (integrationStore.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
            makeIntegration({
                encryptedApiKey: encrypted,
                providerResources: { fqdnConnectionId: 'conn_1', fqdnId: 'fqdn_1' },
            })
        );

        const telnyxBinding = makeBinding({ id: 'bind_1', provider: 'telnyx' });
        const twilioBinding = makeBinding({ id: 'bind_2', provider: 'twilio' });
        const bindingStore = stubBindingStore();
        (bindingStore.listBindingsByIntegrationId as ReturnType<typeof vi.fn>).mockResolvedValue([
            telnyxBinding,
            twilioBinding,
        ]);

        const service = createService({ integrationStore, bindingStore });

        const result = await service.deleteIntegration('int_1');
        // Should report 2 total bindings but only disconnect the telnyx one
        expect(result).toEqual({ deletedBindings: 2 });
        expect(TelnyxClient.prototype.unassignPhoneNumberFromConnection).toHaveBeenCalledTimes(1);
        expect(bindingStore.deleteBinding).toHaveBeenCalledTimes(1);
        expect(bindingStore.deleteBinding).toHaveBeenCalledWith('bind_1');
    });
});
