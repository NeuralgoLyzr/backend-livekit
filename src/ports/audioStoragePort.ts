export interface StoredAudioObject {
    data: Buffer;
    contentType: string;
}

export interface AudioStoragePort {
    save(sessionId: string, audioBuffer: Buffer): Promise<string>;
    get(sessionId: string): Promise<StoredAudioObject | null>;
}
