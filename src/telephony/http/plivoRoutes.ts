import { Router } from 'express';
import type { PlivoOnboardingService } from '../management/plivoOnboardingService.js';
import type { TelephonyIntegrationStorePort } from '../ports/telephonyIntegrationStorePort.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { HttpError } from '../../lib/httpErrors.js';
import { formatZodError } from '../../lib/zod.js';
import type { RequestAuthLocals } from '../../middleware/apiKeyAuth.js';
import {
    PlivoVerifyCredentialsRequestSchema,
    PlivoCreateIntegrationRequestSchema,
    ConnectNumberRequestSchema,
} from './schemas.js';

export interface PlivoRouterDeps {
    onboardingService: PlivoOnboardingService;
    integrationStore: TelephonyIntegrationStorePort;
}

function requireOrgScope(res: { locals: unknown }): { orgId: string } {
    const auth = (res.locals as RequestAuthLocals).auth;
    if (!auth) {
        throw new HttpError(401, 'Missing auth context');
    }
    return { orgId: auth.orgId };
}

export function createPlivoRouter(deps: PlivoRouterDeps): Router {
    const { onboardingService, integrationStore } = deps;
    const router = Router();

    router.get(
        '/integrations',
        asyncHandler(async (_req, res) => {
            const scope = requireOrgScope(res);
            const integrations = await integrationStore.listByProvider('plivo', scope);
            return res.json({ integrations });
        })
    );

    router.post(
        '/credentials/verify',
        asyncHandler(async (req, res) => {
            const parsed = PlivoVerifyCredentialsRequestSchema.safeParse(req.body);
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
            const parsed = PlivoCreateIntegrationRequestSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json(formatZodError(parsed.error));
            }
            const scope = requireOrgScope(res);
            const result = await onboardingService.createIntegration(parsed.data, scope);
            return res.json({
                integrationId: result.id,
                provider: result.provider,
                status: result.status,
            });
        })
    );

    const deleteIntegrationHandler = asyncHandler(async (req, res) => {
        const scope = requireOrgScope(res);
        const integrationId = req.params.integrationId as string;
        const result = await onboardingService.deleteIntegration(integrationId, scope);
        return res.json({ ok: true, ...result });
    });

    router.delete('/integrations/:integrationId', deleteIntegrationHandler);
    // Backward-compatible alias
    router.delete('/credentials/:integrationId', deleteIntegrationHandler);

    router.get(
        '/numbers',
        asyncHandler(async (req, res) => {
            const integrationId = req.query.integrationId as string | undefined;
            if (!integrationId) {
                throw new HttpError(400, 'integrationId query param is required');
            }
            const scope = requireOrgScope(res);
            const numbers = await onboardingService.listNumbers(integrationId, scope);
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
            const { e164, agentId } = parsed.data;
            const scope = requireOrgScope(res);
            const binding = await onboardingService.connectNumber(
                integrationId,
                {
                    providerNumberId,
                    e164,
                    agentId,
                },
                scope
            );
            return res.json(binding);
        })
    );

    router.delete(
        '/bindings/:bindingId',
        asyncHandler(async (req, res) => {
            const bindingId = req.params.bindingId as string;
            const scope = requireOrgScope(res);
            await onboardingService.disconnectNumber(bindingId, scope);
            return res.json({ ok: true });
        })
    );

    return router;
}
