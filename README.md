# LiveKit Backend

Node.js + TypeScript backend that issues LiveKit access tokens and dispatches custom agents with dynamic STT/TTS/prompt configuration.

## Features

- ✅ Generate short-lived LiveKit access tokens (10-minute TTL)
- ✅ Dispatch agents with custom STT, TTS, and LLM configurations
- ✅ Dynamic agent configuration via metadata
- ✅ Modular, production-ready code structure
- ✅ TypeScript with ES modules
- ✅ Health check endpoint
- ✅ CORS-enabled for frontend integration

## Architecture

This backend now only runs the **Express API server** (`src/index.ts`).  
It still dispatches agents via the LiveKit API, but the LiveKit agent itself now lives in a different repository.  
Historical agent code remains in `src/agents/customAgent_unused_file.ts` purely for reference and is no longer executed.  
Likewise, the old `agentFactory` helper has been archived as `agentFactory_unused_file.ts`.

## Project Structure

```
backend/
├── src/
│   ├── index.ts                 # Express server entry point
│   ├── app.ts                   # Express app setup
│   ├── config/
│   │   └── index.ts             # Configuration loader
│   ├── routes/
│   │   ├── session.ts           # POST /session endpoint
│   │   └── health.ts            # GET /health endpoint
│   ├── services/
│   │   ├── tokenService.ts      # Token generation
│   │   └── agentService.ts      # Agent dispatch
│   ├── lib/
│   │   └── storage.ts           # Session storage
│   └── agents/
│       ├── customAgent_unused_file.ts   # Legacy agent example (not used)
│       └── agentFactory_unused_file.ts  # Legacy STT/TTS/LLM helper (not used)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your LiveKit credentials:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
PORT=3000
```

### 3. Run the API Server

The backend now only needs the Express API process:

```bash
npm run dev:api
```

For production:

```bash
npm run build
npm run start:api
```

> The LiveKit agent itself runs from a different repository. Keep that process running separately when you want full voice flows; the legacy agent sample that lived in this repo is now archived in `src/agents/customAgent_unused_file.ts`.

## API Documentation

### POST /session

Creates a new session with user token and dispatches an agent.

**Request:**
```json
{
  "userIdentity": "user123",
  "roomName": "optional-room-name",
  "agentConfig": {
    "stt": "deepgram",
    "tts": "cartesia",
    "prompt": "You are a friendly customer support agent.",
    "llm": "gpt-4o-mini"
  }
}
```

**Response:**
```json
{
  "userToken": "eyJhbGc...",
  "roomName": "room-uuid",
  "livekitUrl": "wss://your-project.livekit.cloud",
  "agentDispatched": true,
  "agentConfig": {
    "stt": "deepgram",
    "tts": "cartesia",
    "llm": "gpt-4o-mini"
  }
}
```

**Fields:**
- `userIdentity` (required): Unique identifier for the user
- `roomName` (optional): Room name; auto-generated if not provided
- `agentConfig` (optional): Agent configuration object
  - `stt` (optional): STT provider - `deepgram`, `assemblyai`, `openai` (default: `deepgram`)
  - `tts` (optional): TTS provider - `cartesia`, `openai`, `elevenlabs` (default: `cartesia`)
  - `prompt` (optional): System prompt for the agent (default: `"You are a helpful AI assistant."`)
  - `llm` (optional): LLM model - `gpt-4o-mini`, `gpt-4o`, etc. (default: `gpt-4o-mini`)

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-20T12:00:00.000Z",
  "uptime": 3600
}
```

## Usage Examples

### Create Session with Default Configuration

```bash
curl -X POST http://localhost:3000/session \
  -H "Content-Type: application/json" \
  -d '{
    "userIdentity": "user123"
  }'
```

### Create Session with Custom Agent Configuration

```bash
curl -X POST http://localhost:3000/session \
  -H "Content-Type: application/json" \
  -d '{
    "userIdentity": "user123",
    "roomName": "support-room",
    "agentConfig": {
      "stt": "deepgram",
      "tts": "openai",
      "prompt": "You are a medical assistant. Be professional and empathetic.",
      "llm": "gpt-4o"
    }
  }'
```

### Health Check

```bash
curl http://localhost:3000/health
```

## Agent Configuration

The agent dynamically initializes with the configuration passed in the dispatch metadata.

### Supported STT Providers
- `deepgram` (default) - Deepgram Nova 3
- `assemblyai` - AssemblyAI Universal Streaming
- `openai` - OpenAI Whisper

### Supported TTS Providers
- `cartesia` (default) - Cartesia Sonic 3
- `openai` - OpenAI TTS
- `elevenlabs` - ElevenLabs

### Supported LLM Models
- `gpt-4o-mini` (default)
- `gpt-4o`
- `gpt-4-turbo`
- Any OpenAI model

## Legacy Agent Files

The original in-repo agent implementation is no longer executed, but the source is preserved for reference:

- `src/agents/customAgent_unused_file.ts` – historical example agent. Use the dedicated agent repository for any active deployments.
- `src/agents/agentFactory_unused_file.ts` – archived helper that shows how STT/TTS/LLM descriptors were composed.

## How It Works

1. **User calls POST /session**
   - Backend validates request
   - Generates user token with LiveKit SDK
   - Stores session metadata

2. **Backend dispatches agent**
   - Calls `AgentDispatchClient.createDispatch()`
   - Passes agent config as JSON metadata
   - LiveKit routes dispatch to running agent server

3. **Agent receives dispatch**
   - Agent server receives job request
   - Reads configuration from `JobContext.metadata`
   - Initializes STT/TTS/LLM dynamically

4. **Agent joins room**
   - Connects to LiveKit room
   - Publishes hello data message
   - Starts voice session

## Development

### Scripts

- `npm run dev:api` - Run Express server in watch mode
- `npm run build` - Compile TypeScript to JavaScript
- `npm run start:api` - Run compiled Express server

Archived scripts (`dev:agent`, `start:agent`) have been removed because the agent now lives in a separate repository. Keep the external agent service running alongside this API when testing full flows.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LIVEKIT_URL` | Yes | LiveKit server URL |
| `LIVEKIT_API_KEY` | Yes | LiveKit API key |
| `LIVEKIT_API_SECRET` | Yes | LiveKit API secret |
| `PORT` | No | Express server port (default: 3000) |
| `NODE_ENV` | No | Environment (development/production) |

## Troubleshooting

### Agent not dispatching

Make sure:
1. Agent server is running (`npm run dev:agent`)
2. Environment variables are set correctly
3. Agent name in config matches: `custom-agent`

### Connection errors

Verify:
1. LiveKit credentials are correct
2. LiveKit URL is accessible
3. No firewall blocking WebSocket connections

## License

MIT
