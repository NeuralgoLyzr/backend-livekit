import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function asyncHandler(
    handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
    return function asyncHandled(req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}
