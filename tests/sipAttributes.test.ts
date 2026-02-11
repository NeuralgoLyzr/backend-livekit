import { describe, expect, it } from 'vitest';
import { setRequiredEnv } from './testUtils';

describe('extractSipFromTo', () => {
    it('extracts both from and to when attributes are present', async () => {
        setRequiredEnv();
        const { extractSipFromTo } = await import(
            '../dist/telephony/core/sipAttributes.js'
        );
        const result = extractSipFromTo({
            'sip.phoneNumber': '+15551234567',
            'sip.trunkPhoneNumber': '+15559876543',
        });
        expect(result).toEqual({
            from: '+15551234567',
            to: '+15559876543',
        });
    });

    it('returns nulls when attrs is undefined', async () => {
        setRequiredEnv();
        const { extractSipFromTo } = await import(
            '../dist/telephony/core/sipAttributes.js'
        );
        expect(extractSipFromTo(undefined)).toEqual({ from: null, to: null });
    });

    it('returns nulls when attrs is an empty object', async () => {
        setRequiredEnv();
        const { extractSipFromTo } = await import(
            '../dist/telephony/core/sipAttributes.js'
        );
        expect(extractSipFromTo({})).toEqual({ from: null, to: null });
    });

    it('returns nulls when attribute values are empty strings', async () => {
        setRequiredEnv();
        const { extractSipFromTo } = await import(
            '../dist/telephony/core/sipAttributes.js'
        );
        const result = extractSipFromTo({
            'sip.phoneNumber': '',
            'sip.trunkPhoneNumber': '',
        });
        expect(result).toEqual({ from: null, to: null });
    });

    it('returns only from when to is missing', async () => {
        setRequiredEnv();
        const { extractSipFromTo } = await import(
            '../dist/telephony/core/sipAttributes.js'
        );
        const result = extractSipFromTo({ 'sip.phoneNumber': '+15551234567' });
        expect(result).toEqual({ from: '+15551234567', to: null });
    });

    it('returns only to when from is missing', async () => {
        setRequiredEnv();
        const { extractSipFromTo } = await import(
            '../dist/telephony/core/sipAttributes.js'
        );
        const result = extractSipFromTo({ 'sip.trunkPhoneNumber': '+15559876543' });
        expect(result).toEqual({ from: null, to: '+15559876543' });
    });
});
