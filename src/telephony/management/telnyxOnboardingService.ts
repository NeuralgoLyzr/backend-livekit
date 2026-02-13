import { z } from 'zod';

import {
    TelnyxClient,
    isTelnyxClientError,
    type TelnyxPhoneNumber,
} from '../adapters/telnyx/telnyxClient.js';
import type {
    TelephonyIntegrationStorePort,
    StoredIntegration,
} from '../ports/telephonyIntegrationStorePort.js';
import type {
    TelephonyBindingStorePort,
    StoredBinding,
} from '../ports/telephonyBindingStorePort.js';
import { encryptString, decryptString, fingerprintSecret } from '../../lib/crypto/secretBox.js';
import { HttpError } from '../../lib/httpErrors.js';
import { logger } from '../../lib/logger.js';
import type { LiveKitTelephonyProvisioningPort } from './livekitTelephonyProvisioningService.js';
import { normalizeE164 } from '../core/e164.js';

const TelnyxProviderResourcesSchema = z
    .object({
        fqdnConnectionId: z.string().optional(),
        fqdnId: z.string().optional(),
    })
    .passthrough();

export interface TelnyxOnboardingDeps {
    integrationStore: TelephonyIntegrationStorePort;
    bindingStore: TelephonyBindingStorePort;
    encryptionKey: Buffer;
    livekitSipHost: string;
    livekitProvisioning: LiveKitTelephonyProvisioningPort;
}

const TRUNK_NAME_PREFIX = 'livekit-inbound-';
const DEFAULT_TELNYX_TRANSPORT_PROTOCOL: 'TCP' | 'UDP' | 'TLS' = 'TCP';

export class TelnyxOnboardingService {
    constructor(private readonly deps: TelnyxOnboardingDeps) {}

    async verifyApiKey(apiKey: string): Promise<{ valid: true }> {
        const client = new TelnyxClient(apiKey);
        try {
            return await client.verifyCredentials();
        } catch (err) {
            throw mapTelnyxError(err);
        }
    }

    async createIntegration(input: {
        apiKey: string;
        name?: string;
    }): Promise<StoredIntegration> {
        await this.verifyApiKey(input.apiKey);

        const encrypted = encryptString(input.apiKey, this.deps.encryptionKey);
        const fingerprint = fingerprintSecret(input.apiKey);

        const integration = await this.deps.integrationStore.create({
            provider: 'telnyx',
            name: input.name,
            encryptedApiKey: encrypted,
            apiKeyFingerprint: fingerprint,
        });

        try {
            await this.ensureInboundTrunk(integration.id, input.apiKey);
        } catch (err) {
            logger.warn(
                { event: 'telnyx.trunk_setup_deferred', integrationId: integration.id, err },
                'Trunk setup deferred'
            );
        }

        logger.info(
            { event: 'telnyx.credentials.saved', integrationId: integration.id },
            'Telnyx integration created'
        );
        return integration;
    }

    async listNumbers(integrationId: string): Promise<TelnyxPhoneNumber[]> {
        const apiKey = await this.decryptApiKey(integrationId);
        const client = new TelnyxClient(apiKey);
        try {
            return await client.listPhoneNumbers();
        } catch (err) {
            throw mapTelnyxError(err);
        }
    }

    /**
     * Non-prod debug helper: verify Telnyx number → connection mapping and whether
     * our LiveKit SIP host is attached as an FQDN on that connection.
     */
    async debugInspectNumber(
        integrationId: string,
        providerNumberId: string
    ): Promise<{
        number: TelnyxPhoneNumber;
        expectedConnectionId?: string;
        connection?: {
            id: string;
            connection_name: string;
            transport_protocol?: string;
            encrypted_media?: string | null;
        };
        fqdns?: Array<{ id: string; fqdn: string }>;
        livekitSipHost: string;
        livekitSipHostAttached: boolean;
    }> {
        const integration = await this.getIntegrationOrThrow(integrationId);
        const apiKey = this.decryptApiKeyFromIntegration(integration);
        const client = new TelnyxClient(apiKey);

        const parsed = TelnyxProviderResourcesSchema.safeParse(integration.providerResources);
        const expectedConnectionId =
            parsed.success && parsed.data.fqdnConnectionId ? parsed.data.fqdnConnectionId : undefined;

        try {
            const number = await client.getPhoneNumber(providerNumberId);
            const connectionId = number.connection_id ?? expectedConnectionId ?? null;

            if (!connectionId) {
                return {
                    number,
                    expectedConnectionId,
                    livekitSipHost: this.deps.livekitSipHost,
                    livekitSipHostAttached: false,
                };
            }

            const [connection, fqdns] = await Promise.all([
                client.getFqdnConnection(connectionId),
                client.listFqdns(connectionId),
            ]);

            const sipHostLower = this.deps.livekitSipHost.toLowerCase();
            const livekitSipHostAttached = fqdns.some((f) => f.fqdn.toLowerCase() === sipHostLower);

            return {
                number,
                expectedConnectionId,
                connection,
                fqdns: fqdns.map((f) => ({ id: f.id, fqdn: f.fqdn })),
                livekitSipHost: this.deps.livekitSipHost,
                livekitSipHostAttached,
            };
        } catch (err) {
            throw mapTelnyxError(err);
        }
    }

