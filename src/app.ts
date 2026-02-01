/**
 * Express application setup
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import sessionRouter from './routes/session.js';
import healthRouter from './routes/health.js';
import configRouter from './routes/config.js';
import telephonyRouter from './routes/telephony.js';
import agentsRouter from './routes/agents.js';
import { config } from './config/index.js';
import { formatErrorResponse, getErrorStatus } from './lib/httpErrors.js';

export const app: Express = express();

// Middleware
app.use(cors());

// LiveKit webhooks require raw body access for signature validation.
// IMPORTANT: This must be registered before `express.json()` consumes the body.
app.use(
    '/telephony/livekit-webhook',
    express.raw({ type: ['application/webhook+json', 'application/json'] })
);

// Session reports / histories can be larger than Express's default (100kb).
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/session', sessionRouter);
app.use('/health', healthRouter);
app.use('/config', configRouter);
app.use('/telephony', telephonyRouter);
app.use('/agents', agentsRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
    res.json({
        name: 'LiveKit Backend API',
        version: '1.0.0',
        endpoints: {
            health: 'GET /health',
            createSession: 'POST /session',
            endSession: 'POST /session/end',
            sessionObservability: 'POST /session/observability',
            agents: 'GET /agents',
            ...(config.telephony.enabled
                ? { telephonyWebhook: 'POST /telephony/livekit-webhook' }
                : {}),
        },
        docs: 'See README.md for API documentation',
    });
});

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path,
    });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err);
    res.status(getErrorStatus(err)).json(formatErrorResponse(err));
});
