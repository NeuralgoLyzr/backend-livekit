import { z } from 'zod';

import {
    TwilioClient,
    isTwilioClientError,
    type TwilioCredentials,
    type TwilioIncomingPhoneNumber,
} from '../adapters/twilio/twilioClient.js';
import type {
    TelephonyIntegrationStorePort,
    StoredIntegration,
} from '../ports/telephonyIntegrationStorePort.js';
import type {
    TelephonyBindingStorePort,
    StoredBinding,
} from '../ports/telephonyBindingStorePort.js';
import type { AgentConfig } from '../../types/index.js';
import { encryptString, decryptString, fingerprintSecret } from '../../lib/crypto/secretBox.js';
import { HttpError } from '../../lib/httpErrors.js';
import { logger } from '../../lib/logger.js';
import type { LiveKitTelephonyProvisioningPort } from './livekitTelephonyProvisioningService.js';
import { normalizeE164 } from '../core/e164.js';

const TwilioProviderResourcesSchema = z
    .object({
        trunkSid: z.string().optional(),
        originationUrlSid: z.string().optional(),
    })
    .passthrough();

const TwilioEncryptedCredentialsSchema = z.object({
    accountSid: z.string().min(1),
    apiKeySid: z.string().min(1),
    apiKeySecret: z.string().min(1),
});

export interface TwilioOnboardingDeps {
    integrationStore: TelephonyIntegrationStorePort;
    bindingStore: TelephonyBindingStorePort;
    encryptionKey: Buffer;
    livekitSipHost: string;
    livekitProvisioning: LiveKitTelephonyProvisioningPort;
}

const TRUNK_NAME_PREFIX = 'livekit-inbound-';

export class TwilioOnboardingService {
    constructor(private readonly deps: TwilioOnboardingDeps) {}

    async verifyCredentials(creds: TwilioCredentials): Promise<{ valid: true }> {
        const client = new TwilioClient(creds);
        try {
            return await client.verifyCredentials();
        } catch (err) {
            throw mapTwilioError(err);
        }
    }

    async createIntegration(input: {
        accountSid: string;
        apiKeySid: string;
        apiKeySecret: string;
        name?: string;
    }): Promise<StoredIntegration> {
        const creds: TwilioCredentials = {
            accountSid: input.accountSid,
            apiKeySid: input.apiKeySid,
            apiKeySecret: input.apiKeySecret,
        };

        await this.verifyCredentials(creds);

        const encrypted = encryptString(JSON.stringify(creds), this.deps.encryptionKey);
        const fingerprint = fingerprintSecret(`${creds.accountSid}:${creds.apiKeySid}`);

        const integration = await this.deps.integrationStore.create({
            provider: 'twilio',
            name: input.name,
            encryptedApiKey: encrypted,
            apiKeyFingerprint: fingerprint,
        });

        try {
            await this.ensureInboundTrunk(integration.id, creds);
        } catch (err) {
            logger.warn(
                { event: 'twilio.trunk_setup_deferred', integrationId: integration.id, err },
                'Trunk setup deferred'
            );
        }

        logger.info(
            { event: 'twilio.credentials.saved', integrationId: integration.id },
            'Twilio integration created'
        );
        return integration;
    }

    async listNumbers(integrationId: string): Promise<TwilioIncomingPhoneNumber[]> {
        const creds = await this.decryptCredentials(integrationId);
        const client = new TwilioClient(creds);
        try {
            return await client.listIncomingPhoneNumbers();
        } catch (err) {
            throw mapTwilioError(err);
        }
    }

    async connectNumber(
        integrationId: string,
        input: {
            providerNumberId: string; // Twilio IncomingPhoneNumber SID
            e164: string;
            agentId?: string;
            agentConfig?: AgentConfig;
        }
    ): Promise<StoredBinding> {
        const integration = await this.getIntegrationOrThrow(integrationId);
        const creds = this.decryptCredentialsFromIntegration(integration);
        const client = new TwilioClient(creds);

        const providerNumber = await this.getIncomingPhoneNumberOrThrow(client, input.providerNumberId);
        const normalizedDid = this.assertRequestedDidMatchesProviderNumber(
            input.e164,
            providerNumber.phoneNumber
        );

        // Ensure LiveKit inbound trunk + dispatch rule exist for this DID before connecting provider routing.
        await this.deps.livekitProvisioning.ensureInboundSetupForDid(normalizedDid);

        const parsed = TwilioProviderResourcesSchema.safeParse(integration.providerResources);
        const trunkSid =
            parsed.success && parsed.data.trunkSid
                ? parsed.data.trunkSid
                : (await this.ensureInboundTrunkInternal(client, integration.id)).trunkSid;

        try {
            await client.attachPhoneNumberToTrunk(trunkSid, input.providerNumberId);
        } catch (err) {
            throw mapTwilioError(err);
        }

        const binding = await this.deps.bindingStore.upsertBinding({
            integrationId,
            provider: 'twilio',
            providerNumberId: input.providerNumberId,
            e164: normalizedDid,
            agentId: input.agentId,
            agentConfig: input.agentConfig,
        });

        logger.info(
            { event: 'twilio.number.connected', integrationId, e164: normalizedDid },
            'Number connected'
        );
        return binding;
    }