    async debugSetTransportProtocol(
        integrationId: string,
        connectionId: string,
        transportProtocol: 'UDP' | 'TCP' | 'TLS'
    ): Promise<{
        ok: true;
        connection: {
            id: string;
            connection_name: string;
            transport_protocol?: string;
            encrypted_media?: string | null;
            inbound?: {
                default_primary_fqdn_id?: string | null;
                default_secondary_fqdn_id?: string | null;
                default_tertiary_fqdn_id?: string | null;
            };
        };
    }> {
        const integration = await this.getIntegrationOrThrow(integrationId);
        const apiKey = this.decryptApiKeyFromIntegration(integration);
        const client = new TelnyxClient(apiKey);
        try {
            await client.updateFqdnConnectionTransport(connectionId, transportProtocol);
            const connection = await client.getFqdnConnection(connectionId);
            return { ok: true, connection };
        } catch (err) {
            throw mapTelnyxError(err);
        }
    }

    async connectNumber(
        integrationId: string,
        input: {
            providerNumberId: string;
            e164: string;
            agentId?: string;
        }
    ): Promise<StoredBinding> {
        const integration = await this.getIntegrationOrThrow(integrationId);
        const apiKey = this.decryptApiKeyFromIntegration(integration);
        const client = new TelnyxClient(apiKey);

        const providerNumber = await this.getPhoneNumberOrThrow(client, input.providerNumberId);
        const normalizedDid = this.assertRequestedDidMatchesProviderNumber(
            input.e164,
            providerNumber.phone_number
        );

        // Ensure LiveKit inbound trunk + dispatch rule exist for this DID before connecting provider routing.
        await this.deps.livekitProvisioning.ensureInboundSetupForDid(normalizedDid);

        const parsed = TelnyxProviderResourcesSchema.safeParse(integration.providerResources);
        const connectionId =
            parsed.success && parsed.data.fqdnConnectionId
                ? parsed.data.fqdnConnectionId
                : (await this.ensureInboundTrunkInternal(client, integration.id)).connectionId;

        // Best-effort: keep transport protocol consistent even when reusing cached providerResources.
        await this.ensureTransportProtocol(client, connectionId);

        try {
            await client.assignPhoneNumberToConnection(input.providerNumberId, connectionId);
        } catch (err) {
            throw mapTelnyxError(err);
        }

        const binding = await this.deps.bindingStore.upsertBinding({
            integrationId,
            provider: 'telnyx',
            providerNumberId: input.providerNumberId,
            e164: normalizedDid,
            agentId: input.agentId,
        });

        logger.info(
            { event: 'telnyx.number.connected', integrationId, e164: normalizedDid },
            'Number connected'
        );
        return binding;
    }

    async disconnectNumber(bindingId: string): Promise<void> {
        const binding = await this.getBindingOrThrow(bindingId);
        const integration = await this.getIntegrationOrThrow(binding.integrationId);
        const apiKey = this.decryptApiKeyFromIntegration(integration);
        const client = new TelnyxClient(apiKey);

        await this.disconnectBinding(binding, integration, client);
    }

    async deleteIntegration(integrationId: string): Promise<{ deletedBindings: number }> {
        const integration = await this.getIntegrationOrThrow(integrationId);
        const apiKey = this.decryptApiKeyFromIntegration(integration);
        const client = new TelnyxClient(apiKey);

        const bindings = await this.deps.bindingStore.listBindingsByIntegrationId(integrationId);
        for (const binding of bindings) {
            if (binding.provider !== 'telnyx') continue;
            await this.disconnectBinding(binding, integration, client);
        }

        const resources = parseTelnyxProviderResources(integration.providerResources);
        if (resources?.fqdnId) {
            try {
                await client.deleteFqdn(resources.fqdnId);
            } catch (err) {
                if (!isTelnyxNotFoundError(err)) {
                    throw mapTelnyxError(err);
                }
            }
        }
        if (resources?.fqdnConnectionId) {
            try {
                await client.deleteFqdnConnection(resources.fqdnConnectionId);
            } catch (err) {
                if (!isTelnyxNotFoundError(err)) {
                    throw mapTelnyxError(err);
                }
            }
        }

        const deleted = await this.deps.integrationStore.deleteById(integrationId);
        if (!deleted) {
            throw new HttpError(404, `Integration ${integrationId} not found`);
        }

        logger.info(
            { event: 'telnyx.integration.deleted', integrationId, deletedBindings: bindings.length },
            'Telnyx integration deleted'
        );
        return { deletedBindings: bindings.length };
    }

