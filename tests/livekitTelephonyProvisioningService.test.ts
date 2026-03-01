import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ListUpdate } from '@livekit/protocol';
import type { SIPDispatchRuleInfo, SIPInboundTrunkInfo } from 'livekit-server-sdk';

import { LiveKitTelephonyProvisioningService } from '../src/telephony/management/livekitTelephonyProvisioningService.js';

function makeTrunk(
    overrides?: Partial<{ sipTrunkId: string; name: string; numbers: string[] }>
) {
    return {
        sipTrunkId: 'trunk_1',
        name: 'byoc-inbound',
        numbers: [],
        ...overrides,
    } as SIPInboundTrunkInfo;
}

function makeRule(
    overrides?: Partial<{ sipDispatchRuleId: string; name: string; trunkIds: string[] }>
) {
    return {
        sipDispatchRuleId: 'rule_1',
        name: 'byoc-dispatch',
        rule: undefined,
        ...overrides,
    } as SIPDispatchRuleInfo;
}

describe('LiveKitTelephonyProvisioningService', () => {
    const sipClient = {
        listSipInboundTrunk: vi.fn(),
        createSipInboundTrunk: vi.fn(),
        updateSipInboundTrunkFields: vi.fn(),
        deleteSipTrunk: vi.fn(),
        listSipDispatchRule: vi.fn(),
        createSipDispatchRule: vi.fn(),
        updateSipDispatchRuleFields: vi.fn(),
        deleteSipDispatchRule: vi.fn(),
    };

    const service = new LiveKitTelephonyProvisioningService({
        sipClient,
        inboundTrunkName: 'byoc-inbound',
        dispatchRuleName: 'byoc-dispatch',
        roomPrefix: 'call-',
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('creates inbound trunk and dispatch rule when missing', async () => {
        sipClient.listSipInboundTrunk.mockResolvedValueOnce([]);
        sipClient.createSipInboundTrunk.mockResolvedValueOnce(
            makeTrunk({ sipTrunkId: 'trunk_new', numbers: ['+15551234567'] })
        );

        sipClient.listSipDispatchRule.mockResolvedValueOnce([]);
        sipClient.createSipDispatchRule.mockResolvedValueOnce(makeRule({ sipDispatchRuleId: 'rule_new' }));

        const res = await service.ensureInboundSetupForDid('15551234567');

        expect(res.normalizedDid).toBe('+15551234567');
        expect(res.inboundTrunkId).toBe('trunk_new');
        expect(res.dispatchRuleId).toBe('rule_new');
        expect(sipClient.createSipDispatchRule).toHaveBeenCalledWith(
            { type: 'individual', roomPrefix: 'call-' },
            { name: 'byoc-dispatch', trunkIds: ['trunk_new'] }
        );
    });

    it('adds number to existing trunk when missing', async () => {
        sipClient.listSipInboundTrunk.mockResolvedValueOnce([
            makeTrunk({ sipTrunkId: 'trunk_1', numbers: ['+15550000000'] }),
        ]);
        sipClient.updateSipInboundTrunkFields.mockResolvedValueOnce(
            makeTrunk({ sipTrunkId: 'trunk_1', numbers: ['+15550000000', '+15551234567'] })
        );

        sipClient.listSipDispatchRule.mockResolvedValueOnce([makeRule({ sipDispatchRuleId: 'rule_1' })]);
        sipClient.updateSipDispatchRuleFields.mockResolvedValueOnce(
            makeRule({ sipDispatchRuleId: 'rule_1', trunkIds: ['trunk_1'] })
        );

        const res = await service.ensureInboundSetupForDid('+15551234567');

        expect(res.inboundTrunkId).toBe('trunk_1');
        expect(sipClient.updateSipInboundTrunkFields).toHaveBeenCalledWith('trunk_1', {
            numbers: expect.any(ListUpdate),
        });
        expect(sipClient.updateSipDispatchRuleFields).toHaveBeenCalledWith('rule_1', {
            trunkIds: expect.any(ListUpdate),
        });
    });

    it('adds trunk scope to an existing named rule when missing', async () => {
        sipClient.listSipInboundTrunk.mockResolvedValueOnce([
            makeTrunk({ sipTrunkId: 'trunk_1', numbers: ['+15551234567'] }),
        ]);
        sipClient.listSipDispatchRule.mockResolvedValueOnce([makeRule({ sipDispatchRuleId: 'rule_1' })]);
        sipClient.updateSipDispatchRuleFields.mockResolvedValueOnce(
            makeRule({ sipDispatchRuleId: 'rule_1', trunkIds: ['trunk_1'] })
        );

        const res = await service.ensureInboundSetupForDid('+15551234567');
        expect(res.inboundTrunkId).toBe('trunk_1');
        expect(res.dispatchRuleId).toBe('rule_1');
        expect(sipClient.updateSipInboundTrunkFields).not.toHaveBeenCalled();
        expect(sipClient.updateSipDispatchRuleFields).toHaveBeenCalledWith('rule_1', {
            trunkIds: expect.any(ListUpdate),
        });
    });

    it('removeInboundSetupForDid removes DID from trunk while numbers remain', async () => {
        sipClient.listSipInboundTrunk.mockResolvedValueOnce([
            makeTrunk({ sipTrunkId: 'trunk_1', numbers: ['+15550000000', '+15551234567'] }),
        ]);

        const res = await service.removeInboundSetupForDid('+15551234567');
        expect(res).toEqual({
            normalizedDid: '+15551234567',
            inboundTrunkId: 'trunk_1',
            trunkDeleted: false,
            dispatchRuleUpdated: false,
            dispatchRuleDeleted: false,
        });
        expect(sipClient.updateSipInboundTrunkFields).toHaveBeenCalledWith('trunk_1', {
            numbers: expect.any(ListUpdate),
        });
        expect(sipClient.deleteSipTrunk).not.toHaveBeenCalled();
    });

    it('removeInboundSetupForDid deletes empty trunk and dispatch rule', async () => {
        sipClient.listSipInboundTrunk.mockResolvedValueOnce([
            makeTrunk({ sipTrunkId: 'trunk_1', numbers: ['+15551234567'] }),
        ]);
        sipClient.listSipDispatchRule.mockResolvedValueOnce([
            makeRule({ sipDispatchRuleId: 'rule_1', trunkIds: ['trunk_1'] }),
        ]);

        const res = await service.removeInboundSetupForDid('+15551234567');
        expect(res).toEqual({
            normalizedDid: '+15551234567',
            inboundTrunkId: 'trunk_1',
            trunkDeleted: true,
            dispatchRuleUpdated: false,
            dispatchRuleDeleted: true,
        });
        expect(sipClient.deleteSipTrunk).toHaveBeenCalledWith('trunk_1');
        expect(sipClient.deleteSipDispatchRule).toHaveBeenCalledWith('rule_1');
    });
});
