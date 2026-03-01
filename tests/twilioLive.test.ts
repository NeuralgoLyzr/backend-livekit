/**
 * Live integration tests for TwilioClient against the real Twilio API.
 *
 * Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in the environment.
 * Run with: pnpm test -- tests/twilioLive.test.ts
 */

import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import {
    TwilioClient,
    isTwilioClientError,
} from '../src/telephony/adapters/twilio/twilioClient.js';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

describe.skipIf(!ACCOUNT_SID || !AUTH_TOKEN)('TwilioClient (live)', () => {
    const client = new TwilioClient({ accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN });

    // ── Credential validation ────────────────────────────────────────────

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
                const bad = new TwilioClient({
                    accountSid: ACCOUNT_SID,
                    authToken: 'invalid_token_12345',
                });
                try {
                    await bad.verifyCredentials();
                    expect.fail('Should have thrown');
                } catch (err) {
                    expect(isTwilioClientError(err)).toBe(true);
                    if (isTwilioClientError(err)) {
                        expect(err.code).toBe('AUTH_INVALID');
                    }
                }
            }
        );
    });

    // ── Phone number listing ─────────────────────────────────────────────

    describe('phone number listing', () => {
        it(
            'list returns an array with correct shape',
            { timeout: 30_000 },
            async () => {
                const numbers = await client.listIncomingPhoneNumbers();
                expect(Array.isArray(numbers)).toBe(true);
                if (numbers.length > 0) {
                    const first = numbers[0];
                    expect(first).toHaveProperty('sid');
                    expect(first).toHaveProperty('phoneNumber');
                    expect(typeof first.sid).toBe('string');
                    expect(typeof first.phoneNumber).toBe('string');
                }
            }
        );
    });

    // ── Trunk lifecycle ──────────────────────────────────────────────────

    describe('trunk lifecycle', () => {
        it(
            'create → list confirms → delete',
            { timeout: 30_000 },
            async () => {
                const suffix = Date.now();
                const friendlyName = `test-live-${suffix}`;
                const domainName = `test-live-${suffix}.pstn.twilio.com`;

                const { sid: trunkSid } = await client.createTrunk({ friendlyName, domainName });
                expect(trunkSid).toBeTruthy();

                try {
                    const trunks = await client.listTrunks();
                    const found = trunks.find((t) => t.sid === trunkSid);
                    expect(found).toBeDefined();
                    expect(found!.friendlyName).toBe(friendlyName);
                    expect(found!.domainName).toBe(domainName);
                } finally {
                    await client.deleteTrunk(trunkSid);
                }
            }
        );
    });

    // ── Origination URL lifecycle ────────────────────────────────────────

    describe('origination URL lifecycle', () => {
        it(
            'create trunk → create origination URL → list confirms → delete trunk cleans up',
            { timeout: 30_000 },
            async () => {
                const suffix = Date.now();
                const { sid: trunkSid } = await client.createTrunk({
                    friendlyName: `test-orig-${suffix}`,
                    domainName: `test-orig-${suffix}.pstn.twilio.com`,
                });

                try {
                    const sipUrl = `sip:test-${suffix}.example.com`;
                    const { sid: origSid } = await client.createOriginationUrl(trunkSid, {
                        sipUrl,
                        friendlyName: `test-orig-url-${suffix}`,
                        enabled: true,
                    });
                    expect(origSid).toBeTruthy();

                    const urls = await client.listOriginationUrls(trunkSid);
                    const found = urls.find((u) => u.sid === origSid);
                    expect(found).toBeDefined();
                    expect(found!.sipUrl).toBe(sipUrl);
                    expect(found!.enabled).toBe(true);
                } finally {
                    await client.deleteTrunk(trunkSid);
                }
            }
        );
    });

    // ── Phone number attach/detach lifecycle ─────────────────────────────

    describe('phone number attach/detach lifecycle', () => {
        it(
            'attach → listTrunkPhoneNumbers confirms → detach → confirms removed',
            { timeout: 30_000 },
            async () => {
                const numbers = await client.listIncomingPhoneNumbers();
                if (numbers.length === 0) {
                    console.log('Skipping attach/detach test: no phone numbers on account');
                    return;
                }

                const phoneNumberSid = numbers[0].sid;
                const suffix = Date.now();
                const { sid: trunkSid } = await client.createTrunk({
                    friendlyName: `test-attach-${suffix}`,
                    domainName: `test-attach-${suffix}.pstn.twilio.com`,
                });

                try {
                    // Attach
                    await client.attachPhoneNumberToTrunk(trunkSid, phoneNumberSid);

                    const afterAttach = await client.listTrunkPhoneNumbers(trunkSid);
                    const attached = afterAttach.find((p) => p.sid === phoneNumberSid);
                    expect(attached).toBeDefined();

                    // Detach
                    await client.detachPhoneNumberFromTrunk(trunkSid, phoneNumberSid);

                    const afterDetach = await client.listTrunkPhoneNumbers(trunkSid);
                    const detached = afterDetach.find((p) => p.sid === phoneNumberSid);
                    expect(detached).toBeUndefined();
                } finally {
                    await client.deleteTrunk(trunkSid);
                }
            }
        );
    });

    // ── Error handling ───────────────────────────────────────────────────

    describe('error handling', () => {
        it(
            'getIncomingPhoneNumber with invalid SID throws',
            { timeout: 30_000 },
            async () => {
                try {
                    await client.getIncomingPhoneNumber('PN_INVALID_SID_12345');
                    expect.fail('Should have thrown');
                } catch (err) {
                    expect(isTwilioClientError(err)).toBe(true);
                    if (isTwilioClientError(err)) {
                        expect(err.status).toBeGreaterThanOrEqual(400);
                    }
                }
            }
        );

        it(
            'deleteTrunk with invalid SID throws',
            { timeout: 30_000 },
            async () => {
                try {
                    await client.deleteTrunk('TK_INVALID_SID_12345');
                    expect.fail('Should have thrown');
                } catch (err) {
                    expect(isTwilioClientError(err)).toBe(true);
                    if (isTwilioClientError(err)) {
                        expect(err.status).toBeGreaterThanOrEqual(400);
                    }
                }
            }
        );
    });
});
