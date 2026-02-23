/**
 * Configuration module
 * Loads and validates environment variables
 */

const requiredEnvVars = [
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    // Used to resolve { orgId, userId, role } from `x-api-key` for transcripts scoping.
    'PAGOS_API_URL',
    'PAGOS_ADMIN_TOKEN',
] as const;

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}

export const config = {
    livekit: {
        url: process.env.LIVEKIT_URL!,
        apiKey: process.env.LIVEKIT_API_KEY!,
        apiSecret: process.env.LIVEKIT_API_SECRET!,
    },
    pagos: {
        apiUrl: process.env.PAGOS_API_URL!,
        adminToken: process.env.PAGOS_ADMIN_TOKEN!,
    },
    langfuse: {
        host: process.env.LANGFUSE_HOST?.trim() || '',
        publicKey: process.env.LANGFUSE_PUBLIC_KEY?.trim() || '',
        secretKey: process.env.LANGFUSE_SECRET_KEY?.trim() || '',
    },
    server: {
        port: parseInt(process.env.PORT || '4000', 10),
    },
    token: {
        ttl: '10m', // Short-lived tokens (10 minutes)
    },
    agent: {
        name: process.env.AGENT_NAME || 'local-test', // Agent name for explicit dispatch  ('custom-agent' init name)
    },
    telephony: {
        enabled: process.env.TELEPHONY_ENABLED === 'true',
        webhook: {
            // By default, validate webhook JWTs using the same LiveKit key/secret.
            // Can be overridden if you sign webhooks with a different key.
            apiKey: process.env.LIVEKIT_WEBHOOK_API_KEY || process.env.LIVEKIT_API_KEY!,
            apiSecret: process.env.LIVEKIT_WEBHOOK_API_SECRET || process.env.LIVEKIT_API_SECRET!,
        },
        sipIdentityPrefix: process.env.TELEPHONY_SIP_IDENTITY_PREFIX || 'sip_',
        dispatchOnAnyParticipantJoin:
            process.env.TELEPHONY_DISPATCH_ON_ANY_PARTICIPANT_JOIN === 'true',
        management: {
            encryptionKey: process.env.TELEPHONY_SECRETS_KEY
                ? Buffer.from(process.env.TELEPHONY_SECRETS_KEY, 'base64')
                : null,
            livekitSipHost: process.env.LIVEKIT_SIP_HOST || '',
            livekitProvisioning: {
                inboundTrunkName:
                    process.env.TELEPHONY_LIVEKIT_INBOUND_TRUNK_NAME || 'byoc-inbound',
                dispatchRuleName:
                    process.env.TELEPHONY_LIVEKIT_DISPATCH_RULE_NAME || 'byoc-dispatch',
                dispatchRoomPrefix:
                    process.env.TELEPHONY_LIVEKIT_DISPATCH_ROOM_PREFIX || 'call-',
            },
        },
    },
    telnyx: {
        devApiKey: process.env.TELNYX_API_KEY || '',
    },
    ttsVoicesProxy: {
        /**
         * Optional provider API keys used by backend-livekit to proxy TTS voice lists.
         * These are NOT required to start the server; endpoints will return 503 with
         * requiredEnv when a provider is queried without its credentials.
         */
        cartesia: {
            apiKey: process.env.CARTESIA_API_KEY?.trim() || '',
            version: process.env.CARTESIA_VERSION?.trim() || '2025-04-16',
        },
        elevenlabs: {
            apiKey: process.env.ELEVENLABS_API_KEY?.trim() || '',
        },
        deepgram: {
            apiKey: process.env.DEEPGRAM_API_KEY?.trim() || '',
        },
        inworld: {
            /**
             * Base64 API credentials used for Inworld API Basic auth.
             * Used to build `Authorization: Basic <base64>`.
             */
            base64: process.env.INWORLD_BASE_64?.trim() || '',
        },
    },
};
