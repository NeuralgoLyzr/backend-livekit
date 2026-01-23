import type { LiveKitWebhookEvent } from '../types.js';

export interface LiveKitWebhookVerifierPort {
    /**
     * Validates the Authorization header and returns the decoded webhook event.
     * Throws on invalid signature or malformed payload.
     */
    verifyAndDecode(
        rawBody: string,
        authorizationHeader: string | undefined
    ): Promise<LiveKitWebhookEvent>;
}
