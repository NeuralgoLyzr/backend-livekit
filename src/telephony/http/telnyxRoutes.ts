import { Router } from 'express';
import type { TelnyxOnboardingService } from '../management/telnyxOnboardingService.js';
import type { TelephonyIntegrationStorePort } from '../ports/telephonyIntegrationStorePort.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { isDevEnv } from '../../lib/env.js';
import { HttpError } from '../../lib/httpErrors.js';
import { formatZodError } from '../../lib/zod.js';
import type { RequestAuthLocals } from '../../middleware/apiKeyAuth.js';
import {
    VerifyCredentialsRequestSchema,
    CreateIntegrationRequestSchema,
    ConnectNumberRequestSchema,
} from './schemas.js';

export interface TelnyxRouterDeps {
    onboardingService: TelnyxOnboardingService;
    integrationStore: TelephonyIntegrationStorePort;
}

function requireOrgScope(res: { locals: unknown }): { orgId: string } {
    const auth = (res.locals as RequestAuthLocals).auth;
    if (!auth) {
        throw new HttpError(401, 'Missing auth context');
    }
    return { orgId: auth.orgId };
}

export function createTelnyxRouter(deps: TelnyxRouterDeps): Router {
    const { onboardingService, integrationStore } = deps;
    const router = Router();

    router.get(
        '/integrations',
        asyncHandler(async (_req, res) => {
            const scope = requireOrgScope(res);
            const integrations = await integrationStore.listByProvider('telnyx', scope);
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

    // Dev-only debug: inspect provider number mapping and trunk FQDN attachment.
    if (isDevEnv()) {
        router.get(
            '/debug/numbers/:providerNumberId',
            asyncHandler(async (req, res) => {
                const integrationId = req.query.integrationId as string | undefined;
                if (!integrationId) {
                    throw new HttpError(400, 'integrationId query param is required');
                }
                const scope = requireOrgScope(res);
                const providerNumberId = req.params.providerNumberId as string;
                const result = await onboardingService.debugInspectNumber(
                    integrationId,
                    providerNumberId,
                    scope
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
                const scope = requireOrgScope(res);
                const connectionId = req.params.connectionId as string;
                const transportProtocol =
                    req.body && typeof req.body === 'object' && 'transportProtocol' in req.body
                        ? (req.body as { transportProtocol?: unknown }).transportProtocol
                        : undefined;
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
                    transportProtocol,
                    scope
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
            const { e164, agentId } = parsed.data;
            const scope = requireOrgScope(res);
            const binding = await onboardingService.connectNumber(integrationId, {
                providerNumberId,
                e164,
                agentId,
            }, scope);
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
