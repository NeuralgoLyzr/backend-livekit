/**
 * Room Service
 * Handles LiveKit room lifecycle operations
 */

import { RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

const client = new RoomServiceClient(
    config.livekit.url,
    config.livekit.apiKey,
    config.livekit.apiSecret
);

export const roomService = {
    /**
     * Delete a room and disconnect all participants
     * @param roomName - Room to delete
     */
    async deleteRoom(roomName: string): Promise<void> {
        const start = Date.now();
        try {
            await client.deleteRoom(roomName);
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
