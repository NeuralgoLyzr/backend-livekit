import { config } from './config/index.js';
import { livekitClients } from './services/livekitClients.js';
import { createAgentService } from './services/agentService.js';
import { createTokenService } from './services/tokenService.js';
import { createRoomService } from './services/roomService.js';
import { createSessionService } from './services/sessionService.js';
import { createAgentRegistryService } from './services/agentRegistryService.js';
import { createAgentConfigResolverService } from './services/agentConfigResolverService.js';
import { createTranscriptService } from './services/transcriptService.js';
import { createLangfuseTraceService } from './services/langfuseTraceService.js';
import { createPagosAuthService } from './services/pagosAuthService.js';
import { createSessionTraceService } from './services/sessionTraceService.js';
import { createAudioStorageService } from './services/audioStorageService.js';
import { MongooseAgentStore } from './adapters/mongoose/mongooseAgentStore.js';
import { MongooseTranscriptStore } from './adapters/mongoose/mongooseTranscriptStore.js';
import { InMemorySessionStore } from './lib/storage.js';

const agentStore = new MongooseAgentStore();
const transcriptStore = new MongooseTranscriptStore({
    phoneRoomPrefix: config.telephony.management.livekitProvisioning.dispatchRoomPrefix,
});
const sessionStore = new InMemorySessionStore();

const tokenService = createTokenService({
    createAccessToken: livekitClients.createAccessToken,
});

const agentService = createAgentService({
    client: livekitClients.agentDispatch,
    agentName: config.agent.name,
});

const roomService = createRoomService({
    client: livekitClients.roomService,
});

const agentConfigResolver = createAgentConfigResolverService({
    agentStore,
});

const agentRegistryService = createAgentRegistryService({
    store: agentStore,
});

const sessionService = createSessionService({
    store: sessionStore,
    tokenService,
    agentService,
    roomService,
    agentConfigResolver,
    livekitUrl: config.livekit.url,
});

const pagosAuthService = createPagosAuthService({
    pagosApiUrl: config.pagos.apiUrl,
    pagosAdminToken: config.pagos.adminToken,
});

const transcriptService = createTranscriptService({
    store: transcriptStore,
});

const langfuseTraceService = createLangfuseTraceService({
    host: config.langfuse.host,
    publicKey: config.langfuse.publicKey,
    secretKey: config.langfuse.secretKey,
});

const sessionTraceService = createSessionTraceService({
    transcriptService,
    langfuseTraceService,
});

const audioStorageService = createAudioStorageService();

export const services = {
    agentStore,
    transcriptStore,
    sessionStore,
    tokenService,
    agentService,
    roomService,
    agentConfigResolver,
    agentRegistryService,
    sessionService,
    pagosAuthService,
    transcriptService,
    langfuseTraceService,
    sessionTraceService,
    audioStorageService,
};
