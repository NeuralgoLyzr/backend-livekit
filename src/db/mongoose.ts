import mongoose from 'mongoose';

import { HttpError } from '../lib/httpErrors.js';

let connectPromise: Promise<typeof mongoose> | null = null;

function getMongoUri(): string {
    const uri = (process.env.MONGODB_URI || '').trim();
    if (!uri) {
        throw new HttpError(
            503,
            'Persistence is not configured',
            'Set MONGODB_URI to a MongoDB connection string to enable agent persistence.'
        );
    }
    return uri;
}

export async function connectMongo(): Promise<typeof mongoose> {
    if (mongoose.connection.readyState === 1) return mongoose;
    if (connectPromise) return connectPromise;

    const uri = getMongoUri();
    connectPromise = mongoose.connect(uri);

    try {
        await connectPromise;
        return mongoose;
    } catch (error) {
        connectPromise = null;
        throw new HttpError(
            503,
            'Failed to connect to MongoDB',
            error instanceof Error ? error.message : error
        );
    }
}

export async function disconnectMongo(): Promise<void> {
    connectPromise = null;
    if (mongoose.connection.readyState === 0) return;
    await mongoose.disconnect();
}

