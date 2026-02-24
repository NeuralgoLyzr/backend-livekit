/**
 * Live integration tests for TelnyxClient against the real Telnyx API.
 *
 * Requires TELNYX_API_KEY in the environment.
 * Run with: pnpm test -- tests/telnyxLive.test.ts
 */

import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import {
    TelnyxClient,
    isTelnyxClientError,
} from '../dist/telephony/adapters/telnyx/telnyxClient.js';

const API_KEY = process.env.TELNYX_API_KEY || '';

describe.skipIf(!API_KEY)('TelnyxClient (live)', () => {
    const client = new TelnyxClient(API_KEY);

    // ── Credential validation ─────────────────────────────────────────────

    describe('credential validation', () => {
        it('verifies valid credentials', { timeout: 30_000 }, async () => {
            const result = await client.verifyCredentials();
            expect(result).toEqual({ valid: true });
        });

        it('rejects invalid credentials', { timeout: 30_000 }, async () => {
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
    });

    // ── Phone number listing ──────────────────────────────────────────────

    describe('phone number listing', () => {
        it('returns array with correct shape', { timeout: 30_000 }, async () => {
            const numbers = await client.listPhoneNumbers();
            expect(Array.isArray(numbers)).toBe(true);
            if (numbers.length > 0) {
                expect(numbers[0]).toHaveProperty('id');
                expect(numbers[0]).toHaveProperty('phone_number');
                expect(numbers[0]).toHaveProperty('status');
            }
        });
    });

    // ── FQDN connection listing ───────────────────────────────────────────

    describe('FQDN connection listing', () => {
        it('returns array with correct shape', { timeout: 30_000 }, async () => {
            const connections = await client.listFqdnConnections();
            expect(Array.isArray(connections)).toBe(true);
            for (const c of connections) {
                expect(c).toHaveProperty('id');
                expect(c).toHaveProperty('connection_name');
            }
        });
    });

    // ── FQDN connection lifecycle ─────────────────────────────────────────

    describe('FQDN connection lifecycle', () => {
        it(
            'creates, retrieves, and deletes a connection',
            { timeout: 30_000 },
            async () => {
                const name = `test-live-${Date.now()}`;
                const created = await client.createFqdnConnection(name);

                expect(created).toHaveProperty('id');
                expect(created.connection_name).toBe(name);

                try {
                    const fetched = await client.getFqdnConnection(created.id);
                    expect(fetched.id).toBe(created.id);
                    expect(fetched.connection_name).toBe(name);
                } finally {
                    await client.deleteFqdnConnection(created.id);
                }

                // Confirm deletion – should throw a 404 / PROVIDER_ERROR
                try {
                    await client.getFqdnConnection(created.id);
                    expect.fail('Should have thrown after deletion');
                } catch (err) {
                    expect(isTelnyxClientError(err)).toBe(true);
                }
            }
        );
    });

    // ── FQDN lifecycle ────────────────────────────────────────────────────

    describe('FQDN lifecycle', () => {
        it(
            'creates, lists, deletes an FQDN under a connection',
            { timeout: 30_000 },
            async () => {
                const connName = `test-live-${Date.now()}`;
                const conn = await client.createFqdnConnection(connName);

                try {
                    const host = `test-${Date.now()}.example.com`;
                    const fqdn = await client.createFqdn(host, conn.id);

                    expect(fqdn).toHaveProperty('id');
                    expect(fqdn.fqdn).toBe(host);
                    // Telnyx returns connection_id as a large integer that can
                    // lose precision during JSON parsing, so we only check it's truthy.
                    expect(fqdn.connection_id).toBeTruthy();

                    // Confirm it appears in the list
                    const listBefore = await client.listFqdns(conn.id);
                    expect(listBefore.some((f) => f.id === fqdn.id)).toBe(true);

                    // Delete the FQDN
                    await client.deleteFqdn(fqdn.id);

                    // Confirm removal
                    const listAfter = await client.listFqdns(conn.id);
                    expect(listAfter.some((f) => f.id === fqdn.id)).toBe(false);
                } finally {
                    await client.deleteFqdnConnection(conn.id);
                }
            }
        );
    });

    // ── Phone number assign/unassign lifecycle ────────────────────────────
    // Key regression test for the disconnect bug: verifies that unassign
    // actually clears connection_id back to null.

    describe('phone number assign/unassign lifecycle', () => {
        it(
            'assigns and unassigns a phone number to a connection',
            { timeout: 30_000 },
            async () => {
                const numbers = await client.listPhoneNumbers();
                if (numbers.length === 0) {
                    console.warn('No phone numbers on account – skipping assign/unassign test');
                    return;
                }

                const phone = numbers[0];
                const originalConnectionId = phone.connection_id;
                const connName = `test-live-${Date.now()}`;
                const conn = await client.createFqdnConnection(connName);

                try {
                    // Assign
                    await client.assignPhoneNumberToConnection(phone.id, conn.id);
                    const afterAssign = await client.getPhoneNumber(phone.id);
                    expect(afterAssign.connection_id).toBe(conn.id);

                    // Unassign
                    await client.unassignPhoneNumberFromConnection(phone.id);
                    const afterUnassign = await client.getPhoneNumber(phone.id);
                    // Telnyx may return null or "" after unassign; either means disconnected.
                    expect(afterUnassign.connection_id || null).toBeNull();
                } finally {
                    // Restore original connection if there was one
                    if (originalConnectionId) {
                        await client
                            .assignPhoneNumberToConnection(phone.id, originalConnectionId)
                            .catch(() => { });
                    }
                    await client.deleteFqdnConnection(conn.id).catch(() => { });
                }
            }
        );
    });

    // ── Transport protocol update ─────────────────────────────────────────

    describe('transport protocol update', () => {
        it(
            'updates transport to TLS and confirms via get',
            { timeout: 30_000 },
            async () => {
                const connName = `test-live-${Date.now()}`;
                const conn = await client.createFqdnConnection(connName);

                try {
                    await client.updateFqdnConnectionTransport(conn.id, 'TLS');
                    const details = await client.getFqdnConnection(conn.id);
                    expect(details.transport_protocol).toBe('TLS');
                } finally {
                    await client.deleteFqdnConnection(conn.id);
                }
            }
        );
    });

    // ── Error handling ────────────────────────────────────────────────────

    describe('error handling', () => {
        it('throws on getPhoneNumber with invalid ID', { timeout: 30_000 }, async () => {
            try {
                await client.getPhoneNumber('invalid-id-000');
                expect.fail('Should have thrown');
            } catch (err) {
                expect(isTelnyxClientError(err)).toBe(true);
            }
        });

        it('throws on getFqdnConnection with invalid ID', { timeout: 30_000 }, async () => {
            try {
                await client.getFqdnConnection('invalid-id-000');
                expect.fail('Should have thrown');
            } catch (err) {
                expect(isTelnyxClientError(err)).toBe(true);
            }
        });

        it(
            'throws on deleteFqdnConnection with invalid ID',
            { timeout: 30_000 },
            async () => {
                try {
                    await client.deleteFqdnConnection('invalid-id-000');
                    expect.fail('Should have thrown');
                } catch (err) {
                    expect(isTelnyxClientError(err)).toBe(true);
                }
            }
        );
    });
});
