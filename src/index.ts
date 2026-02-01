/**
 * Server entry point
 * Starts the Express API server
 */

import dotenv from 'dotenv';
import type { AddressInfo } from 'node:net';

// Load environment variables FIRST (before importing config)
dotenv.config();

import { app } from './app.js';
import { config } from './config/index.js';
import { disconnectMongo } from './db/mongoose.js';

const configuredPort = config.server.port;

const server = app.listen(configuredPort);

server.once('listening', () => {
    const address = server.address();
    const actualPort =
        address && typeof address !== 'string' ? (address as AddressInfo).port : configuredPort;

    console.log('\n LiveKit Backend Server Started');
    console.log('━'.repeat(50));
    console.log(`✓ Express server running on port ${actualPort}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ LiveKit URL: ${config.livekit.url}`);
    console.log('\n Available Endpoints:');
    console.log(`   - Health check:  GET  http://localhost:${actualPort}/health`);
    console.log(`   - Create session: POST http://localhost:${actualPort}/session`);
    if (config.telephony.enabled) {
        console.log(
            `   - LiveKit webhook: POST http://localhost:${actualPort}/telephony/livekit-webhook`
        );
    }
});

server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`[startup] Port ${configuredPort} is already in use.`);
        console.error('[startup] Stop the other process or start with a different PORT.');
        process.exit(1);
    }

    if (error.code === 'EACCES') {
        console.error(`[startup] No permission to bind to port ${configuredPort}.`);
        process.exit(1);
    }

    console.error('[startup] Failed to start server:', error);
    process.exit(1);
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
