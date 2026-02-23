import { z } from 'zod';

import {
    PlivoClient,
    isPlivoClientError,
    type PlivoCredentials,
    type PlivoPhoneNumber,
} from '../adapters/plivo/plivoClient.js';
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

const PlivoProviderResourcesSchema = z
    .object({
        trunkId: z.string().optional(),
        originationUriId: z.string().optional(),
    })
    .passthrough();

const PlivoEncryptedCredentialsSchema = z.object({
    authId: z.string().min(1),
    authToken: z.string().min(1),
});

export interface PlivoOnboardingDeps {
    integrationStore: TelephonyIntegrationStorePort;
    bindingStore: TelephonyBindingStorePort;
    encryptionKey: Buffer;
    livekitSipHost: string;
    livekitProvisioning: LiveKitTelephonyProvisioningPort;
}

const TRUNK_NAME_PREFIX = 'livekit-inbound-';

export class PlivoOnboardingService {
    constructor(private readonly deps: PlivoOnboardingDeps) {}

    async verifyCredentials(creds: PlivoCredentials): Promise<{ valid: true }> {
        const client = new PlivoClient(creds);
        try {
            return await client.verifyCredentials();
        } catch (err) {
            throw mapPlivoError(err);
        }
    }

    async createIntegration(input: {
        authId: string;
        authToken: string;
        name?: string;
    }): Promise<StoredIntegration> {
        const creds: PlivoCredentials = {
            authId: input.authId,
            authToken: input.authToken,
        };

        await this.verifyCredentials(creds);

        const encrypted = encryptString(JSON.stringify(creds), this.deps.encryptionKey);
        const fingerprint = fingerprintSecret(`plivo:${creds.authId}`);

        const integration = await this.deps.integrationStore.create({
            provider: 'plivo',
            name: input.name,
            encryptedApiKey: encrypted,
            apiKeyFingerprint: fingerprint,
        });

        try {
            await this.ensureInboundTrunk(integration.id, creds);
        } catch (err) {
            logger.warn(
                { event: 'plivo.trunk_setup_deferred', integrationId: integration.id, err },
                'Trunk setup deferred'
            );
        }

        logger.info(
            { event: 'plivo.credentials.saved', integrationId: integration.id },
            'Plivo integration created'
        );
        return integration;
    }

