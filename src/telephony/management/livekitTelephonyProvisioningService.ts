import { ListUpdate } from '@livekit/protocol';
import type { SIPDispatchRuleInfo, SIPInboundTrunkInfo } from 'livekit-server-sdk';
import { TwirpError } from 'livekit-server-sdk';
import { normalizeE164 } from '../core/e164.js';
import { HttpError } from '../../lib/httpErrors.js';
import { logger } from '../../lib/logger.js';

export type SipDispatchRuleIndividualInput = {
    type: 'individual';
    roomPrefix: string;
    pin?: string;
};

export interface LiveKitSipClientPort {
    listSipInboundTrunk(): Promise<SIPInboundTrunkInfo[]>;
    createSipInboundTrunk(name: string, numbers: string[]): Promise<SIPInboundTrunkInfo>;
    updateSipInboundTrunkFields(
        sipTrunkId: string,
        fields: { numbers?: ListUpdate }
    ): Promise<SIPInboundTrunkInfo>;

    listSipDispatchRule(): Promise<SIPDispatchRuleInfo[]>;
    createSipDispatchRule(
        rule: SipDispatchRuleIndividualInput,
        opts: { name: string; trunkIds?: string[] }
    ): Promise<SIPDispatchRuleInfo>;
    updateSipDispatchRuleFields(
        sipDispatchRuleId: string,
        fields: { trunkIds?: ListUpdate }
    ): Promise<SIPDispatchRuleInfo>;
    deleteSipDispatchRule(sipDispatchRuleId: string): Promise<SIPDispatchRuleInfo>;
    deleteSipTrunk(sipTrunkId: string): Promise<void>;
}

export interface LiveKitTelephonyProvisioningPort {
    ensureInboundSetupForDid(e164: string): Promise<{
        normalizedDid: string;
        inboundTrunkId: string;
        dispatchRuleId: string;
    }>;
    removeInboundSetupForDid(e164: string): Promise<{
        normalizedDid: string;
        inboundTrunkId: string | null;
        trunkDeleted: boolean;
        dispatchRuleUpdated: boolean;
        dispatchRuleDeleted: boolean;
    }>;
}

export interface LiveKitTelephonyProvisioningDeps {
    sipClient: LiveKitSipClientPort;
    inboundTrunkName: string;
    dispatchRuleName: string;
    roomPrefix: string;
}

/**
 * Ensures LiveKit telephony is ready for BYOC inbound calling:
 * - A SIP inbound trunk exists and includes the DID in its numbers list
 * - A SIP dispatch rule exists (per-call room prefix)
 *
 * This is intentionally provider-agnostic and should be called from provider onboarding flows.
 */
export class LiveKitTelephonyProvisioningService {
    constructor(private readonly deps: LiveKitTelephonyProvisioningDeps) {}

    async ensureInboundSetupForDid(e164: string): Promise<{
        normalizedDid: string;
        inboundTrunkId: string;
        dispatchRuleId: string;
    }> {
        const normalizedDid = normalizeE164(e164);

        const trunk = await this.ensureInboundTrunkHasNumber(normalizedDid);
        const inboundTrunkId = getTrunkIdOrThrow(trunk);
        const rule = await this.ensureDispatchRule(inboundTrunkId);

        return {
            normalizedDid,
            inboundTrunkId,
            dispatchRuleId: getDispatchRuleIdOrThrow(rule),
        };
    }

