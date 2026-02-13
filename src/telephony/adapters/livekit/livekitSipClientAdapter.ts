import type { SipClient } from 'livekit-server-sdk';
import type { SIPDispatchRuleInfo, SIPInboundTrunkInfo } from 'livekit-server-sdk';
import type {
    LiveKitSipClientPort,
    SipDispatchRuleIndividualInput,
} from '../../management/livekitTelephonyProvisioningService.js';

export class LiveKitSipClientAdapter implements LiveKitSipClientPort {
    constructor(private readonly client: SipClient) {}

    async listSipInboundTrunk(): Promise<SIPInboundTrunkInfo[]> {
        return await this.client.listSipInboundTrunk();
    }

    async createSipInboundTrunk(name: string, numbers: string[]): Promise<SIPInboundTrunkInfo> {
        return await this.client.createSipInboundTrunk(name, numbers);
    }

    async updateSipInboundTrunkFields(
        sipTrunkId: string,
        fields: { numbers?: import('@livekit/protocol').ListUpdate }
    ): Promise<SIPInboundTrunkInfo> {
        return await this.client.updateSipInboundTrunkFields(sipTrunkId, fields);
    }

    async listSipDispatchRule(): Promise<SIPDispatchRuleInfo[]> {
        return await this.client.listSipDispatchRule();
    }

    async createSipDispatchRule(
        rule: SipDispatchRuleIndividualInput,
        opts: { name: string; trunkIds?: string[] }
    ): Promise<SIPDispatchRuleInfo> {
        // Our provisioning service only uses the "individual" mode.
        return await this.client.createSipDispatchRule(
            {
                type: 'individual',
                roomPrefix: rule.roomPrefix,
                pin: rule.pin,
            },
            { name: opts.name, trunkIds: opts.trunkIds }
        );
    }

    async updateSipDispatchRuleFields(
        sipDispatchRuleId: string,
        fields: { trunkIds?: import('@livekit/protocol').ListUpdate }
    ): Promise<SIPDispatchRuleInfo> {
        return await this.client.updateSipDispatchRuleFields(sipDispatchRuleId, fields);
    }

    async deleteSipDispatchRule(sipDispatchRuleId: string): Promise<SIPDispatchRuleInfo> {
        return await this.client.deleteSipDispatchRule(sipDispatchRuleId);
    }

    async deleteSipTrunk(sipTrunkId: string): Promise<void> {
        await this.client.deleteSipTrunk(sipTrunkId);
    }
}
