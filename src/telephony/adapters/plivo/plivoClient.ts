const BASE_URL = 'https://api.plivo.com';
const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 15_000;

export type PlivoClientErrorCode =
    | 'PROVIDER_UNREACHABLE'
    | 'AUTH_INVALID'
    | 'RATE_LIMITED'
    | 'VALIDATION_ERROR'
    | 'PROVIDER_ERROR';

export class PlivoClientError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: PlivoClientErrorCode,
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'PlivoClientError';
    }
}

export function isPlivoClientError(err: unknown): err is PlivoClientError {
    return err instanceof PlivoClientError;
}

export interface PlivoCredentials {
    authId: string;
    authToken: string;
}

export interface PlivoPhoneNumber {
    number: string;
    alias?: string;
    appId: string | null;
}

export interface PlivoInboundTrunk {
    trunkId: string;
    name: string;
    primaryUriId?: string;
}

export interface PlivoOriginationUri {
    id: string;
    name?: string;
    uri: string;
    host: string;
}

export class PlivoClient {
    private readonly authHeaderValue: string;

    constructor(private readonly creds: PlivoCredentials) {
        const raw = `${creds.authId}:${creds.authToken}`;
        this.authHeaderValue = `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
    }

    async verifyCredentials(): Promise<{ valid: true }> {
        await this.request('GET', this.buildPath('/Number/?limit=1&offset=0'));
        return { valid: true };
    }

    async listPhoneNumbers(): Promise<PlivoPhoneNumber[]> {
        const all: PlivoPhoneNumber[] = [];
        let offset = 0;
        const limit = 20;

        for (let page = 1; page <= MAX_PAGES; page++) {
            const body = (await this.request(
                'GET',
                this.buildPath(`/Number/?limit=${limit}&offset=${offset}`)
            )) as {
                objects?: Array<Record<string, unknown>>;
                meta?: { next?: string | null };
            };

            const items = body.objects ?? [];
            for (const item of items) {
                all.push(this.parsePhoneNumber(item));
            }

            if (!body.meta?.next) {
                return all;
            }
            offset += limit;
        }

        throw new PlivoClientError(
            0,
            'PROVIDER_ERROR',
            `Phone number listing exceeds ${MAX_PAGES} pages (${all.length}+ numbers). Contact support.`
        );
    }

    async getPhoneNumber(phoneNumber: string): Promise<PlivoPhoneNumber> {
        const body = (await this.request(
            'GET',
            this.buildPath(`/Number/${encodeURIComponent(phoneNumber)}/`)
        )) as Record<string, unknown>;

        const number =
            typeof body.number === 'string' && body.number.trim().length > 0
                ? body.number
                : phoneNumber;

        return {
            number,
            alias: typeof body.alias === 'string' ? body.alias : undefined,
            appId: this.parseAppId(body),
        };
    }

    async setNumberAppId(phoneNumber: string, appId: string | null): Promise<void> {
        await this.request('POST', this.buildPath(`/Number/${encodeURIComponent(phoneNumber)}/`), {
            app_id: appId,
        });
    }

    async listInboundTrunks(): Promise<PlivoInboundTrunk[]> {
        const all: PlivoInboundTrunk[] = [];
        let offset = 0;
        const limit = 20;

        for (let page = 1; page <= MAX_PAGES; page++) {
            const body = (await this.request(
                'GET',
                this.buildPath(`/Zentrunk/Trunk/?limit=${limit}&offset=${offset}`)
            )) as {
                objects?: Array<Record<string, unknown>>;
                meta?: { next?: string | null };
            };

            const items = body.objects ?? [];
            for (const item of items) {
                const trunkId = toNonEmptyString(item.trunk_id);
                const name = toNonEmptyString(item.name);
                if (!trunkId || !name) {
                    continue;
                }

                all.push({
                    trunkId,
                    name,
                    primaryUriId: toNonEmptyString(item.primary_uri_uuid) ?? undefined,
                });
            }

            if (!body.meta?.next) {
                return all;
            }
            offset += limit;
        }

        throw new PlivoClientError(
            0,
            'PROVIDER_ERROR',
            `Inbound trunk listing exceeds ${MAX_PAGES} pages (${all.length}+ trunks). Contact support.`
        );
    }

    async createInboundTrunk(
        name: string,
        primaryUriId: string
    ): Promise<{ trunkId: string; primaryUriId?: string }> {
        const body = (await this.request('POST', this.buildPath('/Zentrunk/Trunk/'), {
            name,
            trunk_direction: 'inbound',
            primary_uri_uuid: primaryUriId,
        })) as {
            trunk_id?: string;
            primary_uri_uuid?: string;
        };

        const trunkId = toNonEmptyString(body.trunk_id);
        if (!trunkId) {
            throw new PlivoClientError(0, 'PROVIDER_ERROR', 'Plivo trunk create returned no trunk_id');
        }

        return {
            trunkId,
            primaryUriId: toNonEmptyString(body.primary_uri_uuid) ?? undefined,
        };
    }

    async deleteInboundTrunk(trunkId: string): Promise<void> {
        await this.request('DELETE', this.buildPath(`/Zentrunk/Trunk/${encodeURIComponent(trunkId)}/`));
    }

    async listOriginationUris(): Promise<PlivoOriginationUri[]> {
        const all: PlivoOriginationUri[] = [];
        let offset = 0;
        const limit = 20;

        for (let page = 1; page <= MAX_PAGES; page++) {
            const body = (await this.request(
                'GET',
                this.buildPath(`/Zentrunk/URI/?limit=${limit}&offset=${offset}`)
            )) as {
                objects?: Array<Record<string, unknown>>;
                meta?: { next?: string | null };
            };

            const items = body.objects ?? [];
            for (const item of items) {
                const parsed = this.parseOriginationUri(item);
                if (parsed) {
                    all.push(parsed);
                }
            }

            if (!body.meta?.next) {
                return all;
            }
            offset += limit;
        }

        throw new PlivoClientError(
            0,
            'PROVIDER_ERROR',
            `Origination URI listing exceeds ${MAX_PAGES} pages (${all.length}+ uris). Contact support.`
        );
    }

    async createOriginationUri(input: { name: string; uri: string }): Promise<{ id: string }> {
        const body = (await this.request('POST', this.buildPath('/Zentrunk/URI/'), {
            name: input.name,
            uri: input.uri,
        })) as {
            uri_uuid?: string;
            id?: string;
        };

        const id = toNonEmptyString(body.uri_uuid ?? body.id);
        if (!id) {
            throw new PlivoClientError(
                0,
                'PROVIDER_ERROR',
                'Plivo origination URI create returned no uri_uuid'
            );
        }

        return { id };
    }

    async deleteOriginationUri(originationUriId: string): Promise<void> {
        await this.request(
            'DELETE',
            this.buildPath(`/Zentrunk/URI/${encodeURIComponent(originationUriId)}/`)
        );
    }

    private parsePhoneNumber(item: Record<string, unknown>): PlivoPhoneNumber {
        return {
            number: String(item.number),
            alias: typeof item.alias === 'string' ? item.alias : undefined,
            appId: this.parseAppId(item),
        };
    }

    private parseOriginationUri(item: Record<string, unknown>): PlivoOriginationUri | null {
        const id = toNonEmptyString(item.uri_uuid ?? item.id);
        const rawUri = toNonEmptyString(item.uri ?? item.host);
        if (!id || !rawUri) {
            return null;
        }

        const host = extractHostFromUri(rawUri);
        if (!host) {
            return null;
        }

        return {
            id,
            name: toNonEmptyString(item.name) ?? undefined,
            uri: rawUri,
            host,
        };
    }

    private parseAppId(item: Record<string, unknown>): string | null {
        const raw = item.app_id;
        if (raw == null) {
            return null;
        }

        const value = String(raw).trim();
        return value.length > 0 ? value : null;
    }

    private buildPath(resourcePath: string): string {
        return `/v1/Account/${encodeURIComponent(this.creds.authId)}${resourcePath}`;
    }

    private async request(method: string, path: string, body?: unknown): Promise<unknown> {
        let response: Response;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            response = await fetch(`${BASE_URL}${path}`, {
                method,
                headers: {
                    Authorization: this.authHeaderValue,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            });
        } catch (err) {
            throw new PlivoClientError(
                0,
                'PROVIDER_UNREACHABLE',
                controller.signal.aborted ? 'Plivo API request timed out' : 'Unable to reach Plivo API',
                { cause: err }
            );
        } finally {
            clearTimeout(timeout);
        }

        const text = await response.text();
        const parsed = tryParseJson(text);

        if (response.ok) {
            return parsed ?? undefined;
        }

        const detail = extractPlivoErrorMessage(parsed) ?? response.statusText ?? 'Plivo error';
        throw new PlivoClientError(response.status, mapStatusToCode(response.status), detail);
    }
}

function mapStatusToCode(status: number): PlivoClientErrorCode {
    if (status === 401 || status === 403) return 'AUTH_INVALID';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 400 && status < 500) return 'VALIDATION_ERROR';
    return 'PROVIDER_ERROR';
}

function tryParseJson(text: string): unknown | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        return null;
    }
}

function extractPlivoErrorMessage(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;

    const record = body as {
        error?: unknown;
        message?: unknown;
    };

    if (typeof record.error === 'string' && record.error.trim().length > 0) {
        return record.error;
    }

    if (record.error && typeof record.error === 'object') {
        const nestedError = record.error as { error?: unknown; message?: unknown };
        if (typeof nestedError.error === 'string' && nestedError.error.trim().length > 0) {
            return nestedError.error;
        }
        if (typeof nestedError.message === 'string' && nestedError.message.trim().length > 0) {
            return nestedError.message;
        }
    }

    if (typeof record.message === 'string' && record.message.trim().length > 0) {
        return record.message;
    }

    return null;
}

function toNonEmptyString(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function extractHostFromUri(uriOrHost: string): string {
    const trimmed = uriOrHost.trim();
    if (!trimmed) return '';

    const withoutProtocol = trimmed.replace(/^sip:/i, '');
    const withoutQuery = withoutProtocol.split('?')[0] ?? withoutProtocol;
    const withoutParams = withoutQuery.split(';')[0] ?? withoutQuery;
    const hostWithMaybePort = (withoutParams.split('@').pop() ?? withoutParams).trim();

    if (/:[0-9]+$/.test(hostWithMaybePort)) {
        return hostWithMaybePort.replace(/:[0-9]+$/, '').trim().toLowerCase();
    }

    return hostWithMaybePort.toLowerCase();
}
