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

type SessionTraceServiceMock = {
    listBySession?: Mock;
    getBySessionAndTraceId?: Mock;
};

type AudioStorageServiceMock = {
    save?: Mock;
    get?: Mock;
};

type AgentRegistryServiceMock = {
    listAgents?: Mock;
    getAgent?: Mock;
    listAgentVersions?: Mock;
    createAgent?: Mock;
    updateAgent?: Mock;
    activateAgentVersion?: Mock;
    deleteAgent?: Mock;
    listAgentShares?: Mock;
    shareAgent?: Mock;
    unshareAgent?: Mock;
};

export function setRequiredEnv(overrides?: Record<string, string | undefined>) {
    process.env.LIVEKIT_URL = 'wss://example.livekit.invalid';
    process.env.LIVEKIT_API_KEY = 'test_api_key';
    process.env.LIVEKIT_API_SECRET = 'test_api_secret';
    process.env.PAGOS_API_URL = 'https://pagos-dev.test.studio.lyzr.ai';
    process.env.PAGOS_ADMIN_TOKEN = 'test_pagos_admin_token';
    process.env.PORT = '0';
    process.env.APP_ENV = 'production';
    process.env.NODE_ENV = 'production';
    process.env.TELEPHONY_ENABLED = 'false';
    process.env.SESSION_STORE_PROVIDER = 'local';
    delete process.env.REDIS_URL;
    delete process.env.REDIS_SESSION_KEY_PREFIX;
    delete process.env.REDIS_SESSION_TTL_SECONDS;
    process.env.RECORDING_STORAGE_PROVIDER = 'local';
    delete process.env.RECORDINGS_DIR;
    delete process.env.S3_RECORDINGS_BUCKET;
    delete process.env.S3_REGION;
    delete process.env.S3_RECORDINGS_KEY_PREFIX;
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_FORCE_PATH_STYLE;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_SESSION_TOKEN;

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
    sessionTraceServiceMock?: SessionTraceServiceMock;
    audioStorageServiceMock?: AudioStorageServiceMock;
    agentRegistryServiceMock?: AgentRegistryServiceMock;
}): Promise<Express> {
    vi.resetModules();
    vi.doUnmock('../src/composition.ts');
    setRequiredEnv(options?.env);

    if (
        options?.sessionServiceMock ||
        options?.transcriptServiceMock ||
        options?.sessionStoreMock ||
        options?.sessionTraceServiceMock ||
        options?.audioStorageServiceMock ||
        options?.agentRegistryServiceMock
    ) {
        const createSession = options.sessionServiceMock?.createSession ?? vi.fn();
        const endSession = options.sessionServiceMock?.endSession ?? vi.fn();
        const cleanupSession = options.sessionServiceMock?.cleanupSession ?? vi.fn();

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

        const listBySession = options.sessionTraceServiceMock?.listBySession ?? vi.fn();
        const getBySessionAndTraceId =
            options.sessionTraceServiceMock?.getBySessionAndTraceId ?? vi.fn();
        const saveAudioRecording = options.audioStorageServiceMock?.save ?? vi.fn();
        const getAudio = options.audioStorageServiceMock?.get ?? vi.fn();

        const listAgents = options.agentRegistryServiceMock?.listAgents ?? vi.fn().mockResolvedValue([]);
        const getAgent = options.agentRegistryServiceMock?.getAgent ?? vi.fn().mockResolvedValue(null);
        const listAgentVersions =
            options.agentRegistryServiceMock?.listAgentVersions ?? vi.fn().mockResolvedValue([]);
        const createAgent = options.agentRegistryServiceMock?.createAgent ?? vi.fn();
        const updateAgent = options.agentRegistryServiceMock?.updateAgent ?? vi.fn();
        const activateAgentVersion =
            options.agentRegistryServiceMock?.activateAgentVersion ?? vi.fn();
        const deleteAgent = options.agentRegistryServiceMock?.deleteAgent ?? vi.fn();
        const listAgentShares = options.agentRegistryServiceMock?.listAgentShares ?? vi.fn();
        const shareAgent = options.agentRegistryServiceMock?.shareAgent ?? vi.fn();
        const unshareAgent = options.agentRegistryServiceMock?.unshareAgent ?? vi.fn();

        vi.doMock('../src/composition.ts', () => ({
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
                sessionTraceService: { listBySession, getBySessionAndTraceId },
                audioStorageService: { save: saveAudioRecording, get: getAudio },
                agentRegistryService: {
                    listAgents,
                    getAgent,
                    listAgentVersions,
                    createAgent,
                    updateAgent,
                    activateAgentVersion,
                    deleteAgent,
                    listAgentShares,
                    shareAgent,
                    unshareAgent,
                },
            },
        }));
    }

    const mod = await import('../src/app.ts');
    return mod.app;
}
