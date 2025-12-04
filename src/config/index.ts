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
};
