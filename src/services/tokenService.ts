import type { AccessToken } from 'livekit-server-sdk';
import { logger } from '../lib/logger.js';

export interface TokenServiceDeps {
    createAccessToken: (identity: string) => AccessToken;
}

export function createTokenService(deps: TokenServiceDeps) {
    return {
        async createUserToken(userIdentity: string, roomName: string): Promise<string> {
            const start = Date.now();
            try {
                const at = deps.createAccessToken(userIdentity);

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
}

export type TokenService = ReturnType<typeof createTokenService>;
