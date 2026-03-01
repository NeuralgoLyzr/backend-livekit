/**
 * Live integration tests for PlivoClient against the real Plivo API.
 *
 * Requires PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN in the environment.
 * Run with: pnpm test:plivo-live
 */

import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import {
    PlivoClient,
    isPlivoClientError,
} from '../src/telephony/adapters/plivo/plivoClient.js';

const AUTH_ID = process.env.PLIVO_AUTH_ID || '';
const AUTH_TOKEN = process.env.PLIVO_AUTH_TOKEN || '';
const LIVEKIT_SIP_HOST = process.env.LIVEKIT_SIP_HOST || 'sip.livekit.cloud';
const PUBLIC_ORIGINATION_URI = normalizeOriginationUriValue(LIVEKIT_SIP_HOST);

describe.skipIf(!AUTH_ID || !AUTH_TOKEN)('PlivoClient (live)', () => {
    const client = new PlivoClient({ authId: AUTH_ID, authToken: AUTH_TOKEN });

    describe('credential validation', () => {
        it(
            'valid credentials returns { valid: true }',
            { timeout: 30_000 },
            async () => {
                const result = await client.verifyCredentials();
                expect(result).toEqual({ valid: true });
            }
        );

        it(
            'invalid auth token throws AUTH_INVALID',
            { timeout: 30_000 },
            async () => {
                const bad = new PlivoClient({ authId: AUTH_ID, authToken: 'invalid_token_12345' });
                try {
                    await bad.verifyCredentials();
                    expect.fail('Should have thrown');
                } catch (err) {
                    expect(isPlivoClientError(err)).toBe(true);
                    if (isPlivoClientError(err)) {
                        expect(err.code).toBe('AUTH_INVALID');
                    }
                }
            }
        );
    });

    describe('phone number listing', () => {
        it(
            'list returns an array with correct shape',
            { timeout: 30_000 },
            async () => {
                const numbers = await client.listPhoneNumbers();
                expect(Array.isArray(numbers)).toBe(true);
                if (numbers.length > 0) {
                    const first = numbers[0];
                    expect(first).toHaveProperty('number');
                    expect(typeof first.number).toBe('string');
                }
            }
        );
    });

    describe('trunk lifecycle', () => {
        it(
            'create → list confirms → delete',
            { timeout: 30_000 },
            async () => {
                const name = `test-live-${Date.now()}`;
                const { id: uriId } = await client.createOriginationUri({
                    name: `uri-${Date.now()}`,
                    uri: PUBLIC_ORIGINATION_URI,
                });
                const { trunkId } = await client.createInboundTrunk(name, uriId);
                expect(trunkId).toBeTruthy();

                try {
                    const trunks = await client.listInboundTrunks();
                    const found = trunks.find((t) => t.trunkId === trunkId);
                    expect(found).toBeDefined();
                    expect(found?.name).toBe(name);
                } finally {
                    await client.deleteInboundTrunk(trunkId);
                    await client.deleteOriginationUri(uriId);
                }
            }
        );
    });

    describe('origination URI lifecycle', () => {
        it(
            'create origination URI → list confirms → delete uri',
            { timeout: 30_000 },
            async () => {
                const uri = PUBLIC_ORIGINATION_URI;
                const { id } = await client.createOriginationUri({
                    name: `orig-${Date.now()}`,
                    uri,
                });
                expect(id).toBeTruthy();

                try {
                    const uris = await client.listOriginationUris();
                    const found = uris.find((u) => u.id === id);
                    expect(found).toBeDefined();
                    expect(found?.host).toBe(extractHostForAssertion(uri));
                } finally {
                    await client.deleteOriginationUri(id);
                }
            }
        );
    });

    describe('error handling', () => {
        it(
            'getPhoneNumber with invalid id throws',
            { timeout: 30_000 },
            async () => {
                try {
                    await client.getPhoneNumber('+10000000000');
                    expect.fail('Should have thrown');
                } catch (err) {
                    expect(isPlivoClientError(err)).toBe(true);
                    if (isPlivoClientError(err)) {
                        expect(err.status).toBeGreaterThanOrEqual(400);
                    }
                }
            }
        );
    });
});

function normalizeOriginationUriValue(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return 'sip.livekit.cloud';
    return trimmed.replace(/^sip:/i, '');
}

function extractHostForAssertion(input: string): string {
    const lower = input.toLowerCase().replace(/^sip:/, '');
    const withoutQuery = lower.split('?')[0] ?? lower;
    const withoutParams = withoutQuery.split(';')[0] ?? withoutQuery;
    const hostWithMaybePort = (withoutParams.split('@').pop() ?? withoutParams).trim();
    if (/:[0-9]+$/.test(hostWithMaybePort)) {
        return hostWithMaybePort.replace(/:[0-9]+$/, '').trim();
    }
    return hostWithMaybePort;
}
