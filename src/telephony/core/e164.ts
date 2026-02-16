const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function normalizeE164(input: string): string {
    const trimmed = input.trim();
    if (trimmed.length === 0) return trimmed;
    const withPlus = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
    return withPlus;
}

export function isValidE164(input: string): boolean {
    return E164_REGEX.test(input);
}
