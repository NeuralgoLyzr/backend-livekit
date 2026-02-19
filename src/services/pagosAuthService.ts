import { HttpError } from '../lib/httpErrors.js';
import { logger } from '../lib/logger.js';

export type PagosRole = string;

export type AuthContext = {
    orgId: string;
    userId: string;
    role: PagosRole;
    isAdmin: boolean;
};

export interface PagosAuthService {
    resolveAuthContext(apiKey: string): Promise<AuthContext>;
}

const ADMIN_ROLES = new Set(['role_owner', 'role_admin', 'owner', 'admin']);

function isAdminRole(role: string): boolean {
    return ADMIN_ROLES.has((role || '').trim().toLowerCase());
}

type CacheEntry = { value: AuthContext; expiresAtMs: number };

function nowMs(): number {
    return Date.now();
}

function buildKeysUserUrl(baseUrl: string, apiKey: string): string {
    const url = new URL(baseUrl.replace(/\/+$/, '') + '/api/v1/keys/user');
    url.searchParams.set('api_key', apiKey);
    return url.toString();
}

type PagosKeysUserResponse = {
    org_id?: unknown;
    policy?: {
        user_id?: unknown;
        role?: unknown;
    };
    user?: {
        user_id?: unknown;
    };
};

function parsePagosAuthContext(payload: unknown): { orgId: string; userId: string; role: string } {
    if (!payload || typeof payload !== 'object') {
        throw new HttpError(502, 'Invalid Pagos response');
    }

    const p = payload as PagosKeysUserResponse;
    const orgId = typeof p.org_id === 'string' ? p.org_id.trim() : '';
    const userId =
        typeof p.policy?.user_id === 'string'
            ? p.policy.user_id.trim()
            : typeof p.user?.user_id === 'string'
                ? p.user.user_id.trim()
                : '';
    const role = typeof p.policy?.role === 'string' ? p.policy.role.trim() : '';

    if (!orgId) throw new HttpError(502, 'Pagos response missing org_id');
    if (!userId) throw new HttpError(502, 'Pagos response missing policy.user_id');
    if (!role) throw new HttpError(502, 'Pagos response missing policy.role');

    return { orgId, userId, role };
}

export interface CreatePagosAuthServiceDeps {
    pagosApiUrl: string;
    pagosAdminToken: string;
    /**
     * TTL for successful apiKey -> auth context resolution.
     */
    cacheTtlMs?: number;
    /**
     * Request timeout (includes DNS + connect + response body).
     */
    timeoutMs?: number;
    /**
     * Maximum number of cached apiKey -> auth context entries (process-local).
     */
    maxCacheEntries?: number;
}

export function createPagosAuthService(deps: CreatePagosAuthServiceDeps): PagosAuthService {
    const cache = new Map<string, CacheEntry>();
    const cacheTtlMs = Math.max(deps.cacheTtlMs ?? 10 * 60 * 1000, 5_000);
    const timeoutMs = Math.max(deps.timeoutMs ?? 30_000, 500);
    const maxCacheEntries = Math.max(Math.floor(deps.maxCacheEntries ?? 2_000), 100);

    function pruneExpiredEntries(maxToScan: number): void {
        if (cache.size === 0 || maxToScan <= 0) return;

        let scanned = 0;
        const now = nowMs();
        for (const [key, entry] of cache.entries()) {
            if (scanned >= maxToScan) break;
            scanned += 1;
            if (entry.expiresAtMs <= now) {
                cache.delete(key);
            }
        }
    }

    function ensureCacheCapacity(): void {
        if (cache.size < maxCacheEntries) return;

        // Opportunistically prune a bounded sample first; if still over capacity,
        // evict oldest entries (Map preserves insertion order).
        pruneExpiredEntries(Math.min(cache.size, 256));

        while (cache.size >= maxCacheEntries) {
            const it = cache.keys().next();
            if (it.done) break;
            cache.delete(it.value);
        }
    }

    async function resolveAuthContext(apiKey: string): Promise<AuthContext> {
        const normalizedKey = (apiKey || '').trim();
        if (!normalizedKey) {
            throw new HttpError(401, 'Missing x-api-key');
        }

        const cached = cache.get(normalizedKey);
        if (cached) {
            if (cached.expiresAtMs > nowMs()) {
                // Keep hot keys at the end (LRU-style on reads).
                cache.delete(normalizedKey);
                cache.set(normalizedKey, cached);
                return cached.value;
            }
            cache.delete(normalizedKey);
        }

        const url = buildKeysUserUrl(deps.pagosApiUrl, normalizedKey);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    accept: 'application/json',
                    Authorization: `Bearer ${deps.pagosAdminToken}`,
                },
                signal: controller.signal,
            });

            if (!res.ok) {
                const snippet = await res.text().catch(() => '');
                logger.warn(
                    {
                        event: 'pagos_auth_lookup_failed',
                        status: res.status,
                        urlHost: new URL(url).host,
                        bodySnippet: snippet.slice(0, 200),
                    },
                    'Pagos key lookup failed'
                );
                // Treat as invalid key for 4xx, upstream error otherwise.
                if (res.status >= 400 && res.status < 500) {
                    throw new HttpError(401, 'Invalid x-api-key');
                }
                throw new HttpError(502, 'Failed to resolve org from Pagos');
            }

            const payload: unknown = await res.json().catch(() => null);
            const parsed = parsePagosAuthContext(payload);
            const ctx: AuthContext = {
                orgId: parsed.orgId,
                userId: parsed.userId,
                role: parsed.role,
                isAdmin: isAdminRole(parsed.role),
            };

            ensureCacheCapacity();
            cache.set(normalizedKey, { value: ctx, expiresAtMs: nowMs() + cacheTtlMs });
            return ctx;
        } catch (err) {
            if (err instanceof HttpError) throw err;
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn({ event: 'pagos_auth_lookup_error', err: msg }, 'Pagos auth lookup errored');
            throw new HttpError(502, 'Failed to resolve org from Pagos');
        } finally {
            clearTimeout(timeout);
        }
    }

    return { resolveAuthContext };
}
