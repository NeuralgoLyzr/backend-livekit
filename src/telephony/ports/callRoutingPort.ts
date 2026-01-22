import type { CallRoutingContext, CallRoutingResult } from '../types.js';

export interface CallRoutingPort {
  resolveRouting(ctx: CallRoutingContext): Promise<CallRoutingResult>;
}

