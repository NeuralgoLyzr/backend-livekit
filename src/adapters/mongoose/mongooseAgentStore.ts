import mongoose from 'mongoose';

import type {
    AgentAccessScope,
    AgentStorePort,
    CreateAgentInput,
    ListAgentsInput,
    StoredAgent,
    UpdateAgentInput,
} from '../../ports/agentStorePort.js';
import type { AgentConfig } from '../../types/index.js';
import { connectMongo } from '../../db/mongoose.js';
import { getAgentModel, type AgentConfigDocument } from '../../models/agentModel.js';

function toStoredAgent(row: AgentConfigDocument): StoredAgent {
    return {
        id: row._id.toString(),
        // Stored as a JSON blob, validated at boundaries (route/service).
        config: row.config as AgentConfig,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

function buildScopedQuery(scope?: AgentAccessScope): Record<string, string> {
    if (!scope) {
        return {};
    }

    if (scope.createdByUserId) {
        return {
            orgId: scope.orgId,
            createdByUserId: scope.createdByUserId,
        };
    }

    return { orgId: scope.orgId };
}

export class MongooseAgentStore implements AgentStorePort {
    async list(input?: ListAgentsInput & { scope?: AgentAccessScope }): Promise<StoredAgent[]> {
        await connectMongo();
        const Agent = getAgentModel();

        const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
        const offset = Math.max(input?.offset ?? 0, 0);
        const scopedQuery = buildScopedQuery(input?.scope);

        const rows = await Agent.find({ ...scopedQuery, deletedAt: null })
            .sort({ updatedAt: -1 })
            .skip(offset)
            .limit(limit)
            .lean<AgentConfigDocument[]>();

        return rows.map(toStoredAgent);
    }

    async getById(id: string, scope?: AgentAccessScope): Promise<StoredAgent | null> {
        await connectMongo();
        const Agent = getAgentModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        const _id = new mongoose.Types.ObjectId(id);
        const scopedQuery = buildScopedQuery(scope);

        const row = await Agent.findOne({ _id, ...scopedQuery, deletedAt: null }).lean<AgentConfigDocument>();
        if (!row) return null;
        return toStoredAgent(row);
    }

    async create(input: CreateAgentInput): Promise<StoredAgent> {
        await connectMongo();
        const Agent = getAgentModel();

        const created = await Agent.create({
            orgId: input.orgId,
            createdByUserId: input.createdByUserId,
            config: input.config as unknown,
            deletedAt: null,
        });

        return toStoredAgent(created.toObject() as AgentConfigDocument);
    }

    async update(id: string, input: UpdateAgentInput, scope?: AgentAccessScope): Promise<StoredAgent | null> {
        await connectMongo();
        const Agent = getAgentModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        const _id = new mongoose.Types.ObjectId(id);
        const scopedQuery = buildScopedQuery(scope);

        const $set: Record<string, unknown> = {};
        if (input.config !== undefined) $set.config = input.config as unknown;

        if (Object.keys($set).length === 0) {
            const existing = await Agent.findOne({
                _id,
                ...scopedQuery,
                deletedAt: null,
            }).lean<AgentConfigDocument>();
            if (!existing) return null;
            return toStoredAgent(existing);
        }

        const updated = await Agent.findOneAndUpdate(
            { _id, ...scopedQuery, deletedAt: null },
            { $set },
            { new: true, runValidators: true }
        ).lean<AgentConfigDocument>();

        if (!updated) return null;
        return toStoredAgent(updated);
    }

    async delete(id: string, scope?: AgentAccessScope): Promise<boolean> {
        await connectMongo();
        const Agent = getAgentModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return false;
        const _id = new mongoose.Types.ObjectId(id);
        const scopedQuery = buildScopedQuery(scope);

        const res = await Agent.updateOne(
            { _id, ...scopedQuery, deletedAt: null },
            { $set: { deletedAt: new Date() } }
        );
        return res.modifiedCount > 0;
    }
}
