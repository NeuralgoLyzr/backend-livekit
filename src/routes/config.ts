import { Router } from 'express';
import { toolRegistry } from '../config/tools.js';
import { getRealtimeOptions } from '../config/realtimeOptions.js';

const router: Router = Router();

router.get('/tools', (_req, res) => {
    res.json({
        tools: toolRegistry,
    });
});

router.get('/realtime-options', async (_req, res) => {
    const options = await getRealtimeOptions();
    res.json(options);
});

export default router;
