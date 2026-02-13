import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    TelnyxClient,
    isTelnyxClientError,
    type TelnyxClientError,
} from '../dist/telephony/adapters/telnyx/telnyxClient.js';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function errorResponse(status: number, detail = 'error'): Response {
    return new Response(JSON.stringify({ errors: [{ detail }] }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('TelnyxClient', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
    });

    // ── verifyCredentials ─────────────────────────────────────────────

    it('verifyCredentials returns { valid: true } on 200', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ data: [], meta: { page_number: 1, total_pages: 1 } })
        );

        const client = new TelnyxClient('key_test');
        const result = await client.verifyCredentials();

        expect(result).toEqual({ valid: true });
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.telnyx.com/v2/phone_numbers?page[size]=1',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('verifyCredentials throws AUTH_INVALID on 401', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'));

        const client = new TelnyxClient('bad_key');
        try {
            await client.verifyCredentials();
            expect.fail('should have thrown');
        } catch (err) {
            expect(isTelnyxClientError(err)).toBe(true);
            expect((err as TelnyxClientError).code).toBe('AUTH_INVALID');
            expect((err as TelnyxClientError).status).toBe(401);
        }
    });

    // ── listPhoneNumbers ──────────────────────────────────────────────

    it('listPhoneNumbers parses response correctly', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                data: [
                    {
                        id: 'pn_1',
                        phone_number: '+15551234567',
                        status: 'active',
                        connection_id: 'conn_1',
                        connection_name: 'My Conn',
                    },
                ],
                meta: { page_number: 1, total_pages: 1 },
            })
        );

        const client = new TelnyxClient('key_test');
        const numbers = await client.listPhoneNumbers();

        expect(numbers).toEqual([
            {
                id: 'pn_1',
                phone_number: '+15551234567',
                status: 'active',
                connection_id: 'conn_1',
                connection_name: 'My Conn',
            },
        ]);
    });

    it('listPhoneNumbers handles pagination across 2 pages', async () => {
        fetchMock
            .mockResolvedValueOnce(
                jsonResponse({
                    data: [
                        {
                            id: 'pn_1',
                            phone_number: '+15551111111',
                            status: 'active',
                            connection_id: null,
                            connection_name: null,
                        },
                    ],
                    meta: { page_number: 1, total_pages: 2 },
                })
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    data: [
                        {
                            id: 'pn_2',
                            phone_number: '+15552222222',
                            status: 'active',
                            connection_id: null,
                            connection_name: null,
                        },
                    ],
                    meta: { page_number: 2, total_pages: 2 },
                })
            );

        const client = new TelnyxClient('key_test');
        const numbers = await client.listPhoneNumbers();

        expect(numbers).toHaveLength(2);
        expect(numbers[0].id).toBe('pn_1');
        expect(numbers[1].id).toBe('pn_2');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // ── createFqdnConnection ──────────────────────────────────────────

    it('createFqdnConnection sends correct body', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                data: { id: 'conn_123', connection_name: 'my-conn' },
            })
        );

        const client = new TelnyxClient('key_test');
        const result = await client.createFqdnConnection('my-conn');

        expect(result).toEqual({ id: 'conn_123', connection_name: 'my-conn' });

        const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
        const sentBody = JSON.parse(opts.body as string);
        expect(sentBody).toEqual({
            connection_name: 'my-conn',
            active: true,
            inbound: {
                ani_number_format: '+E.164',
                dnis_number_format: '+e164',
            },
        });
    });

    it('unassignPhoneNumberFromConnection sends null connection_id', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 'pn_1' } }));

        const client = new TelnyxClient('key_test');
        await client.unassignPhoneNumberFromConnection('pn_1');

        const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.telnyx.com/v2/phone_numbers/pn_1');
        expect(opts.method).toBe('PATCH');
        expect(JSON.parse(String(opts.body))).toEqual({ connection_id: null });
    });

    it('deleteFqdn and deleteFqdnConnection issue DELETE calls', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ ok: true }))
            .mockResolvedValueOnce(jsonResponse({ ok: true }));

        const client = new TelnyxClient('key_test');
        await client.deleteFqdn('fqdn_1');
        await client.deleteFqdnConnection('conn_1');

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://api.telnyx.com/v2/fqdns/fqdn_1',
            expect.objectContaining({ method: 'DELETE' })
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://api.telnyx.com/v2/fqdn_connections/conn_1',
            expect.objectContaining({ method: 'DELETE' })
        );
    });

    // ── error mapping ─────────────────────────────────────────────────

    it('maps 429 to RATE_LIMITED', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse(429, 'Too many requests'));

        const client = new TelnyxClient('key_test');
        try {
            await client.verifyCredentials();
            expect.fail('should have thrown');
        } catch (err) {
            expect(isTelnyxClientError(err)).toBe(true);
            expect((err as TelnyxClientError).code).toBe('RATE_LIMITED');
        }
    });

    it('maps 422 to VALIDATION_ERROR', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse(422, 'Invalid field'));

        const client = new TelnyxClient('key_test');
        try {
            await client.createFqdnConnection('bad');
            expect.fail('should have thrown');
        } catch (err) {
            expect(isTelnyxClientError(err)).toBe(true);
            expect((err as TelnyxClientError).code).toBe('VALIDATION_ERROR');
        }
    });

    it('maps 500 to PROVIDER_ERROR', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse(500, 'Internal'));

        const client = new TelnyxClient('key_test');
        try {
            await client.verifyCredentials();
            expect.fail('should have thrown');
        } catch (err) {
            expect(isTelnyxClientError(err)).toBe(true);
            expect((err as TelnyxClientError).code).toBe('PROVIDER_ERROR');
        }
    });

    it('maps network failure to PROVIDER_UNREACHABLE', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

        const client = new TelnyxClient('key_test');
        try {
            await client.verifyCredentials();
            expect.fail('should have thrown');
        } catch (err) {
            expect(isTelnyxClientError(err)).toBe(true);
            expect((err as TelnyxClientError).code).toBe('PROVIDER_UNREACHABLE');
        }
    });
});
