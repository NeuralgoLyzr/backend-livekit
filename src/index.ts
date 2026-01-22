/**
 * Server entry point
 * Starts the Express API server
 */

import dotenv from 'dotenv';

// Load environment variables FIRST (before importing config)
dotenv.config();

import { app } from './app.js';
import { config } from './config/index.js';

const port = config.server.port;

app.listen(port, () => {
  console.log('\n LiveKit Backend Server Started');
  console.log('━'.repeat(50));
  console.log(`✓ Express server running on port ${port}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ LiveKit URL: ${config.livekit.url}`);
  console.log('\n Available Endpoints:');
  console.log(`   - Health check:  GET  http://localhost:${port}/health`);
  console.log(`   - Create session: POST http://localhost:${port}/session`);
  if (config.telephony.enabled) {
    console.log(`   - LiveKit webhook: POST http://localhost:${port}/telephony/livekit-webhook`);
  }
  console.log('━'.repeat(50));
  console.log('\n To start the agent server, run:');
  console.log('   npm run dev:agent\n');
});
