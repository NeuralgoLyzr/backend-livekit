/**
 * Configuration module
 * Loads and validates environment variables
 */

import dotenv from 'dotenv';

// Load environment variables for this module
dotenv.config();

const requiredEnvVars = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const;

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
  server: {
    port: parseInt(process.env.PORT || '4000', 10),
  },
  token: {
    ttl: '10m', // Short-lived tokens (10 minutes)
  },
  agent: {
    name: process.env.AGENT_NAME || 'shreya-obnox', // Agent name for explicit dispatch  ('custom-agent' init name)
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
  },
};
