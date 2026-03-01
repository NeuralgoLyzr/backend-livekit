import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    PlivoClient,
    isPlivoClientError,
    type PlivoClientError,
} from '../src/telephony/adapters/plivo/plivoClient.js';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function errorResponse(status: number, message = 'error'): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('PlivoClient', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
    });

    it('verifyCredentials returns { valid: true } on 200', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ objects: [], meta: { next: null } })
        );

        const client = new PlivoClient({
            authId: 'MAUTH123',
            authToken: 'secret',
        });

        const result = await client.verifyCredentials();
        expect(result).toEqual({ valid: true });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.plivo.com/v1/Account/MAUTH123/Number/?limit=1&offset=0',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    Authorization: expect.stringMatching(/^Basic\s+/),
                }),
            })
        );
    });

    it('verifyCredentials throws AUTH_INVALID on 401', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'));

        const client = new PlivoClient({
            authId: 'MAUTH123',
            authToken: 'bad',
        });

        try {
            await client.verifyCredentials();
            expect.fail('should have thrown');
        } catch (err) {
            expect(isPlivoClientError(err)).toBe(true);
            expect((err as PlivoClientError).code).toBe('AUTH_INVALID');
            expect((err as PlivoClientError).status).toBe(401);
        }
    });

    it('verifyCredentials maps 429 to RATE_LIMITED', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse(429, 'Too many requests'));

        const client = new PlivoClient({
            authId: 'MAUTH123',
            authToken: 'secret',
        });

        try {
            await client.verifyCredentials();
            expect.fail('should have thrown');
        } catch (err) {
            expect(isPlivoClientError(err)).toBe(true);
            expect((err as PlivoClientError).code).toBe('RATE_LIMITED');
        }
    });

    it('listPhoneNumbers handles pagination', async () => {
        fetchMock
            .mockResolvedValueOnce(
                jsonResponse({
                    objects: [{ number: '+15551111111', app_id: null }],
                    meta: { next: '/v1/Account/MAUTH123/Number/?offset=20&limit=20' },
                })
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    objects: [{ number: '+15552222222', app_id: 'TRUNK_1' }],
                    meta: { next: null },
                })
            );

        const client = new PlivoClient({
            authId: 'MAUTH123',
            authToken: 'secret',
        });

        const numbers = await client.listPhoneNumbers();
        expect(numbers).toEqual([
            { number: '+15551111111', alias: undefined, appId: null },
            { number: '+15552222222', alias: undefined, appId: 'TRUNK_1' },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('getPhoneNumber fetches a single number', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                number: '+15551111111',
                alias: 'Main',
                app_id: 'TRUNK_1',
            })
        );

        const client = new PlivoClient({
            authId: 'MAUTH123',
            authToken: 'secret',
        });

        const number = await client.getPhoneNumber('+15551111111');
        expect(number).toEqual({
            number: '+15551111111',
            alias: 'Main',
            appId: 'TRUNK_1',
        });
    });

    it('setNumberAppId sends POST with app_id', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ api_id: 'api_1' }, 202));

        const client = new PlivoClient({
            authId: 'MAUTH123',
            authToken: 'secret',
        });

        await client.setNumberAppId('+15551111111', 'TRUNK_1');

        const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.plivo.com/v1/Account/MAUTH123/Number/%2B15551111111/');
        expect(opts.method).toBe('POST');
        expect(JSON.parse(String(opts.body))).toEqual({ app_id: 'TRUNK_1' });
    });

    it('create/list/delete inbound trunk lifecycle methods call expected endpoints', async () => {
        fetchMock
            .mockResolvedValueOnce(
                jsonResponse({ trunk_id: 'TRUNK_1', primary_uri_uuid: 'URI_1' }, 201)
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    objects: [
                        {
                            trunk_id: 'TRUNK_1',
                            name: 'livekit-inbound-int_1',
                            primary_uri_uuid: 'URI_1',
                        },
                    ],
                    meta: { next: null },
                })
            )
            .mockResolvedValueOnce(jsonResponse({ message: 'deleted' }, 200));

        const client = new PlivoClient({
            authId: 'MAUTH123',
            authToken: 'secret',
        });

        const created = await client.createInboundTrunk('livekit-inbound-int_1', 'URI_1');
        expect(created).toEqual({ trunkId: 'TRUNK_1', primaryUriId: 'URI_1' });

        const trunks = await client.listInboundTrunks();
        expect(trunks).toEqual([
            { trunkId: 'TRUNK_1', name: 'livekit-inbound-int_1', primaryUriId: 'URI_1' },
        ]);

        await client.deleteInboundTrunk('TRUNK_1');

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://api.plivo.com/v1/Account/MAUTH123/Zentrunk/Trunk/',
            expect.objectContaining({ method: 'POST' })
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://api.plivo.com/v1/Account/MAUTH123/Zentrunk/Trunk/?limit=20&offset=0',
            expect.objectContaining({ method: 'GET' })
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            'https://api.plivo.com/v1/Account/MAUTH123/Zentrunk/Trunk/TRUNK_1/',
            expect.objectContaining({ method: 'DELETE' })
        );
    });

    it('create/list/delete origination URI lifecycle methods call expected endpoints', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ uri_uuid: 'ORI_1' }, 201))
            .mockResolvedValueOnce(
                jsonResponse({
                    objects: [
                        {
                            uri_uuid: 'ORI_1',
                            name: 'LiveKit SIP Host',
                            uri: 'sip.livekit.cloud',
                        },
                    ],
                    meta: { next: null },
                })
            )
            .mockResolvedValueOnce(jsonResponse({ message: 'deleted' }, 200));

        const client = new PlivoClient({
            authId: 'MAUTH123',
            authToken: 'secret',
        });

        const created = await client.createOriginationUri({
            name: 'LiveKit SIP Host',
            uri: 'sip.livekit.cloud',
        });
        expect(created).toEqual({ id: 'ORI_1' });

        const uris = await client.listOriginationUris();
        expect(uris).toEqual([
            {
                id: 'ORI_1',
                name: 'LiveKit SIP Host',
                uri: 'sip.livekit.cloud',
                host: 'sip.livekit.cloud',
            },
        ]);

        await client.deleteOriginationUri('ORI_1');

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://api.plivo.com/v1/Account/MAUTH123/Zentrunk/URI/',
            expect.objectContaining({ method: 'POST' })
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://api.plivo.com/v1/Account/MAUTH123/Zentrunk/URI/?limit=20&offset=0',
            expect.objectContaining({ method: 'GET' })
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            'https://api.plivo.com/v1/Account/MAUTH123/Zentrunk/URI/ORI_1/',
            expect.objectContaining({ method: 'DELETE' })
        );
    });

    it('maps network failure to PROVIDER_UNREACHABLE', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

        const client = new PlivoClient({
            authId: 'MAUTH123',
            authToken: 'secret',
        });

        try {
            await client.verifyCredentials();
            expect.fail('should have thrown');
        } catch (err) {
            expect(isPlivoClientError(err)).toBe(true);
            expect((err as PlivoClientError).code).toBe('PROVIDER_UNREACHABLE');
        }
    });
});
