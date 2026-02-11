import { Router } from 'express';
import type { TwilioOnboardingService } from '../management/twilioOnboardingService.js';
import type { TelephonyIntegrationStorePort } from '../ports/telephonyIntegrationStorePort.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { HttpError } from '../../lib/httpErrors.js';
import { formatZodError } from '../../lib/zod.js';
import {
    TwilioVerifyCredentialsRequestSchema,
    TwilioCreateIntegrationRequestSchema,
    ConnectNumberRequestSchema,
} from './schemas.js';

export interface TwilioRouterDeps {
    onboardingService: TwilioOnboardingService;
    integrationStore: TelephonyIntegrationStorePort;
}

export function createTwilioRouter(deps: TwilioRouterDeps): Router {
    const { onboardingService, integrationStore } = deps;
    const router = Router();

    router.get(
        '/integrations',
        asyncHandler(async (_req, res) => {
            const integrations = await integrationStore.listByProvider('twilio');
            return res.json({ integrations });
        })
    );

    router.post(
        '/credentials/verify',
        asyncHandler(async (req, res) => {
            const parsed = TwilioVerifyCredentialsRequestSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json(formatZodError(parsed.error));
            }
            await onboardingService.verifyCredentials(parsed.data);
            return res.json({ valid: true });
        })
    );

    router.post(
        '/credentials',
        asyncHandler(async (req, res) => {
            const parsed = TwilioCreateIntegrationRequestSchema.safeParse(req.body);
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

