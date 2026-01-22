import type { AgentConfig } from '../../types/index.js';

export interface AgentDispatchPort {
  dispatchAgent(roomName: string, agentConfig: AgentConfig): Promise<void>;
}

