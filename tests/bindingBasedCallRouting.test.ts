import { describe, expect, it, vi } from 'vitest';
import { BindingBasedCallRouting } from '../src/telephony/routing/bindingBasedCallRouting.js';
import type { TelephonyBindingStorePort } from '../src/telephony/ports/telephonyBindingStorePort.js';
import type { CallRoutingContext } from '../src/telephony/types.js';

function makeBindingStore(overrides?: Partial<TelephonyBindingStorePort>): TelephonyBindingStorePort {
    return {
        upsertBinding: vi.fn().mockResolvedValue(null),
        getBindingByE164: vi.fn().mockResolvedValue(null),
        getBindingById: vi.fn().mockResolvedValue(null),
        listBindings: vi.fn().mockResolvedValue([]),
        disableBinding: vi.fn().mockResolvedValue(false),
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

const BOUND_AGENT_CONFIG = {
    prompt: 'You are the bound agent.',
    agent_name: 'Bound Agent',
};

function makeStoredBinding(overrides?: Record<string, unknown>) {
    return {
        id: 'binding-1',
        integrationId: 'int-1',
        provider: 'twilio',
        providerNumberId: 'pn-1',
        e164: '+15559876543',
        agentId: 'agent-1',
        agentConfig: BOUND_AGENT_CONFIG,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

describe('BindingBasedCallRouting', () => {
    it('returns the binding agentConfig when a matching binding is found', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding()),
        });
        const router = new BindingBasedCallRouting(store);

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig).toEqual({
            ...BOUND_AGENT_CONFIG,
            agent_id: 'agent-1',
        });
        expect(store.getBindingByE164).toHaveBeenCalledWith('+15559876543');
    });

    it('falls back to default routing when ctx.to is null', async () => {
        const store = makeBindingStore();
        const router = new BindingBasedCallRouting(store);

        const result = await router.resolveRouting(makeCtx({ to: null }));

        expect(store.getBindingByE164).not.toHaveBeenCalled();
        expect(result.agentConfig).toBeDefined();
        expect(result.agentConfig.prompt).toContain('helpful voice AI assistant');
    });

    it('falls back to default routing when no binding is found', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(null),
        });
        const router = new BindingBasedCallRouting(store);

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig.prompt).toContain('helpful voice AI assistant');
    });

    it('falls back when the binding is disabled', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding({ enabled: false })),
        });
        const router = new BindingBasedCallRouting(store);

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig.prompt).toContain('helpful voice AI assistant');
    });

    it('routes with agent_id when the binding has no agentConfig but has agentId', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding({ agentConfig: null })),
        });
        const router = new BindingBasedCallRouting(store);

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig).toEqual({
            agent_id: 'agent-1',
        });
    });

    it('falls back when the binding has neither agentConfig nor agentId', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi
                .fn()
                .mockResolvedValue(makeStoredBinding({ agentConfig: null, agentId: null })),
        });
        const router = new BindingBasedCallRouting(store);

        const result = await router.resolveRouting(makeCtx());

        expect(result.agentConfig.prompt).toContain('helpful voice AI assistant');
    });

    it('normalizes DID by adding + prefix when missing', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding()),
        });
        const router = new BindingBasedCallRouting(store);

        await router.resolveRouting(makeCtx({ to: '15559876543' }));

        expect(store.getBindingByE164).toHaveBeenCalledWith('+15559876543');
    });

    it('handles DID that already has + prefix', async () => {
        const store = makeBindingStore({
            getBindingByE164: vi.fn().mockResolvedValue(makeStoredBinding()),
        });
        const router = new BindingBasedCallRouting(store);

        await router.resolveRouting(makeCtx({ to: '+15559876543' }));

        expect(store.getBindingByE164).toHaveBeenCalledWith('+15559876543');
    });
});
