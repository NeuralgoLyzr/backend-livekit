import type { AccessToken } from 'livekit-server-sdk';

export interface TokenServiceDeps {
    createAccessToken: (identity: string) => AccessToken;
}

export function createTokenService(deps: TokenServiceDeps) {
    return {
        async createUserToken(userIdentity: string, roomName: string): Promise<string> {
            const at = deps.createAccessToken(userIdentity);

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
}

export type TokenService = ReturnType<typeof createTokenService>;
