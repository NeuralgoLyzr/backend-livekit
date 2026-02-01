/**
 * Server entry point
 * Starts the Express API server
 */

import dotenv from 'dotenv';

// Load environment variables FIRST (before importing config)
dotenv.config();

import { app } from './app.js';
import { config } from './config/index.js';
import { disconnectMongo } from './db/mongoose.js';

const port = config.server.port;

const server = app.listen(port, () => {
    console.log('\n LiveKit Backend Server Started');
    console.log('━'.repeat(50));
    console.log(`✓ Express server running on port ${port}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ LiveKit URL: ${config.livekit.url}`);
    console.log('\n Available Endpoints:');
    console.log(`   - Health check:  GET  http://localhost:${port}/health`);
    console.log(`   - Create session: POST http://localhost:${port}/session`);
    if (config.telephony.enabled) {
        console.log(
            `   - LiveKit webhook: POST http://localhost:${port}/telephony/livekit-webhook`
        );
    }
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
    console.log(`\n[shutdown] Received ${signal}. Closing server...`);

    // Stop accepting new connections.
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Close Mongo connection if it was opened.
    try {
        await disconnectMongo();
    } catch (error) {
        console.warn('[shutdown] Failed to disconnect Mongo:', error);
    }
}

process.on('SIGINT', () => {
    void shutdown('SIGINT').finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
    void shutdown('SIGTERM').finally(() => process.exit(0));
});
