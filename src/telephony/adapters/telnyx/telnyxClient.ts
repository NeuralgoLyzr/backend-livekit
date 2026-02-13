const BASE_URL = 'https://api.telnyx.com';
const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 15_000;

export type TelnyxClientErrorCode =
    | 'PROVIDER_UNREACHABLE'
    | 'AUTH_INVALID'
    | 'RATE_LIMITED'
    | 'VALIDATION_ERROR'
    | 'PROVIDER_ERROR';

export class TelnyxClientError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: TelnyxClientErrorCode,
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'TelnyxClientError';
    }
}

export function isTelnyxClientError(err: unknown): err is TelnyxClientError {
    return err instanceof TelnyxClientError;
}

export interface TelnyxPhoneNumber {
    id: string;
    phone_number: string;
    status: string;
    connection_id: string | null;
    connection_name: string | null;
}

export interface TelnyxFqdnConnection {
    id: string;
    connection_name: string;
}

export interface TelnyxFqdnConnectionDetails {
    id: string;
    connection_name: string;
    transport_protocol?: string;
    encrypted_media?: string | null;
    inbound?: {
        default_primary_fqdn_id?: string | null;
        default_secondary_fqdn_id?: string | null;
        default_tertiary_fqdn_id?: string | null;
    };
}

export interface TelnyxFqdn {
    id: string;
    fqdn: string;
    connection_id: string;
}

interface TelnyxErrorBody {
    errors?: Array<{ code?: string; detail?: string; title?: string }>;
}

export class TelnyxClient {
    constructor(private readonly apiKey: string) {}

    async verifyCredentials(): Promise<{ valid: true }> {
        await this.request('GET', '/v2/phone_numbers?page[size]=1');
        return { valid: true };
    }

    async listPhoneNumbers(): Promise<TelnyxPhoneNumber[]> {
        const all: TelnyxPhoneNumber[] = [];
        let page = 1;
        let truncated = false;

        while (page <= MAX_PAGES) {
            const body = (await this.request('GET', `/v2/phone_numbers?page[number]=${page}&page[size]=50`)) as {
                data: Array<Record<string, unknown>>;
                meta: { page_number: number; total_pages: number };
            };

            for (const item of body.data) {
                all.push({
                    id: String(item.id),
                    phone_number: String(item.phone_number),
                    status: String(item.status),
                    connection_id: item.connection_id != null ? String(item.connection_id) : null,
                    connection_name: item.connection_name != null ? String(item.connection_name) : null,
                });
            }

            if (page >= body.meta.total_pages) break;
            page++;

            if (page > MAX_PAGES) {
                truncated = true;
            }
        }

        if (truncated) {
            throw new TelnyxClientError(
                0,
                'PROVIDER_ERROR',
                `Phone number listing exceeds ${MAX_PAGES} pages (${all.length}+ numbers). Contact support.`
            );
        }

        return all;
    }

    async getPhoneNumber(phoneNumberId: string): Promise<TelnyxPhoneNumber> {
        const body = (await this.request(
            'GET',
            `/v2/phone_numbers/${encodeURIComponent(phoneNumberId)}`
        )) as { data: Record<string, unknown> };

        const item = body.data;
        return {
            id: String(item.id),
            phone_number: String(item.phone_number),
            status: String(item.status),
            connection_id: item.connection_id != null ? String(item.connection_id) : null,
            connection_name: item.connection_name != null ? String(item.connection_name) : null,
        };
    }

    async createFqdnConnection(
        name: string,
        options?: { transportProtocol?: 'UDP' | 'TCP' | 'TLS' }
    ): Promise<TelnyxFqdnConnection> {
        const body = (await this.request('POST', '/v2/fqdn_connections', {
            connection_name: name,
            active: true,
            ...(options?.transportProtocol ? { transport_protocol: options.transportProtocol } : {}),
            inbound: {
                ani_number_format: '+E.164',
                dnis_number_format: '+e164',
            },
        })) as { data: { id: string; connection_name: string } };

        return { id: String(body.data.id), connection_name: String(body.data.connection_name) };
    }

    async updateFqdnConnectionTransport(
        connectionId: string,
        transportProtocol: 'UDP' | 'TCP' | 'TLS'
    ): Promise<void> {
        await this.request('PATCH', `/v2/fqdn_connections/${encodeURIComponent(connectionId)}`, {
            transport_protocol: transportProtocol,
        });
    }

