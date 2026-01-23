/**
 * Room Service
 * Handles LiveKit room lifecycle operations
 */

import { RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config/index.js';

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
        await client.deleteRoom(roomName);
        console.log(`Deleted LiveKit room "${roomName}"`);
    },
};
