import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setRequiredEnv } from './testUtils.js';

function buildStore() {
    return {
        save: vi.fn(),
        findBySessionId: vi.fn(),
        findByAgentId: vi.fn(),
        getAgentStats: vi.fn(),
        list: vi.fn(),
    };
}

describe('transcriptService (unit)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('parses observability report and computes transcript fields', async () => {
        setRequiredEnv();
        const { createTranscriptService } = await import('../dist/services/transcriptService.js');

        const store = buildStore();
        store.save.mockResolvedValue({ id: 'tr-1' });
        const service = createTranscriptService({
            store,
        });

        await service.saveFromObservability({
            roomName: 'room-1',
            sessionId: 'session-1',
            agentId: '507f1f77bcf86cd799439011',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            createdByUserId: 'member_user_1',
            closeReason: 'normal',
            rawSessionReport: {
                job_id: 'job-1',
                room_id: 'rid-1',
                room: 'room-1',
                events: [
                    {
                        type: 'agent_state_changed',
                        created_at: 1,
                        old_state: 'listening',
                        new_state: 'thinking',
                    },
                    {
                        type: 'close',
                        created_at: 3,
                        reason: 'normal',
                    },
                ],
                chat_history: {
                    items: [
                        {
                            type: 'message',
                            id: 'msg-1',
                            created_at: 1,
                            role: 'user',
                            content: ['Hello'],
                        },
                        {
                            type: 'function_call',
                            id: 'fn-1',
                            created_at: 2,
                            name: 'lookup',
                        },
                        {
                            type: 'message',
                            id: 'msg-2',
                            created_at: 3,
                            role: 'assistant',
                            content: ['Hi'],
                        },
                    ],
                },
                timestamp: 4,
            },
        });

        expect(store.save).toHaveBeenCalledTimes(1);
        const [saved] = store.save.mock.calls[0] as [Record<string, unknown>];
        expect(saved.sessionId).toBe('session-1');
        expect(saved.roomName).toBe('room-1');
        expect(saved.agentId).toBe('507f1f77bcf86cd799439011');
        expect(saved.orgId).toBe('96f0cee4-bb87-4477-8eff-577ef2780614');
        expect(saved.createdByUserId).toBe('member_user_1');
        expect(saved.closeReason).toBe('normal');
        expect(saved.messageCount).toBe(2);
        expect(saved.durationMs).toBe(2000);
        expect((saved.startedAt as Date).toISOString()).toBe('1970-01-01T00:00:01.000Z');
        expect((saved.endedAt as Date).toISOString()).toBe('1970-01-01T00:00:04.000Z');
    });

    it('falls back to timestamp when events are empty', async () => {
        setRequiredEnv();
        const { createTranscriptService } = await import('../dist/services/transcriptService.js');

        const store = buildStore();
        store.save.mockResolvedValue({ id: 'tr-2' });
        const service = createTranscriptService({
            store,
        });

        await service.saveFromObservability({
            roomName: 'room-2',
            sessionId: 'session-2',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            rawSessionReport: {
                job_id: 'job-2',
                room_id: 'rid-2',
                room: 'room-2',
                events: [],
                timestamp: 10,
            },
        });

        const [saved] = store.save.mock.calls[0] as [Record<string, unknown>];
        expect(saved.agentId).toBeNull();
        expect(saved.createdByUserId).toBeNull();
        expect(saved.closeReason).toBeNull();
        expect(saved.messageCount).toBe(0);
        expect(saved.durationMs).toBeNull();
        expect((saved.startedAt as Date).toISOString()).toBe('1970-01-01T00:00:10.000Z');
        expect((saved.endedAt as Date).toISOString()).toBe('1970-01-01T00:00:10.000Z');
    });

    it('rejects report when first event timestamp is not numeric', async () => {
        setRequiredEnv();
        const { createTranscriptService } = await import('../dist/services/transcriptService.js');

        const store = buildStore();
        const service = createTranscriptService({
            store,
        });

        const result = await service.saveFromObservability({
            roomName: 'room-3a',
            sessionId: 'session-3a',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            rawSessionReport: {
                job_id: 'job-3a',
                room_id: 'rid-3a',
                room: 'room-3a',
                events: [
                    { type: 'agent_state_changed', created_at: 'oops', old_state: 'listening', new_state: 'thinking' },
                    { type: 'close', created_at: 4, reason: 'normal' },
                ],
                timestamp: 4,
            },
        });

        expect(result).toBeNull();
        expect(store.save).not.toHaveBeenCalled();
    });

    it('rejects report when last event timestamp is not numeric', async () => {
        setRequiredEnv();
        const { createTranscriptService } = await import('../dist/services/transcriptService.js');

        const store = buildStore();
        const service = createTranscriptService({
            store,
        });

        const result = await service.saveFromObservability({
            roomName: 'room-3b',
            sessionId: 'session-3b',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            rawSessionReport: {
                job_id: 'job-3b',
                room_id: 'rid-3b',
                room: 'room-3b',
                events: [
                    { type: 'agent_state_changed', created_at: 1, old_state: 'listening', new_state: 'thinking' },
                    { type: 'close', created_at: 'oops', reason: 'normal' },
                ],
                timestamp: 4,
            },
        });

        expect(result).toBeNull();
        expect(store.save).not.toHaveBeenCalled();
    });

    it('returns null and skips persistence when report is invalid', async () => {
        setRequiredEnv();
        const { createTranscriptService } = await import('../dist/services/transcriptService.js');

        const store = buildStore();
        const service = createTranscriptService({
            store,
        });

        const result = await service.saveFromObservability({
            roomName: 'room-3',
            sessionId: 'session-3',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            rawSessionReport: {
                room: 'room-3',
                events: [],
            },
        });

        expect(result).toBeNull();
        expect(store.save).not.toHaveBeenCalled();
    });

    it('logs validation warnings with bounded issues for invalid reports', async () => {
        setRequiredEnv();
        const { logger } = await import('../dist/lib/logger.js');
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
        const { createTranscriptService } = await import('../dist/services/transcriptService.js');

        const store = buildStore();
        const service = createTranscriptService({
            store,
        });

        const result = await service.saveFromObservability({
            roomName: 'room-invalid',
            sessionId: 'session-invalid',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            rawSessionReport: {},
        });

        expect(result).toBeNull();
        expect(store.save).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(1);

        const [payload, message] = warnSpy.mock.calls[0] as [Record<string, unknown>, string];
        expect(payload).toMatchObject({
            event: 'transcript_ingest_invalid_report',
            roomName: 'room-invalid',
        });
        expect(Array.isArray(payload.issues)).toBe(true);
        expect((payload.issues as unknown[]).length).toBeGreaterThan(0);
        expect((payload.issues as unknown[]).length).toBeLessThanOrEqual(5);
        expect(message).toBe('Session report failed validation — skipping transcript persistence');
    });

    it('logs at most 5 validation issues when report has many issues', async () => {
        setRequiredEnv();
        const { logger } = await import('../dist/lib/logger.js');
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
        const { createTranscriptService } = await import('../dist/services/transcriptService.js');

        const store = buildStore();
        const service = createTranscriptService({
            store,
        });

        await service.saveFromObservability({
            roomName: 'room-many-issues',
            sessionId: 'session-many-issues',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            rawSessionReport: {
                job_id: 123,
                room_id: false,
                room: 999,
                events: [
                    {
                        type: 'close',
                        created_at: 'bad-ts',
                        reason: 42,
                    },
                ],
                chat_history: {
                    items: [
                        {
                            type: 'message',
                            id: 7,
                            created_at: 'bad',
                            role: null,
                            content: [123],
                        },
                    ],
                },
                timestamp: 'bad-ts',
            },
        });

        expect(store.save).not.toHaveBeenCalled();
        const [payload] = warnSpy.mock.calls[0] as [Record<string, unknown>];
        const issues = payload.issues as unknown[];
        expect(Array.isArray(issues)).toBe(true);
        expect(issues).toHaveLength(5);
    });

    it('delegates read/list calls to transcript store', async () => {
        setRequiredEnv();
        const { createTranscriptService } = await import('../dist/services/transcriptService.js');

        const store = buildStore();
        store.findBySessionId.mockResolvedValue({ id: 'a' });
        store.findByAgentId.mockResolvedValue({
            items: [],
            total: 0,
            limit: 50,
            offset: 0,
            nextOffset: null,
        });
        store.getAgentStats.mockResolvedValue({
            totalCalls: 1,
            browserCalls: 1,
            phoneCalls: 0,
            avgMessages: 2,
        });
        store.list.mockResolvedValue({
            items: [],
            total: 0,
            limit: 10,
            offset: 0,
            nextOffset: null,
        });
        const service = createTranscriptService({
            store,
        });

        await service.getBySessionId('session-10');
        await service.listByAgentId(
            { orgId: 'org-1', agentId: 'agent-1', createdByUserId: 'user-1' },
            { limit: 5 }
        );
        await service.getAgentStats({ orgId: 'org-1', agentId: 'agent-1' });
        await service.list({ orgId: 'org-1', agentId: 'agent-1' }, { limit: 10, offset: 2 });

        expect(store.findBySessionId).toHaveBeenCalledWith('session-10');
        expect(store.findByAgentId).toHaveBeenCalledWith(
            { orgId: 'org-1', agentId: 'agent-1', createdByUserId: 'user-1' },
            { limit: 5 }
        );
        expect(store.getAgentStats).toHaveBeenCalledWith({ orgId: 'org-1', agentId: 'agent-1' });
        expect(store.list).toHaveBeenCalledWith(
            { orgId: 'org-1', agentId: 'agent-1' },
            { limit: 10, offset: 2 }
        );
    });
});
