import { WebhookReceiver } from 'livekit-server-sdk';
import type { LiveKitWebhookVerifierPort } from '../../ports/livekitWebhookVerifierPort.js';
import type { LiveKitWebhookEvent } from '../../types.js';

export class LiveKitWebhookVerifier implements LiveKitWebhookVerifierPort {
    private readonly receiver: WebhookReceiver;

    constructor(apiKey: string, apiSecret: string) {
        this.receiver = new WebhookReceiver(apiKey, apiSecret);
    }

    async verifyAndDecode(
        rawBody: string,
        authorizationHeader: string | undefined
    ): Promise<LiveKitWebhookEvent> {
        // WebhookReceiver throws if invalid.
        const evt = (await this.receiver.receive(rawBody, authorizationHeader)) as unknown;
        return evt as LiveKitWebhookEvent;
    }
}
