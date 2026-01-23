/**
 * Health check endpoint
 */

import { Router } from 'express';

const router: Router = Router();
const startTime = Date.now();

router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
    });
});

export default router;
