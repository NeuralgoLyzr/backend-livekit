import { HttpError } from '../lib/httpErrors.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeHost(host: string): string {
    return host.replace(/\/+$/, '');
}

function coerceString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function coerceNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseNumericRecord(value: unknown): Record<string, number> {
    if (!isRecord(value)) return {};

    const parsed: Record<string, number> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'number' && Number.isFinite(entry)) {
            parsed[key] = entry;
        }
    }
    return parsed;
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
    if (!isRecord(value)) return null;
    return value;
}

function truncate(value: string, max = 200): string {
    if (value.length <= max) return value;
    return value.slice(0, max) + '...';
}

export interface SessionTraceSummary {
    traceId: string;
    name: string | null;
    sessionId: string | null;
    timestamp: string;
    latencySeconds: number | null;
    totalCostUsd: number | null;
    observationCount: number;
    htmlPath: string | null;
}

export interface SessionTracePagination {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
}

export interface SessionTraceObservation {
    id: string;
    traceId: string | null;
    parentObservationId: string | null;
    type: string;
    name: string | null;
    level: string | null;
    startTime: string;
    endTime: string | null;
    completionStartTime: string | null;
    statusMessage: string | null;
    model: string | null;
    modelParameters: Record<string, unknown> | null;
    input: unknown;
    output: unknown;
    metadata: Record<string, unknown> | null;
    usageDetails: Record<string, number>;
    costDetails: Record<string, number>;
    environment: string | null;
}

export interface SessionTraceDetail {
    traceId: string;
    name: string | null;
    sessionId: string | null;
    timestamp: string;
    latencySeconds: number | null;
    totalCostUsd: number | null;
    htmlPath: string | null;
    observations: SessionTraceObservation[];
}

export interface LangfuseTraceService {
    listTracesBySession(input: {
        sessionId: string;
        page?: number;
        limit?: number;
    }): Promise<{
        traces: SessionTraceSummary[];
        pagination: SessionTracePagination;
    }>;
    getTrace(traceId: string): Promise<SessionTraceDetail>;
}

