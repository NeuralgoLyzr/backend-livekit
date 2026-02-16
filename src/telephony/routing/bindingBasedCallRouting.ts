import type { CallRoutingPort } from '../ports/callRoutingPort.js';
import type { TelephonyBindingStorePort } from '../ports/telephonyBindingStorePort.js';
import type { CallRoutingContext, CallRoutingResult } from '../types.js';
import { normalizeE164 } from '../core/e164.js';
import { DefaultCallRouting } from './defaultRouting.js';
import type { AgentConfigResolverService } from '../../services/agentConfigResolverService.js';
import { logger } from '../../lib/logger.js';

export class BindingBasedCallRouting implements CallRoutingPort {
    private readonly fallback = new DefaultCallRouting();

    constructor(
        private readonly bindingStore: TelephonyBindingStorePort,
        private readonly agentConfigResolver: Pick<AgentConfigResolverService, 'resolveByAgentId'>
    ) {}

    async resolveRouting(ctx: CallRoutingContext): Promise<CallRoutingResult> {
        if (!ctx.to) {
            return this.fallback.resolveRouting(ctx);
        }

        const normalizedDid = normalizeE164(ctx.to);
        const binding = await this.bindingStore.getBindingByE164(normalizedDid);

        if (binding && binding.enabled) {
            if (binding.agentId) {
                try {
                    const resolvedAgentConfig = await this.agentConfigResolver.resolveByAgentId({
                        agentId: binding.agentId,
                    });
                    return {
                        agentConfig: {
                            ...resolvedAgentConfig,
                            agent_id: binding.agentId,
                        },
                    };
                } catch (err) {
                    logger.warn(
                        {
                            event: 'telephony.binding.agent_resolution_failed',
                            bindingId: binding.id,
                            e164: binding.e164,
                            agentId: binding.agentId,
                            err,
                        },
                        'Failed to resolve latest agent config from bound agentId'
                    );
                    return this.fallback.resolveRouting(ctx);
                }
            }
        }

        return this.fallback.resolveRouting(ctx);
    }
}
