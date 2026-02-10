import { isDevelopment } from './env.js';

export class HttpError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        /**
         * Optional extra context. Only returned in non-production environments.
         */
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

export function getErrorStatus(error: unknown): number {
    if (error instanceof HttpError) return error.status;
    return 500;
}

export function formatErrorResponse(
    error: unknown,
    options?: { fallbackMessage?: string; isDev?: boolean }
): { error: string; details?: unknown } {
    const isDev = options?.isDev ?? isDevelopment();

    if (error instanceof HttpError) {
        return {
            error: error.message,
            ...(isDev && error.details !== undefined ? { details: error.details } : {}),
        };
    }

    return {
        error: options?.fallbackMessage ?? 'Internal server error',
        ...(isDev ? { details: error instanceof Error ? error.message : 'Unknown error' } : {}),
    };
}
