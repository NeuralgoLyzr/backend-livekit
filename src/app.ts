import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createSessionRouter } from './routes/session.js';
import healthRouter from './routes/health.js';
import { createConfigRouter } from './routes/config.js';
import telephonyRouter from './routes/telephony.js';
import { createAgentsRouter } from './routes/agents.js';
import { createCorrectionsRouter } from './routes/corrections.js';
import { createTranscriptsRouter } from './routes/transcripts.js';
import { createSessionTracesRouter } from './routes/sessionTraces.js';
import { createInternalRouter } from './routes/internal.js';
import { config } from './config/index.js';
import { services } from './composition.js';
import { formatErrorResponse, getErrorStatus } from './lib/httpErrors.js';
import { requestLoggingMiddleware } from './middleware/requestLogging.js';
import type { HttpWideEvent } from './middleware/requestLogging.js';
import { apiKeyAuthMiddleware } from './middleware/apiKeyAuth.js';
import { globalRateLimit } from './middleware/rateLimit.js';
import { createDocsRouter } from './docs/router.js';

export const app: Express = express();
const API_PREFIX = '/v1';

// Middleware
app.use(
    cors({
        origin: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-observability-key'],
    })
);

// LiveKit webhooks require raw body access for signature validation.
// IMPORTANT: This must be registered before `express.json()` consumes the body.
app.use(
    `${API_PREFIX}/telephony/livekit-webhook`,
    express.raw({ type: ['application/webhook+json', 'application/json'] })
);

// Session reports / histories can be larger than Express's default (100kb).
app.use(express.json({ limit: '10mb' }));

app.use(requestLoggingMiddleware);

// Routes (v1 only)
const v1 = express.Router();

v1.use(globalRateLimit);

v1.use(createDocsRouter());

v1.use(
    '/sessions',
    createSessionRouter(services.sessionService, {
        pagosAuthService: services.pagosAuthService,
    })
);

v1.use('/health', healthRouter);

const requireApiKey = apiKeyAuthMiddleware(services.pagosAuthService);

v1.use(
    '/config',
    createConfigRouter({
        ttsVoicesService: services.ttsVoicesService,
        ttsVoicePreviewService: services.ttsVoicePreviewService,
    })
);

v1.use(
    '/telephony',
    (req, res, next) => {
        // Keep LiveKit webhook auth on signature verification, not x-api-key.
        if (req.path === '/livekit-webhook' || req.path === '/livekit-webhook/') {
            return next();
        }
        return requireApiKey(req, res, next);
    },
    telephonyRouter
);

v1.use('/agents', requireApiKey, createAgentsRouter(services.agentRegistryService));

v1.use(
    '/agents/:agentId/corrections',
    requireApiKey,
    createCorrectionsRouter(services.correctionService)
);

v1.use(
    '/transcripts',
    requireApiKey,
    createTranscriptsRouter(services.transcriptService, services.audioStorageService)
);

v1.use('/traces', requireApiKey, createSessionTracesRouter(services.sessionTraceService));

v1.get('/', (_req: Request, res: Response) => {
    res.json({
        name: 'Lyzr Voice API',
        version: '1.0.0',
        endpoints: {
            openApiSpec: `GET ${API_PREFIX}/openapi.json`,
            swaggerUi: `GET ${API_PREFIX}/docs`,
            redoc: `GET ${API_PREFIX}/redoc`,
            scalarDocs: `GET ${API_PREFIX}/scalar-docs`,
            health: `GET ${API_PREFIX}/health`,
            root: `GET ${API_PREFIX}/`,
            createSession: `POST ${API_PREFIX}/sessions/start`,
            endSession: `POST ${API_PREFIX}/sessions/end`,
            agents: `GET ${API_PREFIX}/agents`,
            transcripts: `GET ${API_PREFIX}/transcripts`,
            transcriptBySession: `GET ${API_PREFIX}/transcripts/:sessionId`,
            transcriptAudio: `GET ${API_PREFIX}/transcripts/:sessionId/audio`,
            transcriptsByAgent: `GET ${API_PREFIX}/transcripts/agent/:agentId`,
            transcriptAgentStats: `GET ${API_PREFIX}/transcripts/agent/:agentId/stats`,
            sessionTraces: `GET ${API_PREFIX}/traces/session/:sessionId`,
            sessionTraceById: `GET ${API_PREFIX}/traces/session/:sessionId/:traceId`,
            ...(config.telephony.enabled
                ? { telephonyWebhook: `POST ${API_PREFIX}/telephony/livekit-webhook` }
                : {}),
        },
        docs: {
            swaggerUi: `GET ${API_PREFIX}/docs`,
            redoc: `GET ${API_PREFIX}/redoc`,
            scalarDocs: `GET ${API_PREFIX}/scalar-docs`,
            openApiSpec: `GET ${API_PREFIX}/openapi.json`,
        },
    });
});

app.use(
    '/internal',
    createInternalRouter({
        sessionService: services.sessionService,
        transcriptService: services.transcriptService,
        sessionStore: services.sessionStore,
        audioStorageService: services.audioStorageService,
        observabilityIngestKey: config.observability.ingestKey,
    })
);

app.use(API_PREFIX, v1);

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path,
    });
});

// Error handling middleware – attach error to the wide event; the request
// logging middleware will log it (at the appropriate level) on `finish`.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = getErrorStatus(err);

    const wideEvent = res.locals.wideEvent as HttpWideEvent | undefined;
    if (wideEvent) {
        wideEvent.err = err;
    }

    res.status(statusCode).json(formatErrorResponse(err));
});
