/**
 * Live integration tests for TelnyxClient against the real Telnyx API.
 *
 * Requires TELNYX_API_KEY in the environment.
 * Run with: pnpm test -- tests/telnyxLive.test.ts
 */

import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { TelnyxClient, isTelnyxClientError } from '../dist/telephony/adapters/telnyx/telnyxClient.js';

const API_KEY = process.env.TELNYX_API_KEY || '';

describe.skipIf(!API_KEY)('TelnyxClient (live)', () => {
    const client = new TelnyxClient(API_KEY);

    it('verifies valid credentials', async () => {
        const result = await client.verifyCredentials();
        expect(result).toEqual({ valid: true });
    });

    it('rejects invalid credentials', async () => {
        const bad = new TelnyxClient('KEY_invalid_key_12345');
        try {
            await bad.verifyCredentials();
            expect.fail('Should have thrown');
        } catch (err) {
            expect(isTelnyxClientError(err)).toBe(true);
            if (isTelnyxClientError(err)) {
                expect(err.code).toBe('AUTH_INVALID');
            }
        }
    });

    it('lists phone numbers', async () => {
        const numbers = await client.listPhoneNumbers();
        expect(Array.isArray(numbers)).toBe(true);
        if (numbers.length > 0) {
            expect(numbers[0]).toHaveProperty('id');
            expect(numbers[0]).toHaveProperty('phone_number');
            expect(numbers[0]).toHaveProperty('status');
        }
    });

    it('lists FQDN connections', async () => {
        const connections = await client.listFqdnConnections();
        expect(Array.isArray(connections)).toBe(true);
        for (const c of connections) {
            expect(c).toHaveProperty('id');
            expect(c).toHaveProperty('connection_name');
        }
    });
});
