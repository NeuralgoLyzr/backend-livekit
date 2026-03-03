import { z } from 'zod';

import {
    AgentConfigSchema,
    AgentIdSchema,
    AgentResponseSchema,
    AgentShareRequestSchema,
    AgentVersionIdSchema,
    AgentVersionResponseSchema,
    CreateAgentRequestSchema,
    EndSessionRequestSchema,
    SessionRequestSchema,
    UpdateAgentRequestSchema,
} from '../types/index.js';
import { GetTtsVoicePreviewQuerySchema, ListTtsVoicesQuerySchema } from '../types/ttsVoices.js';

function toOpenApiSchema(schema: z.ZodType): Record<string, unknown> {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    const { $schema: _jsonSchemaDialect, ...openApiSchema } = jsonSchema;
    return openApiSchema;
}

const ErrorResponseSchema = {
    type: 'object',
    required: ['error'],
    properties: {
        error: { type: 'string' },
        details: {
            description: 'Only returned in non-production environments for some errors.',
        },
    },
} as const;

const ValidationErrorResponseSchema = {
    type: 'object',
    required: ['error', 'issues'],
    properties: {
        error: { type: 'string' },
        issues: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: true,
            },
        },
        example: {
            type: 'object',
            additionalProperties: true,
        },
    },
} as const;

const CreateSessionResponseSchema = {
    type: 'object',
    required: [
        'userToken',
        'roomName',
        'sessionId',
        'livekitUrl',
        'agentDispatched',
        'agentConfig',
    ],
    properties: {
        userToken: { type: 'string' },
        roomName: { type: 'string' },
        sessionId: { type: 'string', format: 'uuid' },
        livekitUrl: { type: 'string' },
        agentDispatched: { type: 'boolean' },
        agentConfig: {
            type: 'object',
            required: ['engine', 'tools'],
            properties: {
                engine: {
                    type: 'object',
                    additionalProperties: true,
                },
                tools: {
                    type: 'array',
                    items: { type: 'string' },
                },
            },
        },
    },
} as const;

const PaginationQueryParameters = [
    {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 200 },
    },
    {
        name: 'offset',
        in: 'query',
        schema: { type: 'integer', minimum: 0 },
    },
    {
        name: 'sort',
        in: 'query',
        schema: { type: 'string', enum: ['asc', 'desc'] },
    },
] as const;

