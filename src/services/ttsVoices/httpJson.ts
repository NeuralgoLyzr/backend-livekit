import { HttpError } from '../../lib/httpErrors.js';

export type HttpJsonDeps = {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
};

function truncate(value: string, max = 200): string {
    if (value.length <= max) return value;
    return value.slice(0, max) + '...';
}

export async function httpGetJson(
    url: string,
    init: Omit<RequestInit, 'method'> & { headers?: Record<string, string> },
    deps?: HttpJsonDeps
): Promise<unknown> {
    const timeoutMs = Math.max(Math.floor(deps?.timeoutMs ?? 12_000), 500);
    const fetchImpl = deps?.fetchImpl ?? fetch;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
        response = await fetchImpl(url, {
            method: 'GET',
            ...init,
            headers: init.headers
                ? { accept: 'application/json', ...init.headers }
                : { accept: 'application/json' },
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new HttpError(502, 'Upstream request timed out');
        }
        throw new HttpError(502, 'Unable to reach upstream provider', {
            reason: error instanceof Error ? error.message : String(error),
        });
    } finally {
        clearTimeout(timeout);
    }

    const text = await response.text().catch(() => '');
    const payload = text ? (() => {
        try {
            return JSON.parse(text) as unknown;
        } catch {
            return null;
        }
    })() : null;

    if (response.ok) return payload;

    throw new HttpError(502, `Upstream request failed (${response.status})`, {
        urlHost: new URL(url).host,
        status: response.status,
        bodySnippet: truncate(text),
    });
}

