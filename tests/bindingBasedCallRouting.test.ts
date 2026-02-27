import { describe, expect, it, vi } from 'vitest';
import { logger } from '../src/lib/logger.js';
import { BindingBasedCallRouting } from '../src/telephony/routing/bindingBasedCallRouting.js';
import type { TelephonyBindingStorePort } from '../src/telephony/ports/telephonyBindingStorePort.js';
import type { CallRoutingContext } from '../src/telephony/types.js';
import type { AgentConfigResolverService } from '../src/services/agentConfigResolverService.js';

function makeBindingStore(overrides?: Partial<TelephonyBindingStorePort>): TelephonyBindingStorePort {
    return {
        upsertBinding: vi.fn().mockResolvedValue(null),
        getBindingByE164: vi.fn().mockResolvedValue(null),
        getBindingById: vi.fn().mockResolvedValue(null),
        listBindings: vi.fn().mockResolvedValue([]),
        listBindingsByIntegrationId: vi.fn().mockResolvedValue([]),
        deleteBinding: vi.fn().mockResolvedValue(false),
        ...overrides,
    };
}

function makeCtx(overrides?: Partial<CallRoutingContext>): CallRoutingContext {
    return {
        roomName: 'room-1',
        from: '+15551234567',
        to: '+15559876543',
        ...overrides,
    };
}

function makeAgentConfigResolver(
    overrides?: Partial<Pick<AgentConfigResolverService, 'resolveByAgentId'>>
): Pick<AgentConfigResolverService, 'resolveByAgentId'> {
    return {
        resolveByAgentId: vi.fn().mockResolvedValue({
            prompt: 'You are the latest agent.',
            agent_name: 'Latest Agent',
        }),
        ...overrides,
    };
}

function makeStoredBinding(overrides?: Record<string, unknown>) {
    return {
        id: 'binding-1',
        integrationId: 'int-1',
        provider: 'twilio',
        providerNumberId: 'pn-1',
        e164: '+15559876543',
        agentId: 'agent-1',
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

describe('BindingBasedCallRouting', () => {
    it('resolves latest config by agentId when a matching binding is found', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding()),
        });
        const resolver = makeAgentConfigResolver();
        const router = new BindingBasedCallRouting(store, resolver);

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig).toEqual({
            prompt: 'You are the latest agent.',
            agent_name: 'Latest Agent',
            agent_id: 'agent-1',
        });
        expect(store.getBindingByE164).toHaveBeenCalledWith('+15559876543');
        expect(resolver.resolveByAgentId).toHaveBeenCalledWith({ agentId: 'agent-1' });
    });

    it('falls back to default routing when ctx.to is null', async () => {
        const store = makeBindingStore();
        const router = new BindingBasedCallRouting(store, makeAgentConfigResolver());

        const result = await router.resolveRouting(makeCtx({ to: null }));

        expect(store.getBindingByE164).not.toHaveBeenCalled();
        expect(result.agentConfig).toBeDefined();
        expect(result.agentConfig.prompt).toContain('helpful voice AI assistant');
    });

    it('falls back to default routing when no binding is found', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(null),
        });
        const router = new BindingBasedCallRouting(store, makeAgentConfigResolver());

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig.prompt).toContain('helpful voice AI assistant');
    });

    it('falls back when the binding is disabled', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding({ enabled: false })),
        });
        const router = new BindingBasedCallRouting(store, makeAgentConfigResolver());

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig.prompt).toContain('helpful voice AI assistant');
    });

    it('resolves latest config when binding has agentId and no bound config', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding()),
        });
        const resolver = makeAgentConfigResolver();
        const router = new BindingBasedCallRouting(store, resolver);

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig).toEqual({
            prompt: 'You are the latest agent.',
            agent_name: 'Latest Agent',
            agent_id: 'agent-1',
        });
        expect(resolver.resolveByAgentId).toHaveBeenCalledWith({ agentId: 'agent-1' });
    });

    it('falls back to default routing when binding has no agentId', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding({ agentId: null })),
        });
        const resolver = makeAgentConfigResolver();
        const router = new BindingBasedCallRouting(store, resolver);

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig.prompt).toContain('helpful voice AI assistant');
        expect(resolver.resolveByAgentId).not.toHaveBeenCalled();
    });

    it('falls back to default routing when agentId resolution fails', async () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding()),
        });
        const resolver = makeAgentConfigResolver({
            resolveByAgentId: vi.fn().mockRejectedValue(new Error('Agent config lookup failed')),
        });
        const router = new BindingBasedCallRouting(store, resolver);

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig.prompt).toContain('helpful voice AI assistant');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'telephony.binding.agent_resolution_failed',
                bindingId: 'binding-1',
                e164: '+15559876543',
                agentId: 'agent-1',
                err: expect.any(Error),
            }),
            'Failed to resolve latest agent config from bound agentId'
        );
    });

    it('normalizes DID by adding + prefix when missing', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding()),
        });
        const router = new BindingBasedCallRouting(store, makeAgentConfigResolver());

        await router.resolveRouting(makeCtx({ to: '15559876543' }));

        expect(store.getBindingByE164).toHaveBeenCalledWith('+15559876543');
    });

    it('handles DID that already has + prefix', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding()),
        });
        const router = new BindingBasedCallRouting(store, makeAgentConfigResolver());

        await router.resolveRouting(makeCtx({ to: '+15559876543' }));

        expect(store.getBindingByE164).toHaveBeenCalledWith('+15559876543');
    });
});
