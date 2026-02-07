/**
 * Ultravox dynamic model/voice fetching with caching.
 *
 * Currently unused — extracted here for future use.
 */

type RealtimeOption = {
    id: string;
    name: string;
};

type UltravoxListResponse<T> = {
    results: T[];
    next: string | null;
    previous?: string | null;
    total?: number;
};

type UltravoxApiModel = { name?: string };
type UltravoxApiVoice = { voiceId?: string; name?: string };

let ultravoxCache:
    | {
          fetchedAtMs: number;
          models: RealtimeOption[];
          voices: RealtimeOption[];
          warning?: string;
      }
    | undefined;

const ULTRAVOX_CACHE_TTL_MS = 5 * 60 * 1000;
const ULTRAVOX_FETCH_TIMEOUT_MS = 8000;
const ULTRAVOX_PAGE_SIZE = 200;
const ULTRAVOX_MAX_PAGES = 50;

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function extractCursor(nextUrl: string): string | undefined {
    try {
        const url = new URL(nextUrl);
        const cursor = url.searchParams.get('cursor');
        return cursor ? cursor : undefined;
    } catch {
        return undefined;
    }
}

async function fetchUltravoxAllPages<T>(
    endpoint: string,
    headers: Record<string, string>
): Promise<{ results: T[]; warning?: string }> {
    const out: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < ULTRAVOX_MAX_PAGES; page++) {
        const url = new URL(endpoint);
        url.searchParams.set('pageSize', String(ULTRAVOX_PAGE_SIZE));
        if (cursor) url.searchParams.set('cursor', cursor);

        const res = await fetchWithTimeout(url.toString(), { headers }, ULTRAVOX_FETCH_TIMEOUT_MS);
        if (!res.ok) {
            return {
                results: [],
                warning: `Ultravox fetch failed (${endpoint}, status=${res.status})`,
            };
        }

        const json = (await res.json().catch(() => null)) as UltravoxListResponse<T> | null;
        const pageResults = Array.isArray(json?.results) ? json!.results : [];
        out.push(...pageResults);

        const next = typeof json?.next === 'string' ? json.next : null;
        if (!next) break;

        const nextCursor = extractCursor(next);
        if (!nextCursor || nextCursor === cursor) {
            break;
        }
        cursor = nextCursor;
    }

    return { results: out };
}

export async function fetchUltravoxOptions(): Promise<{
    models: RealtimeOption[];
    voices: RealtimeOption[];
    warning?: string;
}> {
    const now = Date.now();
    if (ultravoxCache && now - ultravoxCache.fetchedAtMs < ULTRAVOX_CACHE_TTL_MS) {
        return ultravoxCache;
    }

    const apiKey = process.env.ULTRAVOX_API_KEY;
    if (!apiKey) {
        const empty = {
            fetchedAtMs: now,
            models: [],
            voices: [],
            warning: 'Missing ULTRAVOX_API_KEY; cannot fetch models/voices.',
        };
        ultravoxCache = empty;
        return empty;
    }

    try {
        const headers = { 'X-API-Key': apiKey };
        const [modelsPage, voicesPage] = await Promise.all([
            fetchUltravoxAllPages<UltravoxApiModel>(
                'https://api.ultravox.ai/api/models',
                headers
            ),
            fetchUltravoxAllPages<UltravoxApiVoice>(
                'https://api.ultravox.ai/api/voices',
                headers
            ),
        ]);

        const warning = modelsPage.warning || voicesPage.warning;

        const models = modelsPage.results
            .map((m) => {
                const name = String(m.name ?? '').trim();
                return { id: name, name };
            })
            .filter((m) => m.id && m.name);

        const voices = voicesPage.results
            .map((v) => {
                const id = String(v.voiceId ?? '').trim();
                const name = String(v.name ?? '').trim();
                return { id, name: name || id };
            })
            .filter((v) => v.id && v.name);

        const out = {
            fetchedAtMs: now,
            models,
            voices,
            warning,
        };
        ultravoxCache = out;
        return out;
    } catch (error) {
        const out = {
            fetchedAtMs: now,
            models: [],
            voices: [],
            warning: `Ultravox fetch error: ${String((error as Error)?.message ?? error)}`,
        };
        ultravoxCache = out;
        return out;
    }
}