    async listNumbers(integrationId: string): Promise<PlivoPhoneNumber[]> {
        const creds = await this.decryptCredentials(integrationId);
        const client = new PlivoClient(creds);
        try {
            return await client.listPhoneNumbers();
        } catch (err) {
            throw mapPlivoError(err);
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
        const creds = this.decryptCredentialsFromIntegration(integration);
        const client = new PlivoClient(creds);

        const providerNumber = await this.getPhoneNumberOrThrow(client, input.providerNumberId);
        const normalizedDid = this.assertRequestedDidMatchesProviderNumber(
            input.e164,
            providerNumber.number
        );

        await this.deps.livekitProvisioning.ensureInboundSetupForDid(normalizedDid);

        const parsed = PlivoProviderResourcesSchema.safeParse(integration.providerResources);
        const trunkId =
            parsed.success && parsed.data.trunkId
                ? parsed.data.trunkId
                : (await this.ensureInboundTrunkInternal(client, integration.id)).trunkId;

        try {
            await client.setNumberAppId(input.providerNumberId, trunkId);
        } catch (err) {
            throw mapPlivoError(err);
        }

        const binding = await this.deps.bindingStore.upsertBinding({
            integrationId,
            provider: 'plivo',
            providerNumberId: input.providerNumberId,
            e164: normalizedDid,
            agentId: input.agentId,
        });

        logger.info(
            { event: 'plivo.number.connected', integrationId, e164: normalizedDid },
            'Number connected'
        );
        return binding;
    }

    async disconnectNumber(bindingId: string): Promise<void> {
        const binding = await this.getBindingOrThrow(bindingId);
        const integration = await this.getIntegrationOrThrow(binding.integrationId);
        const creds = this.decryptCredentialsFromIntegration(integration);
        const client = new PlivoClient(creds);

        await this.disconnectBinding(binding, integration, client);
    }

    async deleteIntegration(integrationId: string): Promise<{ deletedBindings: number }> {
        const integration = await this.getIntegrationOrThrow(integrationId);
        const creds = this.decryptCredentialsFromIntegration(integration);
        const client = new PlivoClient(creds);

        const bindings = await this.deps.bindingStore.listBindingsByIntegrationId(integrationId);
        for (const binding of bindings) {
            if (binding.provider !== 'plivo') continue;
            await this.disconnectBinding(binding, integration, client);
        }

        const resources = parsePlivoProviderResources(integration.providerResources);
        if (resources?.originationUriId) {
            try {
                await client.deleteOriginationUri(resources.originationUriId);
            } catch (err) {
                if (!isPlivoNotFoundError(err)) {
                    throw mapPlivoError(err);
                }
            }
        }

        if (resources?.trunkId) {
            try {
                await client.deleteInboundTrunk(resources.trunkId);
            } catch (err) {
                if (!isPlivoNotFoundError(err)) {
                    throw mapPlivoError(err);
                }
            }
        }

        const deleted = await this.deps.integrationStore.deleteById(integrationId);
        if (!deleted) {
            throw new HttpError(404, `Integration ${integrationId} not found`);
        }

        logger.info(
            { event: 'plivo.integration.deleted', integrationId, deletedBindings: bindings.length },
            'Plivo integration deleted'
        );
        return { deletedBindings: bindings.length };
    }

    private async ensureInboundTrunk(integrationId: string, creds: PlivoCredentials): Promise<void> {
        const client = new PlivoClient(creds);
        await this.ensureInboundTrunkInternal(client, integrationId);
    }

    private async ensureInboundTrunkInternal(
        client: PlivoClient,
        integrationId: string
    ): Promise<{ trunkId: string; originationUriId?: string }> {
        const trunkName = `${TRUNK_NAME_PREFIX}${integrationId}`;
        const targetUri = normalizePlivoOriginationUri(this.deps.livekitSipHost);
        const targetHost = normalizePlivoSipHost(targetUri);

        if (!targetUri || !targetHost) {
            throw new HttpError(
                500,
                `Invalid LIVEKIT_SIP_HOST configured for Plivo (${this.deps.livekitSipHost})`
            );
        }

        try {
            const uris = await client.listOriginationUris();
            let uri = uris.find(
                (entry) =>
                    normalizePlivoSipHost(entry.host) === targetHost ||
                    normalizePlivoSipHost(entry.uri) === targetHost
            );

            if (!uri) {
                const created = await client.createOriginationUri({
                    name: 'LiveKit SIP Host',
                    uri: targetUri,
                });
                uri = {
                    id: created.id,
                    name: 'LiveKit SIP Host',
                    uri: targetUri,
                    host: targetHost,
                };
            }

            const trunks = await client.listInboundTrunks();
            let trunk = trunks.find((t) => t.name === trunkName);
            if (!trunk) {
                const created = await client.createInboundTrunk(trunkName, uri.id);
                trunk = {
                    trunkId: created.trunkId,
                    name: trunkName,
                    primaryUriId: created.primaryUriId ?? uri.id,
                };
            } else if (trunk.primaryUriId && trunk.primaryUriId !== uri.id) {
                await client.deleteInboundTrunk(trunk.trunkId);
                const recreated = await client.createInboundTrunk(trunkName, uri.id);
                trunk = {
                    trunkId: recreated.trunkId,
                    name: trunkName,
                    primaryUriId: recreated.primaryUriId ?? uri.id,
                };
            }

            const resources: Record<string, unknown> = {
                trunkId: trunk.trunkId,
                originationUriId: uri.id,
            };
            await this.deps.integrationStore.updateProviderResources(integrationId, resources);

            return { trunkId: trunk.trunkId, originationUriId: uri.id };
        } catch (err) {
            if (isPlivoClientError(err)) {
                throw mapPlivoError(err);
            }
            throw err;
        }
    }

    private async decryptCredentials(integrationId: string): Promise<PlivoCredentials> {
        const integration = await this.getIntegrationOrThrow(integrationId);
        return this.decryptCredentialsFromIntegration(integration);
    }

    private async getPhoneNumberOrThrow(
        client: PlivoClient,
        providerNumberId: string
    ): Promise<PlivoPhoneNumber> {
        try {
            return await client.getPhoneNumber(providerNumberId);
        } catch (err) {
            throw mapPlivoError(err);
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
        client: PlivoClient
    ): Promise<void> {
        await this.deps.livekitProvisioning.removeInboundSetupForDid(binding.e164);

        try {
            await client.setNumberAppId(binding.providerNumberId, null);
        } catch (err) {
            throw mapPlivoError(err);
        }

        const deleted = await this.deps.bindingStore.deleteBinding(binding.id);
        if (!deleted) {
            throw new HttpError(404, `Binding ${binding.id} not found`);
        }

        logger.info(
            {
                event: 'plivo.number.disconnected',
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
        if (binding.provider !== 'plivo') {
            throw new HttpError(400, `Binding ${bindingId} is not a Plivo binding`);
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
        if (integration.provider !== 'plivo') {
            throw new HttpError(400, `Integration ${integrationId} is not a Plivo integration`);
        }
        return integration;
    }

    private decryptCredentialsFromIntegration(
        integration: StoredIntegration & { encryptedApiKey: string }
    ): PlivoCredentials {
        let decrypted: string;
        try {
            decrypted = decryptString(integration.encryptedApiKey, this.deps.encryptionKey);
        } catch (err) {
            logger.warn(
                {
                    event: 'plivo.credentials_decrypt_failed',
                    integrationId: integration.id,
                    apiKeyFingerprint: integration.apiKeyFingerprint,
                    err,
                },
                'Failed to decrypt Plivo credentials'
            );
            throw new HttpError(
                409,
                'Unable to decrypt Plivo credentials. The telephony secrets key may have changed; please re-create the Plivo integration.'
            );
        }

        let parsedJson: unknown;
        try {
            parsedJson = JSON.parse(decrypted) as unknown;
        } catch {
            throw new HttpError(409, 'Stored Plivo credentials are invalid JSON');
        }

        const parsed = PlivoEncryptedCredentialsSchema.safeParse(parsedJson);
        if (!parsed.success) {
            throw new HttpError(409, 'Stored Plivo credentials are invalid');
        }

        return parsed.data;
    }
}

function mapPlivoError(err: unknown): HttpError {
    if (isPlivoClientError(err)) {
        switch (err.code) {
            case 'AUTH_INVALID':
                return new HttpError(401, 'Invalid Plivo credentials');
            case 'RATE_LIMITED':
                return new HttpError(429, 'Plivo rate limit exceeded');
            case 'VALIDATION_ERROR':
                return new HttpError(422, err.message);
            case 'PROVIDER_UNREACHABLE':
                return new HttpError(502, 'Unable to reach Plivo API');
            case 'PROVIDER_ERROR':
                return new HttpError(502, `Plivo error: ${err.message}`);
            default:
                return new HttpError(502, `Plivo error: ${err.message}`);
        }
    }
    if (err instanceof HttpError) return err;
    return new HttpError(500, 'Unexpected error communicating with Plivo');
}

function parsePlivoProviderResources(resources: unknown): {
    trunkId?: string;
    originationUriId?: string;
} | null {
    const parsed = PlivoProviderResourcesSchema.safeParse(resources);
    if (!parsed.success) return null;
    return parsed.data;
}

function isPlivoNotFoundError(err: unknown): boolean {
    return isPlivoClientError(err) && err.status === 404;
}

function normalizePlivoSipHost(input: string): string {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return '';

    const withoutProtocol = trimmed.replace(/^sip:/, '');
    const withoutQuery = withoutProtocol.split('?')[0] ?? withoutProtocol;
    const withoutParams = withoutQuery.split(';')[0] ?? withoutQuery;
    const hostWithMaybePort = (withoutParams.split('@').pop() ?? withoutParams).trim();

    if (/:[0-9]+$/.test(hostWithMaybePort)) {
        return hostWithMaybePort.replace(/:[0-9]+$/, '').trim();
    }

    return hostWithMaybePort;
}

function normalizePlivoOriginationUri(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return '';
    return trimmed.replace(/^sip:/i, '');
}
