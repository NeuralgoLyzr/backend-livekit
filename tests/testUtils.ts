import type { Express } from 'express';
import type { Mock } from 'vitest';
import { vi } from 'vitest';

type SessionServiceMock = {
    createSession?: Mock;
    endSession?: Mock;
};

export function setRequiredEnv(overrides?: Record<string, string | undefined>) {
    process.env.LIVEKIT_URL = 'wss://example.livekit.invalid';
    process.env.LIVEKIT_API_KEY = 'test_api_key';
    process.env.LIVEKIT_API_SECRET = 'test_api_secret';
    process.env.PORT = '0';
    // Default to production to keep test output quiet (routes may override as needed).
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
}): Promise<Express> {
    vi.resetModules();
    setRequiredEnv(options?.env);

    if (options?.sessionServiceMock) {
        const createSession = options.sessionServiceMock.createSession ?? vi.fn();
        const endSession = options.sessionServiceMock.endSession ?? vi.fn();
        vi.doMock('../dist/services/sessionService.js', () => ({
            sessionService: { createSession, endSession },
        }));
    }

    const mod = await import('../dist/app.js');
    return mod.app as Express;
}
