import { describe, expect, it } from 'vitest';

import { setRequiredEnv } from './testUtils.js';

describe('session observability contract', () => {
    it('accepts a python-agent compatible ingest payload with forward-compatible fields', async () => {
        setRequiredEnv();

        const [{ SessionObservabilityIngestSchema }, { SessionReportSchema }] = await Promise.all([
            import('../dist/types/index.js'),
            import('../dist/types/sessionReport.js'),
        ]);

        const reportPayload = {
            job_id: 'job-123',
            room_id: 'room-id-123',
            room: 'room-contract-1',
            events: [
                {
                    type: 'agent_state_changed',
                    created_at: 1,
                    old_state: 'listening',
                    new_state: 'thinking',
                },
                { type: 'unknown_runtime_event', created_at: 2, extra_payload: { foo: 'bar' } },
            ],
            chat_history: {
                items: [
                    {
                        type: 'message',
                        id: 'msg-1',
                        created_at: 1,
                        role: 'user',
                        content: ['hello'],
                    },
                    {
                        type: 'provider_custom_item',
                        id: 'custom-1',
                        created_at: 2,
                        any_new_field: true,
                    },
                ],
            },
            timestamp: 3,
            provider_specific_field: {
                nested: true,
            },
        };

        const reportResult = SessionReportSchema.safeParse(reportPayload);
        expect(reportResult.success).toBe(true);
        if (!reportResult.success) {
            throw new Error('Session report fixture should be valid');
        }

        const ingestResult = SessionObservabilityIngestSchema.safeParse({
            roomName: 'room-contract-1',
            sessionId: '00000000-0000-4000-8000-000000000000',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            closeReason: null,
            sessionReport: reportPayload,
        });

        expect(ingestResult.success).toBe(true);
    });

    it('rejects ingest payloads that break the required session report contract', async () => {
        setRequiredEnv();

        const { SessionObservabilityIngestSchema } = await import('../dist/types/index.js');

        const ingestResult = SessionObservabilityIngestSchema.safeParse({
            roomName: 'room-contract-1',
            sessionId: '00000000-0000-4000-8000-000000000000',
            orgId: '96f0cee4-bb87-4477-8eff-577ef2780614',
            sessionReport: {
                room: 'room-contract-1',
                // Missing required job_id + room_id + timestamp
                events: [],
            },
        });

        expect(ingestResult.success).toBe(false);
        if (ingestResult.success) {
            throw new Error('Expected schema parse to fail');
        }

        const paths = ingestResult.error.issues.map((issue) => issue.path.join('.'));
        expect(paths).toEqual(
            expect.arrayContaining([
                'sessionReport.job_id',
                'sessionReport.room_id',
                'sessionReport.timestamp',
            ])
        );
    });
});
