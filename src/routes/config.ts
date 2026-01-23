import { Router } from 'express';
import { toolRegistry } from '../config/tools.js';

const router: Router = Router();

router.get('/tools', (_req, res) => {
    res.json({
        tools: toolRegistry,
    });
});

export default router;