    async removeInboundSetupForDid(e164: string): Promise<{
        normalizedDid: string;
        inboundTrunkId: string | null;
        trunkDeleted: boolean;
        dispatchRuleUpdated: boolean;
        dispatchRuleDeleted: boolean;
    }> {
        const normalizedDid = normalizeE164(e164);

        try {
            const trunks = await this.deps.sipClient.listSipInboundTrunk();
            const existingTrunk = trunks.find((t) => t.name === this.deps.inboundTrunkName);
            if (!existingTrunk) {
                return {
                    normalizedDid,
                    inboundTrunkId: null,
                    trunkDeleted: false,
                    dispatchRuleUpdated: false,
                    dispatchRuleDeleted: false,
                };
            }

            const inboundTrunkId = getTrunkIdOrThrow(existingTrunk);
            const existingNumbers = existingTrunk.numbers ?? [];
            if (!existingNumbers.includes(normalizedDid)) {
                return {
                    normalizedDid,
                    inboundTrunkId,
                    trunkDeleted: false,
                    dispatchRuleUpdated: false,
                    dispatchRuleDeleted: false,
                };
            }

            const nextNumbers = existingNumbers.filter((n) => n !== normalizedDid);
            if (nextNumbers.length > 0) {
                await this.deps.sipClient.updateSipInboundTrunkFields(inboundTrunkId, {
                    numbers: new ListUpdate({ set: nextNumbers }),
                });

                logger.info(
                    {
                        event: 'livekit.telephony.inbound_trunk_updated',
                        name: this.deps.inboundTrunkName,
                        didRemoved: normalizedDid,
                        inboundTrunkId,
                    },
                    'Removed DID from LiveKit SIP inbound trunk'
                );

                return {
                    normalizedDid,
                    inboundTrunkId,
                    trunkDeleted: false,
                    dispatchRuleUpdated: false,
                    dispatchRuleDeleted: false,
                };
            }

            await this.deps.sipClient.deleteSipTrunk(inboundTrunkId);
            logger.info(
                {
                    event: 'livekit.telephony.inbound_trunk_deleted',
                    name: this.deps.inboundTrunkName,
                    inboundTrunkId,
                    didRemoved: normalizedDid,
                },
                'Deleted empty LiveKit SIP inbound trunk'
            );

            const dispatchCleanup = await this.removeTrunkFromDispatchRule(inboundTrunkId);

            return {
                normalizedDid,
                inboundTrunkId,
                trunkDeleted: true,
                dispatchRuleUpdated: dispatchCleanup.dispatchRuleUpdated,
                dispatchRuleDeleted: dispatchCleanup.dispatchRuleDeleted,
            };
        } catch (err) {
            throw mapLiveKitTelephonyError(err);
        }
    }

    async ensureDispatchRule(inboundTrunkId: string): Promise<SIPDispatchRuleInfo> {
        try {
            const rules = await this.deps.sipClient.listSipDispatchRule();
            const existing = rules.find((r) => r.name === this.deps.dispatchRuleName);
            if (existing) {
                const existingTrunkIds = existing.trunkIds ?? [];
                if (existingTrunkIds.includes(inboundTrunkId)) {
                    return existing;
                }

                const updated = await this.deps.sipClient.updateSipDispatchRuleFields(
                    getDispatchRuleIdOrThrow(existing),
                    { trunkIds: new ListUpdate({ add: [inboundTrunkId] }) }
                );

                logger.info(
                    {
                        event: 'livekit.telephony.dispatch_rule_updated',
                        name: this.deps.dispatchRuleName,
                        roomPrefix: this.deps.roomPrefix,
                        dispatchRuleId: getDispatchRuleIdOrThrow(updated),
                        addedTrunkId: inboundTrunkId,
                    },
                    'Updated LiveKit SIP dispatch rule trunk scope'
                );

                return updated;
            }

            const created = await this.deps.sipClient.createSipDispatchRule(
                { type: 'individual', roomPrefix: this.deps.roomPrefix },
                { name: this.deps.dispatchRuleName, trunkIds: [inboundTrunkId] }
            );

            logger.info(
                {
                    event: 'livekit.telephony.dispatch_rule_created',
                    name: this.deps.dispatchRuleName,
                    roomPrefix: this.deps.roomPrefix,
                    dispatchRuleId: getDispatchRuleIdOrThrow(created),
                    trunkId: inboundTrunkId,
                },
                'Created LiveKit SIP dispatch rule'
            );

            return created;
        } catch (err) {
            throw mapLiveKitTelephonyError(err);
        }
    }