    async getFqdnConnection(connectionId: string): Promise<TelnyxFqdnConnectionDetails> {
        const body = (await this.request(
            'GET',
            `/v2/fqdn_connections/${encodeURIComponent(connectionId)}`
        )) as { data: Record<string, unknown> };

        const item = body.data;
        const inbound =
            item.inbound && typeof item.inbound === 'object'
                ? (item.inbound as Record<string, unknown>)
                : undefined;
        return {
            id: String(item.id),
            connection_name: String(item.connection_name),
            transport_protocol:
                item.transport_protocol != null ? String(item.transport_protocol) : undefined,
            encrypted_media: item.encrypted_media != null ? String(item.encrypted_media) : null,
            inbound: inbound
                ? {
                      default_primary_fqdn_id:
                          inbound.default_primary_fqdn_id != null
                              ? String(inbound.default_primary_fqdn_id)
                              : null,
                      default_secondary_fqdn_id:
                          inbound.default_secondary_fqdn_id != null
                              ? String(inbound.default_secondary_fqdn_id)
                              : null,
                      default_tertiary_fqdn_id:
                          inbound.default_tertiary_fqdn_id != null
                              ? String(inbound.default_tertiary_fqdn_id)
                              : null,
                  }
                : undefined,
        };
    }

    async listFqdnConnections(): Promise<TelnyxFqdnConnection[]> {
        const body = (await this.request('GET', '/v2/fqdn_connections')) as {
            data: Array<{ id: string; connection_name: string }>;
        };

        return body.data.map((c) => ({
            id: String(c.id),
            connection_name: String(c.connection_name),
        }));
    }

    async createFqdn(fqdn: string, connectionId: string): Promise<TelnyxFqdn> {
        const body = (await this.request('POST', '/v2/fqdns', {
            fqdn,
            // Telnyx expects `connection_id` (not `fqdn_connection_id`) and `dns_record_type` is required.
            // Ref: https://developers.telnyx.com/api-reference/fqdns/create-an-fqdn
            connection_id: connectionId,
            dns_record_type: 'a',
        })) as { data: { id: string; fqdn: string; connection_id: string } };

        return {
            id: String(body.data.id),
            fqdn: String(body.data.fqdn),
            connection_id: String(body.data.connection_id),
        };
    }

    async listFqdns(connectionId: string): Promise<TelnyxFqdn[]> {
        const body = (await this.request(
            'GET',
            `/v2/fqdns?filter[connection_id]=${encodeURIComponent(connectionId)}`
        )) as { data: Array<{ id: string; fqdn: string; connection_id: string }> };

        return body.data.map((f) => ({
            id: String(f.id),
            fqdn: String(f.fqdn),
            connection_id: String(f.connection_id),
        }));
    }

    async assignPhoneNumberToConnection(
        phoneNumberId: string,
        connectionId: string
    ): Promise<void> {
        await this.request('PATCH', `/v2/phone_numbers/${encodeURIComponent(phoneNumberId)}`, {
            connection_id: connectionId,
        });
    }

    async unassignPhoneNumberFromConnection(phoneNumberId: string): Promise<void> {
        await this.request('PATCH', `/v2/phone_numbers/${encodeURIComponent(phoneNumberId)}`, {
            connection_id: null,
        });
    }

    async deleteFqdn(fqdnId: string): Promise<void> {
        await this.request('DELETE', `/v2/fqdns/${encodeURIComponent(fqdnId)}`);
    }

    async deleteFqdnConnection(connectionId: string): Promise<void> {
        await this.request('DELETE', `/v2/fqdn_connections/${encodeURIComponent(connectionId)}`);
    }

    // ── internal ──────────────────────────────────────────────────────────

    private async request(
        method: string,
        path: string,
        body?: unknown
    ): Promise<unknown> {
        let response: Response;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            response = await fetch(`${BASE_URL}${path}`, {
                method,
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            });
        } catch (err) {
            throw new TelnyxClientError(
                0,
                'PROVIDER_UNREACHABLE',
                controller.signal.aborted
                    ? 'Telnyx API request timed out'
                    : 'Unable to reach Telnyx API',
                { cause: err }
            );
        } finally {
            clearTimeout(timeout);
        }

        if (response.ok) {
            const text = await response.text();
            if (!text) return undefined;
            try {
                return JSON.parse(text) as unknown;
            } catch {
                throw new TelnyxClientError(
                    response.status,
                    'PROVIDER_ERROR',
                    'Telnyx returned invalid JSON'
                );
            }
        }

        let detail = '';
        try {
            const errBody = (await response.json()) as TelnyxErrorBody;
            detail =
                errBody.errors?.[0]?.detail ??
                errBody.errors?.[0]?.title ??
                response.statusText;
        } catch {
            detail = response.statusText;
        }

        throw new TelnyxClientError(response.status, mapStatusToCode(response.status), detail);
    }
}

function mapStatusToCode(status: number): TelnyxClientErrorCode {
    if (status === 401 || status === 403) return 'AUTH_INVALID';
    if (status === 429) return 'RATE_LIMITED';
    if (status === 422) return 'VALIDATION_ERROR';
    return 'PROVIDER_ERROR';
}
