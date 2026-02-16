import { normalizeE164 } from './e164.js';

export function extractSipFromTo(attrs?: Record<string, string>): {
    from: string | null;
    to: string | null;
} {
    if (!attrs) return { from: null, to: null };
    const rawFrom = attrs['sip.phoneNumber'] ?? null;
    const rawTo = attrs['sip.trunkPhoneNumber'] ?? null;
    return {
        from: typeof rawFrom === 'string' && rawFrom.length > 0 ? normalizeE164(rawFrom) : null,
        to: typeof rawTo === 'string' && rawTo.length > 0 ? normalizeE164(rawTo) : null,
    };
}
