/**
 * Session endpoint
 * Creates user tokens and dispatches agents with custom configuration
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { tokenService } from '../services/tokenService.js';
import { agentService } from '../services/agentService.js';
import { roomService } from '../services/roomService.js';
import { storage } from '../lib/storage.js';
import { config } from '../config/index.js';
import type { AgentConfig } from '../types/index.js';

const router: Router = Router();

// Validation constants
const MAX_IDENTITY_LENGTH = 128;
const MAX_ROOM_NAME_LENGTH = 128;
const VALID_IDENTIFIER_REGEX = /^[\w-]+$/; // alphanumeric, underscore, hyphen

interface SessionRequest {
  userIdentity: string;
  roomName?: string;
  agentConfig?: AgentConfig;
}

interface EndSessionRequest {
  roomName?: string;
}

/**
 * Validate user identity string
 */
function validateUserIdentity(identity: unknown): { valid: boolean; error?: string } {
  if (!identity || typeof identity !== 'string') {
    return { valid: false, error: 'userIdentity is required and must be a string' };
  }

  const trimmed = identity.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'userIdentity cannot be empty' };
  }

  if (trimmed.length > MAX_IDENTITY_LENGTH) {
    return { valid: false, error: `userIdentity must be ${MAX_IDENTITY_LENGTH} characters or less` };
  }

  if (!VALID_IDENTIFIER_REGEX.test(trimmed)) {
    return { valid: false, error: 'userIdentity can only contain letters, numbers, underscores, and hyphens' };
  }

  return { valid: true };
}

/**
 * Validate room name string (optional field)
 */
function validateRoomName(roomName: unknown): { valid: boolean; error?: string } {
  if (roomName === undefined || roomName === null) {
    return { valid: true }; // Optional field
  }

  if (typeof roomName !== 'string') {
    return { valid: false, error: 'roomName must be a string' };
  }

  const trimmed = roomName.trim();
  if (trimmed.length === 0) {
    return { valid: true }; // Empty string treated as not provided
  }

  if (trimmed.length > MAX_ROOM_NAME_LENGTH) {
    return { valid: false, error: `roomName must be ${MAX_ROOM_NAME_LENGTH} characters or less` };
  }

  if (!VALID_IDENTIFIER_REGEX.test(trimmed)) {
    return { valid: false, error: 'roomName can only contain letters, numbers, underscores, and hyphens' };
  }

  return { valid: true };
}

router.post('/', async (req, res) => {
  try {
    const { userIdentity, roomName, agentConfig }: SessionRequest = req.body;

    // Validate userIdentity
    const identityValidation = validateUserIdentity(userIdentity);
    if (!identityValidation.valid) {
      return res.status(400).json({
        error: identityValidation.error,
        example: {
          userIdentity: 'user123',
          roomName: 'optional-room-name',
          agentConfig: {
            stt: 'assemblyai/universal-streaming:en',
            tts: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
            llm: 'openai/gpt-4o-mini',
            prompt: 'You are a helpful voice AI assistant.',
            greeting: "Say, 'Hi I'm Maya, how can I help you today?'",
            realtime: false,
            realtime_model: 'gpt-4o-realtime-preview',
            realtime_voice: 'sage',
            vad_enabled: true,
            turn_detection_enabled: true,
            noise_cancellation_enabled: true,
            noise_cancellation_type: 'auto',
          },
        },
      });
    }

    // Validate roomName if provided
    const roomValidation = validateRoomName(roomName);
    if (!roomValidation.valid) {
      return res.status(400).json({ error: roomValidation.error });
    }

    // Generate room name if not provided
    const finalRoomName = roomName?.trim() || `room-${randomUUID()}`;

    // Generate user token
    const userToken = await tokenService.createUserToken(
      userIdentity.trim(),
      finalRoomName
    );

    // Store session metadata
    storage.set(finalRoomName, {
      userIdentity: userIdentity.trim(),
      agentConfig,
      createdAt: new Date().toISOString(),
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log('[session] Dispatching agent config:', agentConfig);
    }

    // Dispatch agent with custom configuration
    await agentService.dispatchAgent(finalRoomName, agentConfig);

    // Return session details
    res.json({
      userToken,
      roomName: finalRoomName,
      livekitUrl: config.livekit.url,
      agentDispatched: true,
      agentConfig: {
        stt: agentConfig?.stt ?? 'assemblyai/universal-streaming:en',
        tts: agentConfig?.tts ?? 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
        llm: agentConfig?.llm ?? 'openai/gpt-4o-mini',
        realtime: agentConfig?.realtime ?? false,
      },
    });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({
      error: 'Failed to create session',
      // Only expose error details in development
      ...(process.env.NODE_ENV !== 'production' && {
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    });
  }
});

router.post('/end', async (req, res) => {
  try {
    const { roomName }: EndSessionRequest = req.body || {};

    if (!roomName || typeof roomName !== 'string' || roomName.trim().length === 0) {
      return res.status(400).json({ error: 'roomName is required' });
    }

    const roomValidation = validateRoomName(roomName);
    if (!roomValidation.valid) {
      return res.status(400).json({ error: roomValidation.error });
    }

    const normalizedRoomName = roomName.trim();

    if (!storage.has(normalizedRoomName)) {
      return res.status(404).json({ error: 'Session not found for room' });
    }

    try {
      await roomService.deleteRoom(normalizedRoomName);
    } catch (error) {
      console.error(`Failed to delete room "${normalizedRoomName}":`, error);
      return res.status(502).json({
        error: 'Failed to delete LiveKit room',
        ...(error instanceof Error && { details: error.message }),
      });
    }

    storage.delete(normalizedRoomName);
    res.status(204).send();
  } catch (error) {
    console.error('Session termination error:', error);
    res.status(500).json({
      error: 'Failed to end session',
      ...(process.env.NODE_ENV !== 'production' && {
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    });
  }
});

export default router;
