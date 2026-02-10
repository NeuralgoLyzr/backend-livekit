import { config } from './config/index.js';
import { livekitClients } from './services/livekitClients.js';
import { createAgentService } from './services/agentService.js';
import { createTokenService } from './services/tokenService.js';
import { createRoomService } from './services/roomService.js';
import { createSessionService } from './services/sessionService.js';
import { createAgentRegistryService } from './services/agentRegistryService.js';
import { createAgentConfigResolverService } from './services/agentConfigResolverService.js';
import { MongooseAgentStore } from './adapters/mongoose/mongooseAgentStore.js';
import { InMemorySessionStore } from './lib/storage.js';

const agentStore = new MongooseAgentStore();
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

export const services = {
    agentStore,
    sessionStore,
    tokenService,
    agentService,
    roomService,
    agentConfigResolver,
    agentRegistryService,
    sessionService,
};
