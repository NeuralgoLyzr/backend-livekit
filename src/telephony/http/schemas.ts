import { z } from 'zod';
import { AgentConfigSchema } from '../../types/index.js';

const E164Schema = z
    .string()
    .min(1, 'e164 is required')
    .transform((v) => {
        const trimmed = v.trim();
        return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
    })
    .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'e164 must be a valid E.164 phone number'));

export const VerifyCredentialsRequestSchema = z
    .object({
        apiKey: z.string().min(1, 'apiKey is required'),
    })
    .strict();

export const CreateIntegrationRequestSchema = z
    .object({
        apiKey: z.string().min(1, 'apiKey is required'),
        name: z.string().optional(),
    })
    .strict();

export const ConnectNumberRequestSchema = z
    .object({
        agentId: z.string().optional(),
        agentConfig: AgentConfigSchema.optional(),
        e164: E164Schema,
    })
    .strict();

export type VerifyCredentialsRequest = z.infer<typeof VerifyCredentialsRequestSchema>;
export type CreateIntegrationRequest = z.infer<typeof CreateIntegrationRequestSchema>;
export type ConnectNumberRequest = z.infer<typeof ConnectNumberRequestSchema>;
