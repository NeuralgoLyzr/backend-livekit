import type { AgentConfig } from '../../../types/index.js';
import type { AgentDispatchPort } from '../../ports/agentDispatchPort.js';
import type { AgentService } from '../../../services/agentService.js';

export class AgentDispatchAdapter implements AgentDispatchPort {
    constructor(private readonly agentService: AgentService) {}

    async dispatchAgent(roomName: string, agentConfig: AgentConfig): Promise<void> {
        await this.agentService.dispatchAgent(roomName, agentConfig);
    }
}
