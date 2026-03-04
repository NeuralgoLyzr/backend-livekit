import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../src/lib/httpErrors.js';
import { apiKeyAuthMiddleware } from '../src/middleware/apiKeyAuth.js';
import type { AuthContext, PagosAuthService } from '../src/services/pagosAuthService.js';

function makeAuthContext(overrides?: Partial<AuthContext>): AuthContext {
    return {
        orgId: 'org-1',
        userId: 'user-1',
        role: 'role_admin',
        isAdmin: true,
        ...overrides,
    };
}

describe('apiKeyAuthMiddleware', () => {
    it('resolves auth context from x-api-key and stores it in res.locals', async () => {
        const ctx = makeAuthContext();
        const resolveAuthContext = vi.fn().mockResolvedValue(ctx);
        const pagosAuth = { resolveAuthContext } as PagosAuthService;
        const middleware = apiKeyAuthMiddleware(pagosAuth);

        const req = { get: vi.fn().mockReturnValue('secret-key') };
        const res: { locals: { auth?: AuthContext } } = { locals: {} };
        const next = vi.fn();

        await middleware(req as never, res as never, next);

        expect(req.get).toHaveBeenCalledWith('x-api-key');
        expect(resolveAuthContext).toHaveBeenCalledWith('secret-key');
        expect(res.locals.auth).toEqual(ctx);
        expect(next).toHaveBeenCalledWith();
    });

    it('passes an empty string when x-api-key header is missing', async () => {
        const resolveAuthContext = vi.fn().mockResolvedValue(makeAuthContext());
        const pagosAuth = { resolveAuthContext } as PagosAuthService;
        const middleware = apiKeyAuthMiddleware(pagosAuth);

        const req = { get: vi.fn().mockReturnValue(undefined) };
        const res: { locals: { auth?: AuthContext } } = { locals: {} };
        const next = vi.fn();

        await middleware(req as never, res as never, next);

        expect(resolveAuthContext).toHaveBeenCalledWith('');
        expect(next).toHaveBeenCalledWith();
    });

    it('forwards auth resolution errors to next(err)', async () => {
        const authError = new HttpError(401, 'Invalid x-api-key');
        const resolveAuthContext = vi.fn().mockRejectedValue(authError);
        const pagosAuth = { resolveAuthContext } as PagosAuthService;
        const middleware = apiKeyAuthMiddleware(pagosAuth);

        const req = { get: vi.fn().mockReturnValue('bad-key') };
        const res: { locals: { auth?: AuthContext } } = { locals: {} };
        const next = vi.fn();

        await middleware(req as never, res as never, next);

        expect(resolveAuthContext).toHaveBeenCalledWith('bad-key');
        expect(res.locals.auth).toBeUndefined();
        expect(next).toHaveBeenCalledWith(authError);
    });
});
