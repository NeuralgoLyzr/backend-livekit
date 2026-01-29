/**
 * Token Service
 * Handles LiveKit access token generation
 */

import { AccessToken } from 'livekit-server-sdk';
import { config } from '../config/index.js';

export const tokenService = {
    /**
     * Create a user access token with short TTL
     * @param userIdentity - Unique user identifier
     * @param roomName - Room name to join
     * @returns JWT token string
     */
    async createUserToken(userIdentity: string, roomName: string): Promise<string> {
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

        return at.toJwt();
    },
};
