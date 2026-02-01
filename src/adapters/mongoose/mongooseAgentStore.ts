import mongoose from 'mongoose';

import type {
    AgentStorePort,
    CreateAgentInput,
    ListAgentsInput,
    StoredAgent,
    UpdateAgentInput,
} from '../../ports/agentStorePort.js';
import type { AgentConfig } from '../../types/index.js';
import { connectMongo } from '../../db/mongoose.js';
import { getAgentModel, type AgentRow } from '../../models/agentModel.js';

function toStoredAgent(row: AgentRow): StoredAgent {
    return {
        id: row._id.toString(),
        name: row.name,
        description: row.description ?? null,
        // Stored as a JSON blob, validated at boundaries (route/service).
        config: row.config as unknown as AgentConfig,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

export class MongooseAgentStore implements AgentStorePort {
    async list(input?: ListAgentsInput): Promise<StoredAgent[]> {
        await connectMongo();
        const Agent = getAgentModel();

        const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
        const offset = Math.max(input?.offset ?? 0, 0);

        const rows = await Agent.find({ deletedAt: null })
            .sort({ updatedAt: -1 })
            .skip(offset)
            .limit(limit)
            .lean<AgentRow[]>();

        return rows.map(toStoredAgent);
    }

    async getById(id: string): Promise<StoredAgent | null> {
        await connectMongo();
        const Agent = getAgentModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        const _id = new mongoose.Types.ObjectId(id);

        const row = await Agent.findOne({ _id, deletedAt: null }).lean<AgentRow>();
        if (!row) return null;
        return toStoredAgent(row);
    }

    async create(input: CreateAgentInput): Promise<StoredAgent> {
        await connectMongo();
        const Agent = getAgentModel();

        const created = await Agent.create({
            name: input.name,
            description: input.description ?? null,
            config: input.config as unknown,
            deletedAt: null,
        });

        return toStoredAgent(created.toObject() as AgentRow);
    }

    async update(id: string, input: UpdateAgentInput): Promise<StoredAgent | null> {
        await connectMongo();
        const Agent = getAgentModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        const _id = new mongoose.Types.ObjectId(id);

        const $set: Record<string, unknown> = {};
        if (input.name !== undefined) $set.name = input.name;
        if (input.description !== undefined) $set.description = input.description ?? null;
        if (input.config !== undefined) $set.config = input.config as unknown;

        if (Object.keys($set).length === 0) {
            const existing = await Agent.findOne({ _id, deletedAt: null }).lean<AgentRow>();
            if (!existing) return null;
            return toStoredAgent(existing);
        }

        const updated = await Agent.findOneAndUpdate(
            { _id, deletedAt: null },
            { $set },
            { new: true, runValidators: true }
        ).lean<AgentRow>();

        if (!updated) return null;
        return toStoredAgent(updated);
    }

    async delete(id: string): Promise<boolean> {
        await connectMongo();
        const Agent = getAgentModel();

        if (!mongoose.Types.ObjectId.isValid(id)) return false;
        const _id = new mongoose.Types.ObjectId(id);

        const res = await Agent.updateOne(
            { _id, deletedAt: null },
            { $set: { deletedAt: new Date() } }
        );
        return res.modifiedCount > 0;
    }
}

