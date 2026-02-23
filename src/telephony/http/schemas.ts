import { z } from 'zod';

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

export const TwilioVerifyCredentialsRequestSchema = z
    .object({
        accountSid: z.string().min(1, 'accountSid is required'),
        authToken: z.string().min(1, 'authToken is required'),
    })
    .strict();

export const TwilioCreateIntegrationRequestSchema = z
    .object({
        accountSid: z.string().min(1, 'accountSid is required'),
        authToken: z.string().min(1, 'authToken is required'),
        name: z.string().optional(),
    })
    .strict();

export const PlivoVerifyCredentialsRequestSchema = z
    .object({
        authId: z.string().min(1, 'authId is required'),
        authToken: z.string().min(1, 'authToken is required'),
    })
    .strict();

export const PlivoCreateIntegrationRequestSchema = z
    .object({
        authId: z.string().min(1, 'authId is required'),
        authToken: z.string().min(1, 'authToken is required'),
        name: z.string().optional(),
    })
    .strict();

export const ConnectNumberRequestSchema = z
    .object({
        agentId: z.string().optional(),
        e164: E164Schema,
    })
    .strict();

export type VerifyCredentialsRequest = z.infer<typeof VerifyCredentialsRequestSchema>;
export type CreateIntegrationRequest = z.infer<typeof CreateIntegrationRequestSchema>;
export type TwilioVerifyCredentialsRequest = z.infer<typeof TwilioVerifyCredentialsRequestSchema>;
export type TwilioCreateIntegrationRequest = z.infer<typeof TwilioCreateIntegrationRequestSchema>;
export type PlivoVerifyCredentialsRequest = z.infer<typeof PlivoVerifyCredentialsRequestSchema>;
export type PlivoCreateIntegrationRequest = z.infer<typeof PlivoCreateIntegrationRequestSchema>;
export type ConnectNumberRequest = z.infer<typeof ConnectNumberRequestSchema>;