    async ensureInboundTrunkHasNumber(e164: string): Promise<SIPInboundTrunkInfo> {
        const normalizedDid = normalizeE164(e164);

        try {
            const trunks = await this.deps.sipClient.listSipInboundTrunk();
            const existing = trunks.find((t) => t.name === this.deps.inboundTrunkName);

            if (!existing) {
                const created = await this.deps.sipClient.createSipInboundTrunk(
                    this.deps.inboundTrunkName,
                    [normalizedDid]
                );

                logger.info(
                    {
                        event: 'livekit.telephony.inbound_trunk_created',
                        name: this.deps.inboundTrunkName,
                        did: normalizedDid,
                        inboundTrunkId: getTrunkIdOrThrow(created),
                    },
                    'Created LiveKit SIP inbound trunk'
                );

                return created;
            }

            const numbers = existing.numbers ?? [];
            if (numbers.includes(normalizedDid)) return existing;

            const updated = await this.deps.sipClient.updateSipInboundTrunkFields(
                getTrunkIdOrThrow(existing),
                { numbers: new ListUpdate({ add: [normalizedDid] }) }
            );

            logger.info(
                {
                    event: 'livekit.telephony.inbound_trunk_updated',
                    name: this.deps.inboundTrunkName,
                    did: normalizedDid,
                    inboundTrunkId: getTrunkIdOrThrow(updated),
                },
                'Updated LiveKit SIP inbound trunk numbers'
            );

            return updated;
        } catch (err) {
            throw mapLiveKitTelephonyError(err);
        }
    }

    private async removeTrunkFromDispatchRule(inboundTrunkId: string): Promise<{
        dispatchRuleUpdated: boolean;
        dispatchRuleDeleted: boolean;
    }> {
        const rules = await this.deps.sipClient.listSipDispatchRule();
        const existing = rules.find((r) => r.name === this.deps.dispatchRuleName);
        if (!existing) {
            return {
                dispatchRuleUpdated: false,
                dispatchRuleDeleted: false,
            };
        }

        const dispatchRuleId = getDispatchRuleIdOrThrow(existing);
        const existingTrunkIds = existing.trunkIds ?? [];
        if (!existingTrunkIds.includes(inboundTrunkId)) {
            return {
                dispatchRuleUpdated: false,
                dispatchRuleDeleted: false,
            };
        }

        if (existingTrunkIds.length <= 1) {
            await this.deps.sipClient.deleteSipDispatchRule(dispatchRuleId);
            logger.info(
                {
                    event: 'livekit.telephony.dispatch_rule_deleted',
                    name: this.deps.dispatchRuleName,
                    dispatchRuleId,
                    removedTrunkId: inboundTrunkId,
                },
                'Deleted LiveKit SIP dispatch rule after last trunk removal'
            );
            return {
                dispatchRuleUpdated: false,
                dispatchRuleDeleted: true,
            };
        }

        await this.deps.sipClient.updateSipDispatchRuleFields(dispatchRuleId, {
            trunkIds: new ListUpdate({ remove: [inboundTrunkId] }),
        });
        logger.info(
            {
                event: 'livekit.telephony.dispatch_rule_updated',
                name: this.deps.dispatchRuleName,
                dispatchRuleId,
                removedTrunkId: inboundTrunkId,
            },
            'Removed trunk from LiveKit SIP dispatch rule'
        );

        return {
            dispatchRuleUpdated: true,
            dispatchRuleDeleted: false,
        };
    }
}

function getTrunkIdOrThrow(trunk: SIPInboundTrunkInfo): string {
    const id = (trunk as unknown as { sipTrunkId?: string }).sipTrunkId;
    if (!id) {
        throw new HttpError(502, 'LiveKit returned an inbound trunk without sipTrunkId');
    }
    return id;
}

function getDispatchRuleIdOrThrow(rule: SIPDispatchRuleInfo): string {
    const id = (rule as unknown as { sipDispatchRuleId?: string }).sipDispatchRuleId;
    if (!id) {
        throw new HttpError(502, 'LiveKit returned a dispatch rule without sipDispatchRuleId');
    }
    return id;
}

function mapLiveKitTelephonyError(err: unknown): HttpError {
    if (err instanceof HttpError) return err;

    if (err instanceof TwirpError) {
        // Twirp errors often include actionable hints (telephony not enabled, permission, etc.)
        return new HttpError(502, `LiveKit telephony provisioning failed: ${err.message}`);
    }

    if (err instanceof Error) {
        return new HttpError(502, `LiveKit telephony provisioning failed: ${err.message}`);
    }

    return new HttpError(502, 'LiveKit telephony provisioning failed');
}
