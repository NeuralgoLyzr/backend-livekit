/**
 * Custom LiveKit Agent Server
 * Listens for dispatch requests and joins rooms with dynamic configuration
 */

import { type JobContext, WorkerOptions, cli, defineAgent, voice } from '@livekit/agents';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export default defineAgent({
  entry: async (ctx: JobContext) => {
    console.log('Agent Job Started');
    console.log('━'.repeat(50));

    // Parse metadata from dispatch request
    const metadata = JSON.parse(ctx.job.metadata || '{}');
    console.log('📦 Received configuration:', JSON.stringify(metadata, null, 2));

    // Extract configuration with defaults.
    // These are full LiveKit Inference descriptors, e.g.:
    //   - STT: "assemblyai/universal-streaming:en", "deepgram/nova-3:en"
    //   - TTS: "cartesia/sonic-3:VOICE_ID", "elevenlabs/tts:VOICE_ID"
    //   - LLM: "openai/gpt-4.1-mini", "google/gemini-2.5-flash"
    const sttConfig: string = metadata.stt ?? 'assemblyai/universal-streaming:en';
    const ttsConfig: string =
      metadata.tts ?? 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc';
    const llmConfig: string = metadata.llm ?? 'openai/gpt-4o-mini';
    const systemPrompt: string =
      metadata.prompt ?? 'You are a helpful AI assistant.';

    console.log('Applied configuration:');
    console.log(`   - STT: ${sttConfig}`);
    console.log(`   - TTS: ${ttsConfig}`);
    console.log(`   - LLM: ${llmConfig}`);
    console.log(`   - Prompt: "${systemPrompt.substring(0, 50)}..."`);

    // Create agent with custom prompt
    const agent = new voice.Agent({
      instructions: systemPrompt,
    });

    // Create session with dynamic STT/TTS/LLM
    const session = new voice.AgentSession({
      stt: sttConfig,
      llm: llmConfig,
      tts: ttsConfig,
    });

    // Connect to room
    await ctx.connect();
    console.log(`✓ Connected to room: ${ctx.room.name}`);

    // Publish hello data message
    const helloMessage = JSON.stringify({
      type: 'hello',
      message: 'Agent connected and ready',
      timestamp: Date.now(),
      config: {
        stt: sttConfig,
        tts: ttsConfig,
        llm: llmConfig,
      },
    });

    await ctx.room.localParticipant?.publishData(
      new TextEncoder().encode(helloMessage),
      {
        reliable: true,
        topic: 'agent-messages',
      }
    );

    console.log('✓ Published hello message to room');
    console.log('━'.repeat(50));
    console.log(`🎙️  Agent active in room: ${ctx.room.name}\n`);

    // Start the voice session
    await session.start({ agent, room: ctx.room });
  },
});

// Run agent server with explicit name (required for dispatch)
cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'custom-agent', // Must match config.agent.name in backend
  })
);
