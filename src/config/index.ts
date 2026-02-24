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

function parseOptionalPositiveInt(name: string, value: string | undefined): number | undefined {
    if (!value || value.trim() === '') {
        return undefined;
    }

    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer when set`);
    }
    return parsed;
}

function parseOptionalBoolean(name: string, value: string | undefined): boolean | undefined {
    if (!value || value.trim() === '') {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
        return true;
    }
    if (normalized === 'false') {
        return false;
    }
    throw new Error(`${name} must be "true" or "false" when set`);
}

const sessionStoreProvider = (
    process.env.SESSION_STORE_PROVIDER?.trim().toLowerCase() || 'memory'
) as 'memory' | 'redis';
if (sessionStoreProvider !== 'memory' && sessionStoreProvider !== 'redis') {
    throw new Error('SESSION_STORE_PROVIDER must be "memory" or "redis"');
}

const recordingStorageProvider = (
    process.env.RECORDING_STORAGE_PROVIDER?.trim().toLowerCase() || 'local'
) as 'local' | 's3';
if (recordingStorageProvider !== 'local' && recordingStorageProvider !== 's3') {
    throw new Error('RECORDING_STORAGE_PROVIDER must be "local" or "s3"');
}

const redisUrl = process.env.REDIS_URL?.trim() || '';
if (sessionStoreProvider === 'redis' && !redisUrl) {
    throw new Error('REDIS_URL is required when SESSION_STORE_PROVIDER=redis');
}

const s3Bucket = process.env.S3_RECORDINGS_BUCKET?.trim() || '';
const s3Region = process.env.S3_REGION?.trim() || '';
if (recordingStorageProvider === 's3') {
    if (!s3Bucket) {
        throw new Error('S3_RECORDINGS_BUCKET is required when RECORDING_STORAGE_PROVIDER=s3');
    }
    if (!s3Region) {
        throw new Error('S3_REGION is required when RECORDING_STORAGE_PROVIDER=s3');
    }
}

const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || '';
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || '';
if ((s3AccessKeyId && !s3SecretAccessKey) || (!s3AccessKeyId && s3SecretAccessKey)) {
    throw new Error(
        'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must both be set when using static S3 credentials'
    );
}

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
    sessionStore: {
        provider: sessionStoreProvider,
        redis: {
            url: redisUrl,
            keyPrefix: process.env.REDIS_SESSION_KEY_PREFIX?.trim() || 'session:',
            ttlSeconds: parseOptionalPositiveInt(
                'REDIS_SESSION_TTL_SECONDS',
                process.env.REDIS_SESSION_TTL_SECONDS
            ),
        },
    },
    recordingStorage: {
        provider: recordingStorageProvider,
        local: {
            recordingsDir: process.env.RECORDINGS_DIR?.trim() || 'data/recordings',
        },
        s3: {
            bucket: s3Bucket,
            region: s3Region,
            keyPrefix: process.env.S3_RECORDINGS_KEY_PREFIX?.trim() || 'recordings/',
            endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
            forcePathStyle: parseOptionalBoolean(
                'S3_FORCE_PATH_STYLE',
                process.env.S3_FORCE_PATH_STYLE
            ),
            accessKeyId: s3AccessKeyId || undefined,
            secretAccessKey: s3SecretAccessKey || undefined,
            sessionToken: process.env.S3_SESSION_TOKEN?.trim() || undefined,
        },
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