export interface CreateLangfuseTraceServiceDeps {
    host: string;
    publicKey: string;
    secretKey: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

function parseTraceSummary(value: unknown): SessionTraceSummary | null {
    if (!isRecord(value)) return null;

    const traceId = coerceString(value.id);
    const timestamp = coerceString(value.timestamp);
    if (!traceId || !timestamp) return null;

    const observations = Array.isArray(value.observations) ? value.observations : [];

    return {
        traceId,
        name: coerceString(value.name),
        sessionId: coerceString(value.sessionId),
        timestamp,
        latencySeconds: coerceNumber(value.latency),
        totalCostUsd: coerceNumber(value.totalCost),
        observationCount: observations.length,
        htmlPath: coerceString(value.htmlPath),
    };
}

function parseTraceObservation(value: unknown, fallbackTraceId: string): SessionTraceObservation | null {
    if (!isRecord(value)) return null;

    const id = coerceString(value.id);
    const type = coerceString(value.type);
    const startTime = coerceString(value.startTime);
    if (!id || !type || !startTime) return null;

    return {
        id,
        traceId: coerceString(value.traceId) ?? fallbackTraceId,
        parentObservationId: coerceString(value.parentObservationId),
        type,
        name: coerceString(value.name),
        level: coerceString(value.level),
        startTime,
        endTime: coerceString(value.endTime),
        completionStartTime: coerceString(value.completionStartTime),
        statusMessage: coerceString(value.statusMessage),
        model: coerceString(value.model),
        modelParameters: parseMetadata(value.modelParameters),
        input: value.input,
        output: value.output,
        metadata: parseMetadata(value.metadata),
        usageDetails: parseNumericRecord(value.usageDetails),
        costDetails: parseNumericRecord(value.costDetails),
        environment: coerceString(value.environment),
    };
}

function parseTraceDetail(value: unknown): SessionTraceDetail {
    if (!isRecord(value)) {
        throw new HttpError(502, 'Invalid Langfuse trace response');
    }

    const traceId = coerceString(value.id);
    const timestamp = coerceString(value.timestamp);
    if (!traceId || !timestamp) {
        throw new HttpError(502, 'Invalid Langfuse trace payload');
    }

    const rawObservations = Array.isArray(value.observations) ? value.observations : [];
    const observations: SessionTraceObservation[] = [];
    for (const raw of rawObservations) {
        const parsed = parseTraceObservation(raw, traceId);
        if (parsed) observations.push(parsed);
    }

    return {
        traceId,
        name: coerceString(value.name),
        sessionId: coerceString(value.sessionId),
        timestamp,
        latencySeconds: coerceNumber(value.latency),
        totalCostUsd: coerceNumber(value.totalCost),
        htmlPath: coerceString(value.htmlPath),
        observations,
    };
}

function ensureConfigured(deps: CreateLangfuseTraceServiceDeps): void {
    const host = deps.host.trim();
    const publicKey = deps.publicKey.trim();
    const secretKey = deps.secretKey.trim();
    if (host && publicKey && secretKey) return;

    throw new HttpError(503, 'Langfuse tracing is not configured on backend-livekit', {
        requiredEnv: ['LANGFUSE_HOST', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY'],
    });
}

export function createLangfuseTraceService(deps: CreateLangfuseTraceServiceDeps): LangfuseTraceService {
    const timeoutMs = Math.max(Math.floor(deps.timeoutMs ?? 7_000), 500);
    const fetchImpl = deps.fetchImpl ?? fetch;
    const host = normalizeHost(deps.host);

    function buildAuthHeader(): string {
        const token = Buffer.from(`${deps.publicKey}:${deps.secretKey}`).toString('base64');
        return `Basic ${token}`;
    }

    async function request(path: string, query?: Record<string, string>): Promise<unknown> {
        ensureConfigured(deps);

        const base = new URL(host + path);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                base.searchParams.set(key, value);
            }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetchImpl(base.toString(), {
                method: 'GET',
                headers: {
                    accept: 'application/json',
                    authorization: buildAuthHeader(),
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                const rawBody = await response.text().catch(() => '');
                if (response.status === 404) {
                    throw new HttpError(404, 'Trace not found');
                }
                throw new HttpError(502, `Langfuse request failed (${response.status})`, {
                    path,
                    body: truncate(rawBody),
                });
            }

            return await response.json();
        } catch (error) {
            if (error instanceof HttpError) throw error;
            if (error instanceof Error && error.name === 'AbortError') {
                throw new HttpError(502, 'Langfuse request timed out');
            }
            throw new HttpError(502, 'Failed to fetch traces from Langfuse', {
                path,
                reason: error instanceof Error ? error.message : String(error),
            });
        } finally {
            clearTimeout(timeout);
        }
    }

    return {
        async listTracesBySession(input) {
            const page = Math.max(Math.floor(input.page ?? 1), 1);
            const limit = Math.min(Math.max(Math.floor(input.limit ?? 20), 1), 100);

            const payload = await request('/api/public/traces', {
                sessionId: input.sessionId,
                page: String(page),
                limit: String(limit),
                fields: 'core,metrics,observations',
                orderBy: 'timestamp.desc',
            });

            if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.meta)) {
                throw new HttpError(502, 'Invalid Langfuse trace list response');
            }

            const traces = payload.data
                .map((item) => parseTraceSummary(item))
                .filter((item): item is SessionTraceSummary => item !== null);

            const meta = payload.meta;
            const pagination: SessionTracePagination = {
                page: typeof meta.page === 'number' ? meta.page : page,
                limit: typeof meta.limit === 'number' ? meta.limit : limit,
                totalItems: typeof meta.totalItems === 'number' ? meta.totalItems : traces.length,
                totalPages: typeof meta.totalPages === 'number' ? meta.totalPages : 1,
            };

            return { traces, pagination };
        },

        async getTrace(traceId) {
            const payload = await request(`/api/public/traces/${encodeURIComponent(traceId)}`);
            return parseTraceDetail(payload);
        },
    };
}

