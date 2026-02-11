import { config } from '../config/index.js';
import { services } from '../composition.js';
import { InMemoryTelephonyStore } from './adapters/store/inMemoryTelephonyStore.js';
import { LiveKitWebhookVerifier } from './adapters/livekit/webhookVerifier.js';

import { TelephonySessionService } from './core/telephonySessionService.js';
import { AgentDispatchAdapter } from './adapters/livekit/agentDispatchAdapter.js';
import { MongooseTelephonyIntegrationStore } from './adapters/store/mongooseTelephonyIntegrationStore.js';
import { MongooseTelephonyBindingStore } from './adapters/store/mongooseTelephonyBindingStore.js';
import { TelnyxOnboardingService } from './management/telnyxOnboardingService.js';
import { BindingBasedCallRouting } from './routing/bindingBasedCallRouting.js';
import { TwilioOnboardingService } from './management/twilioOnboardingService.js';
import { SipClient } from 'livekit-server-sdk';
import { toLiveKitHttpUrl } from './adapters/livekit/livekitHttpUrl.js';
import { LiveKitSipClientAdapter } from './adapters/livekit/livekitSipClientAdapter.js';
import { LiveKitTelephonyProvisioningService } from './management/livekitTelephonyProvisioningService.js';

const store = new InMemoryTelephonyStore();

// Management plane stores (DB-backed)
const integrationStore = new MongooseTelephonyIntegrationStore();
const bindingStore = new MongooseTelephonyBindingStore();

// Routing: use binding-based routing to resolve agent config from phone number bindings
const routing = new BindingBasedCallRouting(bindingStore);

const agentDispatch = new AgentDispatchAdapter(services.agentService);
const webhookVerifier = new LiveKitWebhookVerifier(
    config.telephony.webhook.apiKey,
    config.telephony.webhook.apiSecret
);

// Telnyx onboarding (available when encryption key + SIP host configured)
const mgmtConfig = config.telephony.management;

// LiveKit telephony provisioning (SIP inbound trunk + dispatch rule)
const sipClient = new SipClient(
    toLiveKitHttpUrl(config.livekit.url),
    config.livekit.apiKey,
    config.livekit.apiSecret,
    { requestTimeout: 15_000 }
);
const livekitProvisioning = new LiveKitTelephonyProvisioningService({
    sipClient: new LiveKitSipClientAdapter(sipClient),
    inboundTrunkName: mgmtConfig.livekitProvisioning.inboundTrunkName,
    dispatchRuleName: mgmtConfig.livekitProvisioning.dispatchRuleName,
    roomPrefix: mgmtConfig.livekitProvisioning.dispatchRoomPrefix,
});

const telnyxOnboarding =
    mgmtConfig.encryptionKey && mgmtConfig.livekitSipHost
        ? new TelnyxOnboardingService({
              integrationStore,
              bindingStore,
              encryptionKey: mgmtConfig.encryptionKey,
              livekitSipHost: mgmtConfig.livekitSipHost,
              livekitProvisioning,
          })
        : null;

const twilioOnboarding =
    mgmtConfig.encryptionKey && mgmtConfig.livekitSipHost
        ? new TwilioOnboardingService({
              integrationStore,
              bindingStore,
              encryptionKey: mgmtConfig.encryptionKey,
              livekitSipHost: mgmtConfig.livekitSipHost,
              livekitProvisioning,
          })
        : null;

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
    // Management plane
    integrationStore,
    bindingStore,
    telnyxOnboarding,
    twilioOnboarding,
};