    async disconnectNumber(bindingId: string): Promise<void> {
        await this.deps.bindingStore.disableBinding(bindingId);
        logger.info({ event: 'twilio.number.disconnected', bindingId }, 'Number disconnected');
    }

    // ── private helpers ───────────────────────────────────────────────────

    private async ensureInboundTrunk(integrationId: string, creds: TwilioCredentials): Promise<void> {
        const client = new TwilioClient(creds);
        await this.ensureInboundTrunkInternal(client, integrationId);
    }

    private async ensureInboundTrunkInternal(
        client: TwilioClient,
        integrationId: string
    ): Promise<{ trunkSid: string; originationUrlSid?: string }> {
        const trunkBaseName = `${TRUNK_NAME_PREFIX}${integrationId}`;
        const trunkDomainName = `${trunkBaseName}.pstn.twilio.com`;

        try {
            const trunks = await client.listTrunks();
            let trunk = trunks.find((t) => t.domainName === trunkDomainName);
            if (!trunk) {
                const created = await client.createTrunk({
                    friendlyName: trunkBaseName,
                    domainName: trunkDomainName,
                });
                trunk = { sid: created.sid, domainName: trunkDomainName, friendlyName: trunkBaseName };
            }

            const sipUrl = `sip:${this.deps.livekitSipHost}`;
            const urls = await client.listOriginationUrls(trunk.sid);
            const url = urls.find((u) => u.sipUrl === sipUrl);

            let originationUrlSid: string | undefined;
            if (!url) {
                const created = await client.createOriginationUrl(trunk.sid, {
                    friendlyName: 'LiveKit SIP Host',
                    sipUrl,
                    enabled: true,
                    weight: 1,
                    priority: 1,
                });
                originationUrlSid = created.sid;
            } else {
                originationUrlSid = url.sid;
            }

            const resources: Record<string, unknown> = {
                trunkSid: trunk.sid,
                originationUrlSid,
            };
            await this.deps.integrationStore.updateProviderResources(integrationId, resources);

            return { trunkSid: trunk.sid, originationUrlSid };
        } catch (err) {
            if (isTwilioClientError(err)) {
                throw mapTwilioError(err);
            }
            throw err;
        }
    }

    private async decryptCredentials(integrationId: string): Promise<TwilioCredentials> {
        const integration = await this.getIntegrationOrThrow(integrationId);
        return this.decryptCredentialsFromIntegration(integration);
    }

    private async getIncomingPhoneNumberOrThrow(
        client: TwilioClient,
        providerNumberId: string
    ): Promise<TwilioIncomingPhoneNumber> {
        try {
            return await client.getIncomingPhoneNumber(providerNumberId);
        } catch (err) {
            throw mapTwilioError(err);
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
        if (integration.provider !== 'twilio') {
            throw new HttpError(400, `Integration ${integrationId} is not a Twilio integration`);
        }
        return integration;
    }

    private decryptCredentialsFromIntegration(
        integration: StoredIntegration & { encryptedApiKey: string }
    ): TwilioCredentials {
        let decrypted: string;
        try {
            decrypted = decryptString(integration.encryptedApiKey, this.deps.encryptionKey);
        } catch (err) {
            logger.warn(
                {
                    event: 'twilio.credentials_decrypt_failed',
                    integrationId: integration.id,
                    apiKeyFingerprint: integration.apiKeyFingerprint,
                    err,
                },
                'Failed to decrypt Twilio credentials'
            );
            throw new HttpError(
                409,
                'Unable to decrypt Twilio credentials. The telephony secrets key may have changed; please re-create the Twilio integration.'
            );
        }

        let parsedJson: unknown;
        try {
            parsedJson = JSON.parse(decrypted) as unknown;
        } catch {
            throw new HttpError(409, 'Stored Twilio credentials are invalid JSON');
        }

        const parsed = TwilioEncryptedCredentialsSchema.safeParse(parsedJson);
        if (!parsed.success) {
            throw new HttpError(409, 'Stored Twilio credentials are invalid');
        }

        return parsed.data;
    }
}

function mapTwilioError(err: unknown): HttpError {
    if (isTwilioClientError(err)) {
        switch (err.code) {
            case 'AUTH_INVALID':
                return new HttpError(401, 'Invalid Twilio credentials');
            case 'RATE_LIMITED':
                return new HttpError(429, 'Twilio rate limit exceeded');
            case 'VALIDATION_ERROR':
                return new HttpError(422, err.message);
            case 'PROVIDER_UNREACHABLE':
                return new HttpError(502, 'Unable to reach Twilio API');
            default:
                return new HttpError(502, `Twilio error: ${err.message}`);
        }
    }
    if (err instanceof HttpError) return err;
    return new HttpError(500, 'Unexpected error communicating with Twilio');
}
