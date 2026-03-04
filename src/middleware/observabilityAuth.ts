import type { NextFunction, Request, Response } from 'express';

export function observabilityAuthMiddleware(ingestKey: string) {
    return function observabilityAuth(req: Request, res: Response, next: NextFunction) {
        if (!ingestKey) {
            return next();
        }

        const provided = req.get('x-observability-key') ?? '';
        if (provided !== ingestKey) {
            return res.status(401).json({ error: 'Invalid or missing x-observability-key' });
        }

        return next();
    };
}
