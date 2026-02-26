import { describe, expect, it } from 'vitest';
import { setRequiredEnv } from './testUtils';

describe('httpErrors', () => {
    describe('HttpError', () => {
        it('stores status, message, and details', async () => {
            setRequiredEnv();
            const { HttpError } = await import('../dist/lib/httpErrors.js');

            const err = new HttpError(422, 'Validation failed', { field: 'name' });
            expect(err.status).toBe(422);
            expect(err.message).toBe('Validation failed');
            expect(err.details).toEqual({ field: 'name' });
            expect(err.name).toBe('HttpError');
            expect(err).toBeInstanceOf(Error);
        });

        it('defaults details to undefined', async () => {
            setRequiredEnv();
            const { HttpError } = await import('../dist/lib/httpErrors.js');

            const err = new HttpError(400, 'Bad');
            expect(err.details).toBeUndefined();
        });
    });

    describe('getErrorStatus', () => {
        it('returns status from HttpError', async () => {
            setRequiredEnv();
            const { HttpError, getErrorStatus } = await import('../dist/lib/httpErrors.js');

            expect(getErrorStatus(new HttpError(404, 'Not found'))).toBe(404);
            expect(getErrorStatus(new HttpError(502, 'Bad gateway'))).toBe(502);
        });

        it('returns 500 for non-HttpError values', async () => {
            setRequiredEnv();
            const { getErrorStatus } = await import('../dist/lib/httpErrors.js');

            expect(getErrorStatus(new Error('oops'))).toBe(500);
            expect(getErrorStatus('string error')).toBe(500);
            expect(getErrorStatus(null)).toBe(500);
            expect(getErrorStatus(undefined)).toBe(500);
        });
    });

        describe('formatErrorResponse', () => {
            it('formats HttpError without details in production', async () => {
            setRequiredEnv({ APP_ENV: 'production' });
            const { HttpError, formatErrorResponse } = await import('../dist/lib/httpErrors.js');

            const result = formatErrorResponse(new HttpError(400, 'Bad request', 'extra info'), {
                isDev: false,
            });
            expect(result.error).toBe('Bad request');
            expect(result.details).toBeUndefined();
        });

        it('formats HttpError with details in dev mode', async () => {
            setRequiredEnv();
            const { HttpError, formatErrorResponse } = await import('../dist/lib/httpErrors.js');

            const result = formatErrorResponse(new HttpError(400, 'Bad request', 'extra info'), {
                isDev: true,
            });
            expect(result.error).toBe('Bad request');
            expect(result.details).toBe('extra info');
        });

        it('formats generic Error with fallback message', async () => {
            setRequiredEnv();
            const { formatErrorResponse } = await import('../dist/lib/httpErrors.js');

            const result = formatErrorResponse(new Error('boom'), { isDev: false });
            expect(result.error).toBe('Internal server error');
            expect(result.details).toBeUndefined();
        });

        it('uses custom fallback message', async () => {
            setRequiredEnv();
            const { formatErrorResponse } = await import('../dist/lib/httpErrors.js');

            const result = formatErrorResponse(new Error('boom'), {
                isDev: false,
                fallbackMessage: 'Something went wrong',
            });
            expect(result.error).toBe('Something went wrong');
        });

        it('includes error message as details in dev mode for generic Error', async () => {
            setRequiredEnv();
            const { formatErrorResponse } = await import('../dist/lib/httpErrors.js');

            const result = formatErrorResponse(new Error('boom'), { isDev: true });
            expect(result.error).toBe('Internal server error');
            expect(result.details).toBe('boom');
        });

        it('handles non-Error thrown values in dev mode', async () => {
            setRequiredEnv();
            const { formatErrorResponse } = await import('../dist/lib/httpErrors.js');

            const result = formatErrorResponse('string-error', { isDev: true });
            expect(result.error).toBe('Internal server error');
            expect(result.details).toBe('Unknown error');
        });
    });
});
