import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { importFreshApp } from './testUtils';

describe('auth enforcement (HTTP)', () => {
    it('GET /agents returns 401 when x-api-key is missing', async () => {
        const app = await importFreshApp();
        await request(app).get('/agents').expect(401);
    });

    it('GET /agents succeeds with x-api-key', async () => {
        const app = await importFreshApp({ sessionServiceMock: {} });
        const res = await request(app).get('/agents').set('x-api-key', 'dev').expect(200);
        expect(res.body).toEqual({ agents: [] });
    });

    it('GET /telephony/bindings returns 401 when x-api-key is missing', async () => {
        const app = await importFreshApp();
        await request(app).get('/telephony/bindings').expect(401);
    });

    it('POST /telephony/livekit-webhook does not require x-api-key', async () => {
        const app = await importFreshApp({ env: { TELEPHONY_ENABLED: 'false' } });
        await request(app).post('/telephony/livekit-webhook').send({}).expect(503);
    });
});
