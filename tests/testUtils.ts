import type { Express } from 'express';
import type { Mock } from 'vitest';
import { vi } from 'vitest';

type SessionServiceMock = {
    createSession?: Mock;
    endSession?: Mock;
    cleanupSession?: Mock;
};

type TranscriptServiceMock = {
    saveFromObservability?: Mock;
    getBySessionId?: Mock;
    listByAgentId?: Mock;
    getAgentStats?: Mock;
    list?: Mock;
};

type SessionStoreMock = {
    get?: Mock;
    set?: Mock;
    has?: Mock;
    delete?: Mock;
    entries?: Mock;
};

type PagosAuthServiceMock = {
    resolveAuthContext?: Mock;
};

export function setRequiredEnv(overrides?: Record<string, string | undefined>) {
    process.env.LIVEKIT_URL = 'wss://example.livekit.invalid';
    process.env.LIVEKIT_API_KEY = 'test_api_key';
    process.env.LIVEKIT_API_SECRET = 'test_api_secret';
    process.env.PAGOS_API_URL = 'https://pagos-dev.test.studio.lyzr.ai';
    process.env.PAGOS_ADMIN_TOKEN = 'test_pagos_admin_token';
    process.env.PORT = '0';
    process.env.NODE_ENV = 'production';
    process.env.TELEPHONY_ENABLED = 'false';

    for (const [k, v] of Object.entries(overrides ?? {})) {
        if (v === undefined) {
            delete process.env[k];
        } else {
            process.env[k] = v;
        }
    }
}

export async function importFreshApp(options?: {
    env?: Record<string, string | undefined>;
    sessionServiceMock?: SessionServiceMock;
    transcriptServiceMock?: TranscriptServiceMock;
    sessionStoreMock?: SessionStoreMock;
    pagosAuthServiceMock?: PagosAuthServiceMock;
}): Promise<Express> {
    vi.resetModules();
    setRequiredEnv(options?.env);

    if (options?.sessionServiceMock || options?.transcriptServiceMock || options?.sessionStoreMock) {
        const createSession = options.sessionServiceMock.createSession ?? vi.fn();
        const endSession = options.sessionServiceMock.endSession ?? vi.fn();
        const cleanupSession = options.sessionServiceMock.cleanupSession ?? vi.fn();

        const saveFromObservability = options.transcriptServiceMock?.saveFromObservability ?? vi.fn();
        const getBySessionId = options.transcriptServiceMock?.getBySessionId ?? vi.fn();
        const listByAgentId = options.transcriptServiceMock?.listByAgentId ?? vi.fn();
        const getAgentStats = options.transcriptServiceMock?.getAgentStats ?? vi.fn();
        const list = options.transcriptServiceMock?.list ?? vi.fn();

        const sessionStore = {
            get: options.sessionStoreMock?.get ?? vi.fn(),
            set: options.sessionStoreMock?.set ?? vi.fn(),
            has: options.sessionStoreMock?.has ?? vi.fn(),
            delete: options.sessionStoreMock?.delete ?? vi.fn(),
            entries: options.sessionStoreMock?.entries ?? vi.fn().mockReturnValue([]),
        };

        const resolveAuthContext =
            options.pagosAuthServiceMock?.resolveAuthContext ??
            vi.fn().mockResolvedValue({
                orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
                userId: 'mem_test_user',
                role: 'owner',
                isAdmin: true,
            });

        vi.doMock('../dist/composition.js', () => ({
            services: {
                sessionService: { createSession, endSession, cleanupSession },
                transcriptService: {
                    saveFromObservability,
                    getBySessionId,
                    listByAgentId,
                    getAgentStats,
                    list,
                },
                sessionStore,
                pagosAuthService: { resolveAuthContext },
                agentRegistryService: {
                    listAgents: vi.fn().mockResolvedValue([]),
                    getAgent: vi.fn().mockResolvedValue(null),
                    createAgent: vi.fn(),
                    updateAgent: vi.fn(),
                    deleteAgent: vi.fn(),
                },
            },
        }));
    }

    const mod = await import('../dist/app.js');
    return mod.app as Express;
}
