import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { setRequiredEnv } from './testUtils';

describe('secretBox', () => {
    const validKey = randomBytes(32);

    describe('encryptString / decryptString', () => {
        it('round-trips: decrypt(encrypt(x)) === x', async () => {
            setRequiredEnv();
            const { encryptString, decryptString } = await import(
                '../dist/lib/crypto/secretBox.js'
            );
            const original = 'hello world — 🎉';
            const encrypted = encryptString(original, validKey);
            const decrypted = decryptString(encrypted, validKey);
            expect(decrypted).toBe(original);
        });

        it('payload format starts with "v1."', async () => {
            setRequiredEnv();
            const { encryptString } = await import('../dist/lib/crypto/secretBox.js');
            const encrypted = encryptString('test', validKey);
            expect(encrypted.startsWith('v1.')).toBe(true);
        });

        it('throws when decrypting with the wrong key', async () => {
            setRequiredEnv();
            const { encryptString, decryptString } = await import(
                '../dist/lib/crypto/secretBox.js'
            );
            const encrypted = encryptString('secret', validKey);
            const wrongKey = randomBytes(32);
            expect(() => decryptString(encrypted, wrongKey)).toThrow();
        });

        it('throws on invalid payload format', async () => {
            setRequiredEnv();
            const { decryptString } = await import('../dist/lib/crypto/secretBox.js');
            expect(() => decryptString('bad-payload', validKey)).toThrow(
                'Invalid encrypted payload format'
            );
            expect(() => decryptString('v2.abc', validKey)).toThrow(
                'Invalid encrypted payload format'
            );
        });

        it('throws when key length is not 32 bytes', async () => {
            setRequiredEnv();
            const { encryptString, decryptString } = await import(
                '../dist/lib/crypto/secretBox.js'
            );
            const shortKey = randomBytes(16);
            expect(() => encryptString('x', shortKey)).toThrow(
                'Encryption key must be 32 bytes'
            );
            expect(() => decryptString('v1.abc', shortKey)).toThrow(
                'Encryption key must be 32 bytes'
            );
        });
    });

    describe('fingerprintSecret', () => {
        it('returns a 64-char hex SHA-256 digest', async () => {
            setRequiredEnv();
            const { fingerprintSecret } = await import('../dist/lib/crypto/secretBox.js');
            const hash = fingerprintSecret('my-secret');
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('produces deterministic output', async () => {
            setRequiredEnv();
            const { fingerprintSecret } = await import('../dist/lib/crypto/secretBox.js');
            expect(fingerprintSecret('abc')).toBe(fingerprintSecret('abc'));
        });
    });
});
