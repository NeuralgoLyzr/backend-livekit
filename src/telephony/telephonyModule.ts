import { config } from '../config/index.js';
import { services } from '../composition.js';
import { InMemoryTelephonyStore } from './adapters/store/inMemoryTelephonyStore.js';
import { LiveKitWebhookVerifier } from './adapters/livekit/webhookVerifier.js';
import { DefaultCallRouting } from './routing/defaultRouting.js';
import { TelephonySessionService } from './core/telephonySessionService.js';
import { AgentDispatchAdapter } from './adapters/livekit/agentDispatchAdapter.js';

const store = new InMemoryTelephonyStore();
const routing = new DefaultCallRouting();
const agentDispatch = new AgentDispatchAdapter(services.agentService);
const webhookVerifier = new LiveKitWebhookVerifier(
    config.telephony.webhook.apiKey,
    config.telephony.webhook.apiSecret
);

const sessionService = new TelephonySessionService({
    store,
    routing,
    agentDispatch,
    sipIdentityPrefix: config.telephony.sipIdentityPrefix,
    dispatchOnAnyParticipantJoin: config.telephony.dispatchOnAnyParticipantJoin,
});

export const telephonyModule = {
    store,
    routing,
    agentDispatch,
    webhookVerifier,
    sessionService,
};