    // ── private helpers ───────────────────────────────────────────────────

    private async ensureInboundTrunk(integrationId: string, apiKey: string): Promise<void> {
        const client = new TelnyxClient(apiKey);
        await this.ensureInboundTrunkInternal(client, integrationId);
    }

    private async ensureInboundTrunkInternal(
        client: TelnyxClient,
        integrationId: string
    ): Promise<{ connectionId: string }> {
        const trunkName = `${TRUNK_NAME_PREFIX}${integrationId}`;

        try {
            const existingConnections = await client.listFqdnConnections();
            let connection = existingConnections.find((c) => c.connection_name === trunkName);

            if (!connection) {
                try {
                    // LiveKit SIP supports UDP/TCP/TLS; TCP is generally the most reliable for SIP trunking.
                    connection = await client.createFqdnConnection(trunkName, {
                        transportProtocol: DEFAULT_TELNYX_TRANSPORT_PROTOCOL,
                    });
                } catch (err) {
                    if (isTelnyxClientError(err) && err.code === 'VALIDATION_ERROR') {
                        const retryList = await client.listFqdnConnections();
                        connection = retryList.find((c) => c.connection_name === trunkName);
                    }
                    if (!connection) throw err;
                }
            }

            await this.ensureTransportProtocol(client, connection.id, integrationId);

            const existingFqdns = await client.listFqdns(connection.id);
            const sipHostLower = this.deps.livekitSipHost.toLowerCase();
            const alreadyAttached = existingFqdns.some((f) => f.fqdn.toLowerCase() === sipHostLower);

            let fqdnId: string;
            if (!alreadyAttached) {
                try {
                    const created = await client.createFqdn(this.deps.livekitSipHost, connection.id);
                    fqdnId = created.id;
                } catch (err) {
                    if (isTelnyxClientError(err) && err.code === 'VALIDATION_ERROR') {
                        const retryFqdns = await client.listFqdns(connection.id);
                        const existing = retryFqdns.find((f) => f.fqdn.toLowerCase() === sipHostLower);
                        if (existing) {
                            fqdnId = existing.id;
                        } else {
                            throw err;
                        }
                    } else {
                        throw err;
                    }
                }
            } else {
                const existing = existingFqdns.find((f) => f.fqdn.toLowerCase() === sipHostLower);
                if (!existing) {
                    throw new HttpError(502, 'Telnyx trunk is missing expected FQDN attachment');
                }
                fqdnId = existing.id;
            }

            const resources: Record<string, unknown> = {
                fqdnConnectionId: connection.id,
                fqdnId,
            };
            await this.deps.integrationStore.updateProviderResources(integrationId, resources);

            return { connectionId: connection.id };
        } catch (err) {
            // Telnyx SDK errors should be surfaced as actionable HTTP errors (422/401/429/502)
            // instead of getting treated as an unhandled 500 by the Express error middleware.
            if (isTelnyxClientError(err)) {
                throw mapTelnyxError(err);
            }
            throw err;
        }
    }

    private async ensureTransportProtocol(
        client: TelnyxClient,
        connectionId: string,
        integrationIdForLogs?: string
    ): Promise<void> {
        // Some Telnyx accounts / network paths behave better on TCP than UDP.
        // Keep this best-effort to avoid breaking onboarding if Telnyx rejects the update.
        try {
            const details = await client.getFqdnConnection(connectionId);
            if (
                details.transport_protocol &&
                details.transport_protocol !== DEFAULT_TELNYX_TRANSPORT_PROTOCOL
            ) {
                await client.updateFqdnConnectionTransport(
                    connectionId,
                    DEFAULT_TELNYX_TRANSPORT_PROTOCOL
                );
            }
        } catch (err) {
            logger.warn(
                { event: 'telnyx.transport_protocol_update_failed', integrationId: integrationIdForLogs, err },
                'Unable to update Telnyx transport protocol'
            );
        }
    }

