import { Router } from 'express';
import type { TelnyxOnboardingService } from '../management/telnyxOnboardingService.js';
import type { TelephonyIntegrationStorePort } from '../ports/telephonyIntegrationStorePort.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { HttpError } from '../../lib/httpErrors.js';
import { formatZodError } from '../../lib/zod.js';
import {
    VerifyCredentialsRequestSchema,
    CreateIntegrationRequestSchema,
    ConnectNumberRequestSchema,
} from './schemas.js';

export interface TelnyxRouterDeps {
    onboardingService: TelnyxOnboardingService;
    integrationStore: TelephonyIntegrationStorePort;
}

export function createTelnyxRouter(deps: TelnyxRouterDeps): Router {
    const { onboardingService, integrationStore } = deps;
    const router = Router();

    router.get(
        '/integrations',
        asyncHandler(async (_req, res) => {
            const integrations = await integrationStore.listByProvider('telnyx');
            return res.json({ integrations });
        })
    );

    router.post(
        '/credentials/verify',
        asyncHandler(async (req, res) => {
            const parsed = VerifyCredentialsRequestSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json(formatZodError(parsed.error));
            }
            await onboardingService.verifyApiKey(parsed.data.apiKey);
            return res.json({ valid: true });
        })
    );

    router.post(
        '/credentials',
        asyncHandler(async (req, res) => {
            const parsed = CreateIntegrationRequestSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json(formatZodError(parsed.error));
            }
            const result = await onboardingService.createIntegration(parsed.data);
            return res.json({
                integrationId: result.id,
                provider: result.provider,
                status: result.status,
            });
        })
    );

    router.delete(
        '/credentials/:integrationId',
        asyncHandler(async (req, res) => {
            const integrationId = req.params.integrationId as string;
            await integrationStore.disable(integrationId);
            return res.json({ ok: true });
        })
    );

    router.get(
        '/numbers',
        asyncHandler(async (req, res) => {
            const integrationId = req.query.integrationId as string | undefined;
            if (!integrationId) {
                throw new HttpError(400, 'integrationId query param is required');
            }
            const numbers = await onboardingService.listNumbers(integrationId);
            return res.json({ numbers });
        })
    );

    // Non-prod debug: inspect provider number mapping and trunk FQDN attachment.
    if (process.env.NODE_ENV !== 'production') {
        router.get(
            '/debug/numbers/:providerNumberId',
            asyncHandler(async (req, res) => {
                const integrationId = req.query.integrationId as string | undefined;
                if (!integrationId) {
                    throw new HttpError(400, 'integrationId query param is required');
                }
                const providerNumberId = req.params.providerNumberId as string;
                const result = await onboardingService.debugInspectNumber(
                    integrationId,
                    providerNumberId
                );
                return res.json(result);
            })
        );

        router.post(
            '/debug/connections/:connectionId/transport',
            asyncHandler(async (req, res) => {
                const integrationId = req.query.integrationId as string | undefined;
                if (!integrationId) {
                    throw new HttpError(400, 'integrationId query param is required');
                }
                const connectionId = req.params.connectionId as string;
                const transportProtocol = req.body?.transportProtocol as string | undefined;
                if (
                    transportProtocol !== 'UDP' &&
                    transportProtocol !== 'TCP' &&
                    transportProtocol !== 'TLS'
                ) {
                    throw new HttpError(400, 'transportProtocol must be one of UDP, TCP, TLS');
                }
                const result = await onboardingService.debugSetTransportProtocol(
                    integrationId,
                    connectionId,
                    transportProtocol
                );
                return res.json(result);
            })
        );
    }

    router.post(
        '/numbers/:providerNumberId/connect',
        asyncHandler(async (req, res) => {
            const integrationId = req.query.integrationId as string | undefined;
            if (!integrationId) {
                throw new HttpError(400, 'integrationId query param is required');
            }
            const parsed = ConnectNumberRequestSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json(formatZodError(parsed.error));
            }
            const providerNumberId = req.params.providerNumberId as string;
            const { e164, agentId, agentConfig } = parsed.data;
            const binding = await onboardingService.connectNumber(integrationId, {
                providerNumberId,
                e164,
                agentId,
                agentConfig,
            });
            return res.json(binding);
        })
    );

    router.delete(
        '/bindings/:bindingId',
        asyncHandler(async (req, res) => {
            const bindingId = req.params.bindingId as string;
            await onboardingService.disconnectNumber(bindingId);
            return res.json({ ok: true });
        })
    );

    return router;
}
