import type { RoomServiceClient } from 'livekit-server-sdk';

export type RoomDeleteOutcome =
    | { status: 'deleted' }
    | { status: 'already_gone' }
    | { status: 'error'; error: unknown };

export interface RoomServiceDeps {
    client: RoomServiceClient;
}

export function createRoomService(deps: RoomServiceDeps) {
    return {
        async deleteRoom(roomName: string): Promise<RoomDeleteOutcome> {
            try {
                await deps.client.deleteRoom(roomName);
                return { status: 'deleted' };
            } catch (error: unknown) {
                const isNotFound =
                    error instanceof Error &&
                    'code' in error &&
                    (error as { code: string }).code === 'not_found';

                return isNotFound ? { status: 'already_gone' } : { status: 'error', error };
            }
        },
    };
}

export type RoomService = ReturnType<typeof createRoomService>;
