import { Router } from 'express';
import { toolRegistry } from '../config/tools.js';
import { getRealtimeOptions } from '../config/realtimeOptions.js';
import { getPipelineOptions } from '../config/pipelineOptions.js';

const router: Router = Router();

router.get('/tools', (_req, res) => {
    res.json({
        tools: toolRegistry,
    });
});

router.get('/realtime-options', (_req, res) => {
    const options = getRealtimeOptions();
    res.json(options);
});

router.get('/pipeline-options', (_req, res) => {
    const options = getPipelineOptions();
    res.json(options);
});

export default router;
