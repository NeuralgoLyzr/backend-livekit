import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPagosAuthService } from '../src/services/pagosAuthService.js';

function okJson(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

describe('pagosAuthService cache behavior', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('returns 401 on missing x-api-key without calling fetch', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const svc = createPagosAuthService({
            pagosApiUrl: 'https://pagos.test',
            pagosAdminToken: 'admin-token',
        });

        await expect(svc.resolveAuthContext('')).rejects.toMatchObject({ status: 401 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reuses cached auth context for repeated key lookups', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            okJson({
                org_id: '96f0cee4-bb87-4477-8eff-577ef2780614',
                policy: { user_id: 'user_1', role: 'owner' },
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const svc = createPagosAuthService({
            pagosApiUrl: 'https://pagos.test',
            pagosAdminToken: 'admin-token',
            cacheTtlMs: 60_000,
            timeoutMs: 5_000,
            maxCacheEntries: 10,
        });

        const first = await svc.resolveAuthContext('key-1');
        const second = await svc.resolveAuthContext('key-1');

        expect(first).toEqual(second);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('evicts oldest entries when cache reaches max size', async () => {
        const fetchMock = vi.fn().mockImplementation(async (input: string | URL | Request) => {
            const rawUrl =
                typeof input === 'string'
                    ? input
                    : input instanceof URL
                      ? input.toString()
                      : input.url;
            const apiKey = new URL(rawUrl).searchParams.get('api_key') ?? 'missing';

            return okJson({
                org_id: '96f0cee4-bb87-4477-8eff-577ef2780614',
                policy: { user_id: `user_${apiKey}`, role: 'owner' },
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const svc = createPagosAuthService({
            pagosApiUrl: 'https://pagos.test',
            pagosAdminToken: 'admin-token',
            cacheTtlMs: 60_000,
            timeoutMs: 5_000,
            maxCacheEntries: 100,
        });

        const uniqueKeys = Array.from({ length: 120 }, (_, i) => `key-${i}`);
        for (const key of uniqueKeys) {
            await svc.resolveAuthContext(key);
        }

        // Oldest key should have been evicted and fetched again.
        await svc.resolveAuthContext('key-0');

        expect(fetchMock).toHaveBeenCalledTimes(121);
    });
});

