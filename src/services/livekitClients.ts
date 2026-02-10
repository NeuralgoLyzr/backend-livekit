import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config/index.js';

const { url, apiKey, apiSecret } = config.livekit;

export const livekitClients = {
    agentDispatch: new AgentDispatchClient(url, apiKey, apiSecret),
    roomService: new RoomServiceClient(url, apiKey, apiSecret),

    createAccessToken(identity: string): AccessToken {
        return new AccessToken(apiKey, apiSecret, {
            identity,
            ttl: config.token.ttl,
        });
    },
};

export type LiveKitClients = typeof livekitClients;
