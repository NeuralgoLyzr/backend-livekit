import { HttpError } from '../lib/httpErrors.js';
import type { TranscriptService } from './transcriptService.js';
import type {
    LangfuseTraceService,
    SessionTraceDetail,
    SessionTracePagination,
    SessionTraceSummary,
} from './langfuseTraceService.js';

export interface SessionTraceAccessContext {
    orgId: string;
    userId: string;
    isAdmin: boolean;
}

export interface SessionTraceService {
    listBySession(input: {
        sessionId: string;
        auth: SessionTraceAccessContext;
        page?: number;
        limit?: number;
    }): Promise<{
        traces: SessionTraceSummary[];
        pagination: SessionTracePagination;
    }>;
    getBySessionAndTraceId(input: {
        sessionId: string;
        traceId: string;
        auth: SessionTraceAccessContext;
    }): Promise<{ trace: SessionTraceDetail }>;
}

export interface CreateSessionTraceServiceDeps {
    transcriptService: TranscriptService;
    langfuseTraceService: LangfuseTraceService;
}

async function assertSessionAccess(
    transcriptService: TranscriptService,
    sessionId: string,
    auth: SessionTraceAccessContext
): Promise<void> {
    const transcript = await transcriptService.getBySessionId(sessionId);
    if (!transcript) {
        throw new HttpError(404, 'Trace session not found');
    }

    if (transcript.orgId !== auth.orgId) {
        throw new HttpError(404, 'Trace session not found');
    }

    if (!auth.isAdmin && transcript.createdByUserId !== auth.userId) {
        throw new HttpError(404, 'Trace session not found');
    }
}

export function createSessionTraceService(deps: CreateSessionTraceServiceDeps): SessionTraceService {
    return {
        async listBySession(input) {
            await assertSessionAccess(deps.transcriptService, input.sessionId, input.auth);
            return deps.langfuseTraceService.listTracesBySession({
                sessionId: input.sessionId,
                page: input.page,
                limit: input.limit,
            });
        },

        async getBySessionAndTraceId(input) {
            await assertSessionAccess(deps.transcriptService, input.sessionId, input.auth);
            const trace = await deps.langfuseTraceService.getTrace(input.traceId);
            if (trace.sessionId !== input.sessionId) {
                throw new HttpError(404, 'Trace not found for session');
            }
            return { trace };
        },
    };
}

