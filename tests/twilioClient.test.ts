import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    TwilioClient,
    isTwilioClientError,
    type TwilioClientError,
} from '../dist/telephony/adapters/twilio/twilioClient.js';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function errorResponse(status: number, message = 'error'): Response {
    return new Response(JSON.stringify({ message, status }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('TwilioClient', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
    });

    it('verifyCredentials returns { valid: true } on 200', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ sid: 'AC123' }));

        const client = new TwilioClient({
            accountSid: 'AC123',
            authToken: 'secret',
        });

        const result = await client.verifyCredentials();
        expect(result).toEqual({ valid: true });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.twilio.com/2010-04-01/Accounts/AC123.json',
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

        const client = new TwilioClient({
            accountSid: 'AC123',
            authToken: 'bad',
        });

        try {
            await client.verifyCredentials();
            expect.fail('should have thrown');
        } catch (err) {
            expect(isTwilioClientError(err)).toBe(true);
            expect((err as TwilioClientError).code).toBe('AUTH_INVALID');
            expect((err as TwilioClientError).status).toBe(401);
        }
    });

    it('verifyCredentials maps 429 to RATE_LIMITED', async () => {
        fetchMock.mockResolvedValueOnce(errorResponse(429, 'Too many requests'));

        const client = new TwilioClient({
            accountSid: 'AC123',
            authToken: 'secret',
        });

        try {
            await client.verifyCredentials();
            expect.fail('should have thrown');
        } catch (err) {
            expect(isTwilioClientError(err)).toBe(true);
            expect((err as TwilioClientError).code).toBe('RATE_LIMITED');
        }
    });

    it('listIncomingPhoneNumbers handles pagination via next_page_uri', async () => {
        fetchMock
            .mockResolvedValueOnce(
                jsonResponse({
                    incoming_phone_numbers: [{ sid: 'PN1', phone_number: '+15551111111' }],
                    next_page_uri:
                        '/2010-04-01/Accounts/AC123/IncomingPhoneNumbers.json?PageSize=50&Page=1',
                })
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    incoming_phone_numbers: [{ sid: 'PN2', phone_number: '+15552222222' }],
                    next_page_uri: null,
                })
            );

        const client = new TwilioClient({
            accountSid: 'AC123',
            authToken: 'secret',
        });

        const numbers = await client.listIncomingPhoneNumbers();
        expect(numbers).toEqual([
            { sid: 'PN1', phoneNumber: '+15551111111', friendlyName: undefined },
            { sid: 'PN2', phoneNumber: '+15552222222', friendlyName: undefined },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('getIncomingPhoneNumber fetches a single Twilio number by SID', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                sid: 'PN1',
                phone_number: '+15551111111',
                friendly_name: 'Main line',
            })
        );

        const client = new TwilioClient({
            accountSid: 'AC123',
            authToken: 'secret',
        });

        const number = await client.getIncomingPhoneNumber('PN1');
        expect(number).toEqual({
            sid: 'PN1',
            phoneNumber: '+15551111111',
            friendlyName: 'Main line',
        });
    });

    it('attachPhoneNumberToTrunk is idempotent when already attached', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                phone_numbers: [{ sid: 'TPN1', phone_number_sid: 'PN_EXISTING' }],
                next_page_uri: null,
            })
        );

        const client = new TwilioClient({
            accountSid: 'AC123',
            authToken: 'secret',
        });

        await client.attachPhoneNumberToTrunk('TRUNK1', 'PN_EXISTING');

        // Only the list call; no POST.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://trunking.twilio.com/v1/Trunks/TRUNK1/PhoneNumbers?PageSize=50',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('attachPhoneNumberToTrunk posts when not yet attached', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ phone_numbers: [], next_page_uri: null }))
            .mockResolvedValueOnce(jsonResponse({ sid: 'TPN_CREATED' }, 201));

        const client = new TwilioClient({
            accountSid: 'AC123',
            authToken: 'secret',
        });

        await client.attachPhoneNumberToTrunk('TRUNK1', 'PN_NEW');

        expect(fetchMock).toHaveBeenCalledTimes(2);

        const [url, opts] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(url).toBe('https://trunking.twilio.com/v1/Trunks/TRUNK1/PhoneNumbers');
        expect(opts.method).toBe('POST');
        expect(String(opts.body)).toContain('PhoneNumberSid=PN_NEW');
    });

    it('detachPhoneNumberFromTrunk deletes existing reference', async () => {
        fetchMock
            .mockResolvedValueOnce(
                jsonResponse({
                    phone_numbers: [{ sid: 'TPN1', phone_number_sid: 'PN_EXISTING' }],
                    next_page_uri: null,
                })
            )
            .mockResolvedValueOnce(jsonResponse({ ok: true }));

        const client = new TwilioClient({
            accountSid: 'AC123',
            authToken: 'secret',
        });

        await client.detachPhoneNumberFromTrunk('TRUNK1', 'PN_EXISTING');

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [url, opts] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(url).toBe('https://trunking.twilio.com/v1/Trunks/TRUNK1/PhoneNumbers/TPN1');
        expect(opts.method).toBe('DELETE');
    });

    it('deleteTrunk issues DELETE call', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

        const client = new TwilioClient({
            accountSid: 'AC123',
            authToken: 'secret',
        });

        await client.deleteTrunk('TRUNK1');

        expect(fetchMock).toHaveBeenCalledWith(
            'https://trunking.twilio.com/v1/Trunks/TRUNK1',
            expect.objectContaining({ method: 'DELETE' })
        );
    });

    it('maps network failure to PROVIDER_UNREACHABLE', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

        const client = new TwilioClient({
            accountSid: 'AC123',
            authToken: 'secret',
        });

        try {
            await client.verifyCredentials();
            expect.fail('should have thrown');
        } catch (err) {
            expect(isTwilioClientError(err)).toBe(true);
            expect((err as TwilioClientError).code).toBe('PROVIDER_UNREACHABLE');
        }
    });
});
