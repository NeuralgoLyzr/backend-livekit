/**
 * Token Service
 * Handles LiveKit access token generation
 */

import { AccessToken } from 'livekit-server-sdk';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

export const tokenService = {
    /**
     * Create a user access token with short TTL
     * @param userIdentity - Unique user identifier
     * @param roomName - Room name to join
     * @returns JWT token string
     */
    async createUserToken(userIdentity: string, roomName: string): Promise<string> {
        const start = Date.now();
        try {
            const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
                identity: userIdentity,
                ttl: config.token.ttl,
            });

            at.addGrant({
                roomJoin: true,
                room: roomName,
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
            });

            const token = at.toJwt();
            logger.info(
                {
                    event: 'livekit_token_issued',
                    roomName,
                    userIdentity,
                    ttlSeconds: config.token.ttl,
                    durationMs: Date.now() - start,
                    outcome: 'success',
                },
                'Issued LiveKit user token'
            );
            return token;
        } catch (error) {
            logger.error(
                {
                    event: 'livekit_token_issued',
                    roomName,
                    userIdentity,
                    ttlSeconds: config.token.ttl,
                    durationMs: Date.now() - start,
                    outcome: 'error',
                    err: error,
                },
                'Failed to issue LiveKit user token'
            );
            throw error;
        }
    },
};
