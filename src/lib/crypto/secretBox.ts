import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION_PREFIX = 'v1';

export function encryptString(plaintext: string, key: Buffer): string {
    if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, encrypted]);
    return `${VERSION_PREFIX}.${payload.toString('base64url')}`;
}

export function decryptString(payload: string, key: Buffer): string {
    if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
    const parts = payload.split('.');
    if (parts.length !== 2 || parts[0] !== VERSION_PREFIX) {
        throw new Error('Invalid encrypted payload format');
    }
    const data = Buffer.from(parts[1], 'base64url');
    if (data.length < IV_LENGTH + TAG_LENGTH) {
        throw new Error('Encrypted payload too short');
    }
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function fingerprintSecret(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex');
}
