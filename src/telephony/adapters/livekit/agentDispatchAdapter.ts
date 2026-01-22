import type { AgentConfig } from '../../../types/index.js';
import type { AgentDispatchPort } from '../../ports/agentDispatchPort.js';
import { agentService } from '../../../services/agentService.js';

export class AgentDispatchAdapter implements AgentDispatchPort {
  async dispatchAgent(roomName: string, agentConfig: AgentConfig): Promise<void> {
    await agentService.dispatchAgent(roomName, agentConfig);
  }
}