const TranscriptSchema = {
    type: 'object',
    required: ['id', 'sessionId', 'roomName', 'orgId', 'messageCount'],
    properties: {
        id: { type: 'string' },
        sessionId: { type: 'string', format: 'uuid' },
        roomName: { type: 'string' },
        agentId: { type: ['string', 'null'] },
        orgId: { type: 'string', format: 'uuid' },
        createdByUserId: { type: ['string', 'null'] },
        sessionReport: { type: 'object', additionalProperties: true },
        chatHistory: { type: 'array', items: { type: 'object', additionalProperties: true } },
        closeReason: { type: ['string', 'null'] },
        durationMs: { type: ['number', 'null'] },
        messageCount: { type: 'integer' },
        startedAt: { type: 'string', format: 'date-time' },
        endedAt: { type: 'string', format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
    },
} as const;

const PaginatedTranscriptsSchema = {
    type: 'object',
    required: ['items', 'total', 'limit', 'offset', 'nextOffset'],
    properties: {
        items: {
            type: 'array',
            items: TranscriptSchema,
        },
        total: { type: 'integer' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
        nextOffset: { type: ['integer', 'null'] },
    },
} as const;

const SessionTraceSummarySchema = {
    type: 'object',
    required: ['traceId', 'timestamp', 'observationCount'],
    properties: {
        traceId: { type: 'string' },
        name: { type: ['string', 'null'] },
        sessionId: { type: ['string', 'null'] },
        timestamp: { type: 'string', format: 'date-time' },
        latencySeconds: { type: ['number', 'null'] },
        totalCostUsd: { type: ['number', 'null'] },
        observationCount: { type: 'integer' },
        htmlPath: { type: ['string', 'null'] },
    },
} as const;

const SessionTraceDetailSchema = {
    type: 'object',
    required: ['traceId', 'timestamp', 'observations'],
    properties: {
        traceId: { type: 'string' },
        name: { type: ['string', 'null'] },
        sessionId: { type: ['string', 'null'] },
        timestamp: { type: 'string', format: 'date-time' },
        latencySeconds: { type: ['number', 'null'] },
        totalCostUsd: { type: ['number', 'null'] },
        htmlPath: { type: ['string', 'null'] },
        observations: {
            type: 'array',
            items: {
                type: 'object',
                required: ['id', 'type', 'startTime'],
                properties: {
                    id: { type: 'string' },
                    traceId: { type: ['string', 'null'] },
                    parentObservationId: { type: ['string', 'null'] },
                    type: { type: 'string' },
                    name: { type: ['string', 'null'] },
                    level: { type: ['string', 'null'] },
                    startTime: { type: 'string', format: 'date-time' },
                    endTime: { type: ['string', 'null'], format: 'date-time' },
                    completionStartTime: { type: ['string', 'null'], format: 'date-time' },
                    statusMessage: { type: ['string', 'null'] },
                    model: { type: ['string', 'null'] },
                    modelParameters: { type: ['object', 'null'], additionalProperties: true },
                    input: {},
                    output: {},
                    metadata: { type: ['object', 'null'], additionalProperties: true },
                    usageDetails: { type: 'object', additionalProperties: { type: 'number' } },
                    costDetails: { type: 'object', additionalProperties: { type: 'number' } },
                    environment: { type: ['string', 'null'] },
                },
            },
        },
    },
} as const;

export const openApiDocument = {
    openapi: '3.1.0',
    info: {
        title: 'Lyzr Voice API',
        version: '1.0.0',
        description:
            'REST API for creating voice sessions, dispatching LiveKit agents, managing saved agents, and fetching transcripts/traces.',
    },
    servers: [{ url: '/v1', description: 'Version 1 API' }],
    tags: [
        { name: 'Health' },
        { name: 'Session' },
        { name: 'Config' },
        { name: 'Agents' },
        { name: 'Transcripts' },
        { name: 'Traces' },
        { name: 'Telephony' },
    ],
    components: {
        securitySchemes: {
            ApiKeyAuth: {
                type: 'apiKey',
                in: 'header',
                name: 'x-api-key',
                description: 'Required for most non-public API endpoints.',
            },
            LiveKitWebhookAuth: {
                type: 'apiKey',
                in: 'header',
                name: 'Authorization',
                description:
                    'LiveKit webhook signature header. Do not use x-api-key for this endpoint.',
            },
        },
        schemas: {
            ErrorResponse: ErrorResponseSchema,
            ValidationErrorResponse: ValidationErrorResponseSchema,
            SessionRequest: toOpenApiSchema(SessionRequestSchema),
            EndSessionRequest: toOpenApiSchema(EndSessionRequestSchema),
            CreateSessionResponse: CreateSessionResponseSchema,
            AgentConfig: toOpenApiSchema(AgentConfigSchema),
            CreateAgentRequest: toOpenApiSchema(CreateAgentRequestSchema),
            UpdateAgentRequest: toOpenApiSchema(UpdateAgentRequestSchema),
            AgentShareRequest: toOpenApiSchema(AgentShareRequestSchema),
            AgentResponse: toOpenApiSchema(AgentResponseSchema),
            AgentVersionResponse: toOpenApiSchema(AgentVersionResponseSchema),
            AgentId: toOpenApiSchema(AgentIdSchema),
            AgentVersionId: toOpenApiSchema(AgentVersionIdSchema),
            ListTtsVoicesQuery: toOpenApiSchema(ListTtsVoicesQuerySchema),
            GetTtsVoicePreviewQuery: toOpenApiSchema(GetTtsVoicePreviewQuerySchema),
            Transcript: TranscriptSchema,
            PaginatedTranscripts: PaginatedTranscriptsSchema,
            SessionTraceSummary: SessionTraceSummarySchema,
            SessionTraceDetail: SessionTraceDetailSchema,
        },
    },
    paths: {
        '/': {
            get: {
                tags: ['Health'],
                summary: 'API index',
                responses: {
                    '200': {
                        description: 'Service metadata and route summary.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                },
            },
        },
        '/health': {
            get: {
                tags: ['Health'],
                summary: 'Health check',
                responses: {
                    '200': {
                        description: 'Service is healthy.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['status', 'timestamp', 'uptime'],
                                    properties: {
                                        status: { type: 'string', enum: ['ok'] },
                                        timestamp: { type: 'string', format: 'date-time' },
                                        uptime: { type: 'integer' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/sessions/start': {
            post: {
                tags: ['Session'],
                summary: 'Create a LiveKit session and dispatch an agent',
                security: [{ ApiKeyAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/SessionRequest' },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Session created and agent dispatched.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CreateSessionResponse' },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid request payload.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                    '401': {
                        description: 'Missing or invalid x-api-key.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    '502': {
                        description: 'Agent dispatch failed.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/sessions/end': {
            post: {
                tags: ['Session'],
                summary: 'End a session by room name or session id',
                security: [{ ApiKeyAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/EndSessionRequest' },
                        },
                    },
                },
                responses: {
                    '204': { description: 'Session ended.' },
                    '400': {
                        description: 'Invalid request payload.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                    '401': {
                        description: 'Missing or invalid x-api-key.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    '404': {
                        description: 'Session not found for caller scope.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/config/tools': {
            get: {
                tags: ['Config'],
                summary: 'List available tools',
                responses: {
                    '200': {
                        description: 'Tool registry.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        tools: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                additionalProperties: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/config/realtime-options': {
            get: {
                tags: ['Config'],
                summary: 'List realtime model/provider options',
                responses: {
                    '200': {
                        description: 'Realtime options.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                },
            },
        },
        '/config/pipeline-options': {
            get: {
                tags: ['Config'],
                summary: 'List pipeline STT/LLM/TTS options',
                responses: {
                    '200': {
                        description: 'Pipeline options.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                },
            },
        },
        '/config/tts-voice-providers': {
            get: {
                tags: ['Config'],
                summary: 'List available TTS voice providers',
                responses: {
                    '200': {
                        description: 'Provider metadata list.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        additionalProperties: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/config/tts-voices': {
            get: {
                tags: ['Config'],
                summary: 'List provider voices',
                parameters: [
                    {
                        name: 'providerId',
                        in: 'query',
                        required: true,
                        schema: {
                            type: 'string',
                            enum: [
                                'cartesia',
                                'elevenlabs',
                                'deepgram',
                                'inworld',
                                'rime',
                                'sarvam',
                            ],
                        },
                    },
                    { name: 'q', in: 'query', schema: { type: 'string' } },
                    { name: 'language', in: 'query', schema: { type: 'string' } },
                    { name: 'gender', in: 'query', schema: { type: 'string' } },
                    {
                        name: 'limit',
                        in: 'query',
                        schema: { type: 'integer', minimum: 1, maximum: 100 },
                    },
                    {
                        name: 'cursor',
                        in: 'query',
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Voice list for provider.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid query params.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/config/tts-voice-preview': {
            get: {
                tags: ['Config'],
                summary: 'Stream TTS voice preview audio',
                parameters: [
                    {
                        name: 'providerId',
                        in: 'query',
                        required: true,
                        schema: {
                            type: 'string',
                            enum: [
                                'cartesia',
                                'elevenlabs',
                                'deepgram',
                                'inworld',
                                'rime',
                                'sarvam',
                            ],
                        },
                    },
                    {
                        name: 'url',
                        in: 'query',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Audio bytes with provider content-type.',
                        content: {
                            'audio/*': {
                                schema: {
                                    type: 'string',
                                    format: 'binary',
                                },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid query params.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/agents': {
            get: {
                tags: ['Agents'],
                summary: 'List agents for authenticated org/user',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'limit',
                        in: 'query',
                        schema: { type: 'integer', minimum: 1 },
                    },
                    {
                        name: 'offset',
                        in: 'query',
                        schema: { type: 'integer', minimum: 0 },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Agent list',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['agents'],
                                    properties: {
                                        agents: {
                                            type: 'array',
                                            items: { $ref: '#/components/schemas/AgentResponse' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    '401': {
                        description: 'Missing or invalid x-api-key.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
            post: {
                tags: ['Agents'],
                summary: 'Create a new saved agent',
                security: [{ ApiKeyAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/CreateAgentRequest' },
                        },
                    },
                },
                responses: {
                    '201': {
                        description: 'Agent created.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['agent'],
                                    properties: {
                                        agent: { $ref: '#/components/schemas/AgentResponse' },
                                    },
                                },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid request payload.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/agents/{agentId}': {
            parameters: [
                {
                    name: 'agentId',
                    in: 'path',
                    required: true,
                    schema: { $ref: '#/components/schemas/AgentId' },
                },
            ],
            get: {
                tags: ['Agents'],
                summary: 'Get one saved agent',
                security: [{ ApiKeyAuth: [] }],
                responses: {
                    '200': {
                        description: 'Agent found.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['agent'],
                                    properties: {
                                        agent: { $ref: '#/components/schemas/AgentResponse' },
                                    },
                                },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid agent id.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                    '404': {
                        description: 'Agent not found.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
            put: {
                tags: ['Agents'],
                summary: 'Update saved agent and create a new version',
                security: [{ ApiKeyAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/UpdateAgentRequest' },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Agent updated.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['agent'],
                                    properties: {
                                        agent: { $ref: '#/components/schemas/AgentResponse' },
                                    },
                                },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid request.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                    '404': {
                        description: 'Agent not found.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
            delete: {
                tags: ['Agents'],
                summary: 'Delete saved agent',
                security: [{ ApiKeyAuth: [] }],
                responses: {
                    '204': { description: 'Agent deleted.' },
                    '400': {
                        description: 'Invalid agent id.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                    '404': {
                        description: 'Agent not found.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/agents/{agentId}/versions': {
            get: {
                tags: ['Agents'],
                summary: 'List versions for one agent',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'agentId',
                        in: 'path',
                        required: true,
                        schema: { $ref: '#/components/schemas/AgentId' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Agent version list.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['agent_id', 'versions'],
                                    properties: {
                                        agent_id: { type: 'string' },
                                        versions: {
                                            type: 'array',
                                            items: {
                                                $ref: '#/components/schemas/AgentVersionResponse',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid agent id.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                    '404': {
                        description: 'Agent not found.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/agents/{agentId}/versions/{versionId}/activate': {
            post: {
                tags: ['Agents'],
                summary: 'Activate a specific agent version',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'agentId',
                        in: 'path',
                        required: true,
                        schema: { $ref: '#/components/schemas/AgentId' },
                    },
                    {
                        name: 'versionId',
                        in: 'path',
                        required: true,
                        schema: { $ref: '#/components/schemas/AgentVersionId' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Activated agent.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['agent'],
                                    properties: {
                                        agent: { $ref: '#/components/schemas/AgentResponse' },
                                    },
                                },
                            },
                        },
                    },
                    '404': {
                        description: 'Agent or version not found.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/agents/{agentId}/shares': {
            get: {
                tags: ['Agents'],
                summary: 'List user shares for an agent',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'agentId',
                        in: 'path',
                        required: true,
                        schema: { $ref: '#/components/schemas/AgentId' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Share list.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['agent_id', 'user_ids'],
                                    properties: {
                                        agent_id: { type: 'string' },
                                        user_ids: { type: 'array', items: { type: 'string' } },
                                    },
                                },
                            },
                        },
                    },
                    '404': {
                        description: 'Agent not found.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/agents/{agentId}/share': {
            post: {
                tags: ['Agents'],
                summary: 'Share an agent with one or more users',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'agentId',
                        in: 'path',
                        required: true,
                        schema: { $ref: '#/components/schemas/AgentId' },
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/AgentShareRequest' },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Share operation result.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid payload.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/agents/{agentId}/unshare': {
            post: {
                tags: ['Agents'],
                summary: 'Unshare an agent from one or more users',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'agentId',
                        in: 'path',
                        required: true,
                        schema: { $ref: '#/components/schemas/AgentId' },
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/AgentShareRequest' },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Unshare operation result.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid payload.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/transcripts': {
            get: {
                tags: ['Transcripts'],
                summary: 'List transcripts in caller scope',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    ...PaginationQueryParameters,
                    {
                        name: 'agentId',
                        in: 'query',
                        schema: { $ref: '#/components/schemas/AgentId' },
                    },
                    {
                        name: 'orgId',
                        in: 'query',
                        schema: { type: 'string', format: 'uuid' },
                    },
                    {
                        name: 'sessionId',
                        in: 'query',
                        schema: { type: 'string', format: 'uuid' },
                    },
                    {
                        name: 'from',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'ISO date or ISO date-time with offset.',
                    },
                    {
                        name: 'to',
                        in: 'query',
                        schema: { type: 'string' },
                        description: 'ISO date or ISO date-time with offset.',
                    },
                ],
                responses: {
                    '200': {
                        description: 'Paginated transcripts.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/PaginatedTranscripts' },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid query params.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/transcripts/{sessionId}': {
            get: {
                tags: ['Transcripts'],
                summary: 'Get transcript by session id',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'sessionId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Transcript document.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['transcript'],
                                    properties: {
                                        transcript: { $ref: '#/components/schemas/Transcript' },
                                    },
                                },
                            },
                        },
                    },
                    '404': {
                        description: 'Transcript not found for caller scope.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/transcripts/{sessionId}/audio': {
            get: {
                tags: ['Transcripts'],
                summary: 'Stream transcript audio recording by session id',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'sessionId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Audio recording bytes.',
                        content: {
                            'audio/ogg': {
                                schema: {
                                    type: 'string',
                                    format: 'binary',
                                },
                            },
                        },
                    },
                    '404': {
                        description:
                            'Transcript/audio not found for caller scope or storage not configured.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/transcripts/agent/{agentId}': {
            get: {
                tags: ['Transcripts'],
                summary: 'List transcripts for a specific agent',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'agentId',
                        in: 'path',
                        required: true,
                        schema: { $ref: '#/components/schemas/AgentId' },
                    },
                    ...PaginationQueryParameters,
                ],
                responses: {
                    '200': {
                        description: 'Paginated transcripts for the agent.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/PaginatedTranscripts' },
                            },
                        },
                    },
                },
            },
        },
        '/transcripts/agent/{agentId}/stats': {
            get: {
                tags: ['Transcripts'],
                summary: 'Aggregate transcript stats for one agent',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'agentId',
                        in: 'path',
                        required: true,
                        schema: { $ref: '#/components/schemas/AgentId' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Agent transcript stats.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: [
                                        'totalCalls',
                                        'browserCalls',
                                        'phoneCalls',
                                        'avgMessages',
                                    ],
                                    properties: {
                                        totalCalls: { type: 'integer' },
                                        browserCalls: { type: 'integer' },
                                        phoneCalls: { type: 'integer' },
                                        avgMessages: { type: ['number', 'null'] },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/traces/session/{sessionId}': {
            get: {
                tags: ['Traces'],
                summary: 'List Langfuse traces for a session',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'sessionId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                    {
                        name: 'page',
                        in: 'query',
                        schema: { type: 'integer', minimum: 1 },
                    },
                    {
                        name: 'limit',
                        in: 'query',
                        schema: { type: 'integer', minimum: 1, maximum: 100 },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Trace list.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['traces', 'pagination'],
                                    properties: {
                                        traces: {
                                            type: 'array',
                                            items: {
                                                $ref: '#/components/schemas/SessionTraceSummary',
                                            },
                                        },
                                        pagination: {
                                            type: 'object',
                                            required: ['page', 'limit', 'totalItems', 'totalPages'],
                                            properties: {
                                                page: { type: 'integer' },
                                                limit: { type: 'integer' },
                                                totalItems: { type: 'integer' },
                                                totalPages: { type: 'integer' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    '404': {
                        description: 'Trace session not found for caller scope.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/traces/session/{sessionId}/{traceId}': {
            get: {
                tags: ['Traces'],
                summary: 'Get one trace by trace id in a session',
                security: [{ ApiKeyAuth: [] }],
                parameters: [
                    {
                        name: 'sessionId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                    {
                        name: 'traceId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', minLength: 1, maxLength: 256 },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Trace detail.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['trace'],
                                    properties: {
                                        trace: { $ref: '#/components/schemas/SessionTraceDetail' },
                                    },
                                },
                            },
                        },
                    },
                    '404': {
                        description: 'Trace not found for session/caller scope.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/telephony/bindings': {
            get: {
                tags: ['Telephony'],
                summary: 'List telephony bindings',
                security: [{ ApiKeyAuth: [] }],
                responses: {
                    '200': {
                        description: 'Bindings list.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['bindings'],
                                    properties: {
                                        bindings: {
                                            type: 'array',
                                            items: { type: 'object', additionalProperties: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/telephony/livekit-webhook': {
            post: {
                tags: ['Telephony'],
                summary: 'Receive LiveKit telephony webhook',
                description:
                    'This endpoint expects the raw webhook body. Authentication uses LiveKit signature verification via Authorization header.',
                security: [{ LiveKitWebhookAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/webhook+json': {
                            schema: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        },
                        'application/json': {
                            schema: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Webhook accepted.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['ok'],
                                    properties: { ok: { type: 'boolean' } },
                                },
                            },
                        },
                    },
                    '401': {
                        description: 'Invalid webhook signature.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    '503': {
                        description: 'Telephony is disabled.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/telephony/calls': {
            post: {
                tags: ['Telephony'],
                summary: 'Outbound dialing (not implemented yet)',
                security: [{ ApiKeyAuth: [] }],
                responses: {
                    '501': {
                        description: 'Outbound dialing not implemented in this PoC.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
    },
} as const;
