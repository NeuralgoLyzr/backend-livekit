import type { CallRoutingPort } from '../ports/callRoutingPort.js';
import type { CallRoutingContext, CallRoutingResult } from '../types.js';

export class DefaultCallRouting implements CallRoutingPort {
  async resolveRouting(_ctx: CallRoutingContext): Promise<CallRoutingResult> {
    // v1 sensible defaults for PSTN.
    return {
      agentConfig: {
        noise_cancellation: {
          enabled: true,
          type: 'telephony',
        },
        prompt: "You are a helpful voice AI assistant on a phone call. Be concise, speak in short sentences, and confirm important details. If you didn't hear something clearly, ask the caller to repeat.",
        conversation_start: {
          who: 'ai',
          greeting: 'Hi—how can I help you today?',
        },
        // Keep other fields defaulted by agentService.
      },
    };
  }
}
