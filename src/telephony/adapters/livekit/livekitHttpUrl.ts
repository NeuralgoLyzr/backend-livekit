export function toLiveKitHttpUrl(livekitUrl: string): string {
    // Most server SDK clients accept ws(s) or http(s). SIP (Twirp) expects http(s).
    const trimmed = livekitUrl.trim();
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
    if (trimmed.startsWith('wss://')) return `https://${trimmed.slice('wss://'.length)}`;
    if (trimmed.startsWith('ws://')) return `http://${trimmed.slice('ws://'.length)}`;
    // Fallback: if user provided host without protocol, default to https.
    return `https://${trimmed}`;
}

