import type { RoomServiceClient } from 'livekit-server-sdk';
import { logger } from '../lib/logger.js';

export interface RoomServiceDeps {
    client: RoomServiceClient;
}

export function createRoomService(deps: RoomServiceDeps) {
    return {
        async deleteRoom(roomName: string): Promise<void> {
            const start = Date.now();
            try {
                await deps.client.deleteRoom(roomName);
                logger.info(
                    {
                        event: 'livekit_room_delete',
                        roomName,
                        durationMs: Date.now() - start,
                        outcome: 'success',
                    },
                    'Deleted LiveKit room'
                );
            } catch (error) {
                logger.error(
                    {
                        event: 'livekit_room_delete',
                        roomName,
                        durationMs: Date.now() - start,
                        outcome: 'error',
                        err: error,
                    },
                    'Failed to delete LiveKit room'
                );
                throw error;
            }
        },
    };
}

export type RoomService = ReturnType<typeof createRoomService>;
