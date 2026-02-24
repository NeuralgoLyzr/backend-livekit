type CacheEntry<T> = { value: T; expiresAtMs: number };

function nowMs(): number {
    return Date.now();
}

export function createTtlCache<T>(deps: { ttlMs: number; maxEntries: number }) {
    const ttlMs = Math.max(Math.floor(deps.ttlMs), 500);
    const maxEntries = Math.max(Math.floor(deps.maxEntries), 50);
    const cache = new Map<string, CacheEntry<T>>();

    function pruneExpired(sampleSize: number): void {
        if (cache.size === 0) return;
        const now = nowMs();
        let scanned = 0;
        for (const [key, entry] of cache.entries()) {
            if (scanned >= sampleSize) break;
            scanned += 1;
            if (entry.expiresAtMs <= now) cache.delete(key);
        }
    }

    function ensureCapacity(): void {
        if (cache.size < maxEntries) return;
        pruneExpired(Math.min(cache.size, 256));
        while (cache.size >= maxEntries) {
            const it = cache.keys().next();
            if (it.done) break;
            cache.delete(it.value);
        }
    }

    return {
        get(key: string): T | undefined {
            const entry = cache.get(key);
            if (!entry) return undefined;
            if (entry.expiresAtMs <= nowMs()) {
                cache.delete(key);
                return undefined;
            }
            // LRU-ish: keep hot keys at the end.
            cache.delete(key);
            cache.set(key, entry);
            return entry.value;
        },
        set(key: string, value: T): void {
            ensureCapacity();
            cache.set(key, { value, expiresAtMs: nowMs() + ttlMs });
        },
        clear(): void {
            cache.clear();
        },
    };
}

