import type { CallRoutingPort } from '../ports/callRoutingPort.js';
import type { TelephonyBindingStorePort } from '../ports/telephonyBindingStorePort.js';
import type { CallRoutingContext, CallRoutingResult } from '../types.js';
import { normalizeE164 } from '../core/e164.js';
import { DefaultCallRouting } from './defaultRouting.js';

export class BindingBasedCallRouting implements CallRoutingPort {
    private readonly fallback = new DefaultCallRouting();

    constructor(private readonly bindingStore: TelephonyBindingStorePort) {}

    async resolveRouting(ctx: CallRoutingContext): Promise<CallRoutingResult> {
        if (!ctx.to) {
            return this.fallback.resolveRouting(ctx);
        }

        const normalizedDid = normalizeE164(ctx.to);
        const binding = await this.bindingStore.getBindingByE164(normalizedDid);

        if (binding && binding.enabled && binding.agentConfig) {
            return { agentConfig: binding.agentConfig };
        }

        return this.fallback.resolveRouting(ctx);
    }
}
