import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createSessionRouter } from './routes/session.js';
import healthRouter from './routes/health.js';
import configRouter from './routes/config.js';
import telephonyRouter from './routes/telephony.js';
import { createAgentsRouter } from './routes/agents.js';
import { config } from './config/index.js';
import { services } from './composition.js';
import { formatErrorResponse, getErrorStatus } from './lib/httpErrors.js';
import { requestLoggingMiddleware } from './middleware/requestLogging.js';
import { logger } from './lib/logger.js';

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

app.use(requestLoggingMiddleware);

// Routes
app.use('/session', createSessionRouter(services.sessionService));
app.use('/health', healthRouter);
app.use('/config', configRouter);
app.use('/telephony', telephonyRouter);
app.use('/agents', createAgentsRouter(services.agentRegistryService));

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
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const statusCode = getErrorStatus(err);
    logger.error(
        {
            event: 'http_error',
            statusCode,
            method: req.method,
            path: req.originalUrl || req.url,
            err,
        },
        'Request failed'
    );
    res.status(statusCode).json(formatErrorResponse(err));
});