    private async decryptApiKey(integrationId: string): Promise<string> {
        const integration = await this.getIntegrationOrThrow(integrationId);
        return this.decryptApiKeyFromIntegration(integration);
    }

    private async getPhoneNumberOrThrow(
        client: TelnyxClient,
        providerNumberId: string
    ): Promise<TelnyxPhoneNumber> {
        try {
            return await client.getPhoneNumber(providerNumberId);
        } catch (err) {
            throw mapTelnyxError(err);
        }
    }

    private assertRequestedDidMatchesProviderNumber(requestedDid: string, providerDid: string): string {
        const normalizedRequested = normalizeE164(requestedDid);
        const normalizedProvider = normalizeE164(providerDid);

        if (normalizedRequested !== normalizedProvider) {
            throw new HttpError(
                422,
                `Requested e164 ${normalizedRequested} does not match provider number ${normalizedProvider}`
            );
        }

        return normalizedProvider;
    }

    private async disconnectBinding(
        binding: StoredBinding,
        integration: StoredIntegration & { encryptedApiKey: string },
        client: TelnyxClient
    ): Promise<void> {
        await this.deps.livekitProvisioning.removeInboundSetupForDid(binding.e164);

        try {
            await client.unassignPhoneNumberFromConnection(binding.providerNumberId);
        } catch (err) {
            throw mapTelnyxError(err);
        }

        const deleted = await this.deps.bindingStore.deleteBinding(binding.id);
        if (!deleted) {
            throw new HttpError(404, `Binding ${binding.id} not found`);
        }

        logger.info(
            {
                event: 'telnyx.number.disconnected',
                bindingId: binding.id,
                integrationId: integration.id,
                e164: binding.e164,
            },
            'Number disconnected'
        );
    }

    private async getBindingOrThrow(bindingId: string): Promise<StoredBinding> {
        const binding = await this.deps.bindingStore.getBindingById(bindingId);
        if (!binding) {
            throw new HttpError(404, `Binding ${bindingId} not found`);
        }
        if (binding.provider !== 'telnyx') {
            throw new HttpError(400, `Binding ${bindingId} is not a Telnyx binding`);
        }
        return binding;
    }

    private async getIntegrationOrThrow(
        integrationId: string
    ): Promise<StoredIntegration & { encryptedApiKey: string }> {
        const integration = await this.deps.integrationStore.getById(integrationId);
        if (!integration) {
            throw new HttpError(404, `Integration ${integrationId} not found`);
        }
        if (integration.status !== 'active') {
            throw new HttpError(403, `Integration ${integrationId} is disabled`);
        }
        if (integration.provider !== 'telnyx') {
            throw new HttpError(400, `Integration ${integrationId} is not a Telnyx integration`);
        }
        return integration;
    }

    private decryptApiKeyFromIntegration(
        integration: StoredIntegration & { encryptedApiKey: string }
    ): string {
        try {
            return decryptString(integration.encryptedApiKey, this.deps.encryptionKey);
        } catch (err) {
            logger.warn(
                {
                    event: 'telnyx.api_key_decrypt_failed',
                    integrationId: integration.id,
                    apiKeyFingerprint: integration.apiKeyFingerprint,
                    err,
                },
                'Failed to decrypt Telnyx API key'
            );
            throw new HttpError(
                409,
                'Unable to decrypt Telnyx API key. The telephony secrets key may have changed; please re-create the Telnyx integration.'
            );
        }
    }
}

function mapTelnyxError(err: unknown): HttpError {
    if (isTelnyxClientError(err)) {
        switch (err.code) {
            case 'AUTH_INVALID':
                return new HttpError(401, 'Invalid Telnyx API key');
            case 'RATE_LIMITED':
                return new HttpError(429, 'Telnyx rate limit exceeded');
            case 'VALIDATION_ERROR':
                return new HttpError(422, err.message);
            case 'PROVIDER_UNREACHABLE':
                return new HttpError(502, 'Unable to reach Telnyx API');
            default:
                return new HttpError(502, `Telnyx error: ${err.message}`);
        }
    }
    if (err instanceof HttpError) return err;
    return new HttpError(500, 'Unexpected error communicating with Telnyx');
}

function parseTelnyxProviderResources(resources: unknown): {
    fqdnConnectionId?: string;
    fqdnId?: string;
} | null {
    const parsed = TelnyxProviderResourcesSchema.safeParse(resources);
    if (!parsed.success) return null;
    return parsed.data;
}

function isTelnyxNotFoundError(err: unknown): boolean {
    return isTelnyxClientError(err) && err.status === 404;
}
