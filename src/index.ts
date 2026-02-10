/**
 * Server entry point
 * Starts the Express API server
 */

import 'dotenv/config';
import type { AddressInfo } from 'node:net';

import { app } from './app.js';
import { config } from './config/index.js';
import { disconnectMongo } from './db/mongoose.js';
import { logger, shutdownLogger } from './lib/logger.js';

const configuredPort = config.server.port;

const server = app.listen(configuredPort);

server.once('listening', () => {
    const address = server.address();
    const actualPort =
        address && typeof address !== 'string' ? (address as AddressInfo).port : configuredPort;

    const baseUrl = `http://localhost:${actualPort}`;

    logger.info(
        {
            event: 'startup',
            port: actualPort,
            environment: process.env.NODE_ENV || 'development',
            livekitUrl: config.livekit.url,
            telephonyEnabled: config.telephony.enabled,
            endpoints: {
                health: `GET ${baseUrl}/health`,
                root: `GET ${baseUrl}/`,
                createSession: `POST ${baseUrl}/session`,
                ...(config.telephony.enabled
                    ? { livekitWebhook: `POST ${baseUrl}/telephony/livekit-webhook` }
                    : {}),
            },
        },
        'LiveKit Backend Server Started'
    );
});

server.on('error', (error: NodeJS.ErrnoException) => {
    void (async () => {
        if (error.code === 'EADDRINUSE') {
            logger.error(
                { event: 'startup_error', code: error.code, port: configuredPort, err: error },
                'Port is already in use'
            );
            await shutdownLogger();
            process.exit(1);
        }

        if (error.code === 'EACCES') {
            logger.error(
                { event: 'startup_error', code: error.code, port: configuredPort, err: error },
                'No permission to bind to port'
            );
            await shutdownLogger();
            process.exit(1);
        }

        logger.error(
            { event: 'startup_error', code: error.code, port: configuredPort, err: error },
            'Failed to start server'
        );
        await shutdownLogger();
        process.exit(1);
    })();
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
    logger.info({ event: 'shutdown_signal', signal }, 'Closing server');

    // Stop accepting new connections.
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Close Mongo connection if it was opened.
    try {
        await disconnectMongo();
    } catch (error) {
        logger.warn(
            { event: 'shutdown_mongo_disconnect_failed', err: error },
            'Failed to disconnect Mongo'
        );
    }

    await shutdownLogger();
}

process.on('SIGINT', () => {
    void shutdown('SIGINT').finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
    void shutdown('SIGTERM').finally(() => process.exit(0));
});
