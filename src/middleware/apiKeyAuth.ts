import type { NextFunction, Request, Response } from 'express';

import type { AuthContext, PagosAuthService } from '../services/pagosAuthService.js';

export type RequestAuthLocals = {
    auth?: AuthContext;
};

export function apiKeyAuthMiddleware(pagosAuth: PagosAuthService) {
    return async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
        try {
            const apiKey = req.get('x-api-key') ?? '';
            const ctx = await pagosAuth.resolveAuthContext(apiKey);
            (res.locals as RequestAuthLocals).auth = ctx;
            return next();
        } catch (err) {
            return next(err);
        }
    };
}

