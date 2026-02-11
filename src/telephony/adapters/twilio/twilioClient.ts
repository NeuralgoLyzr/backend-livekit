const TRUNKING_BASE_URL = 'https://trunking.twilio.com';
const API_BASE_URL = 'https://api.twilio.com';
const MAX_PAGES = 20;
const REQUEST_TIMEOUT_MS = 15_000;

export type TwilioClientErrorCode =
    | 'PROVIDER_UNREACHABLE'
    | 'AUTH_INVALID'
    | 'RATE_LIMITED'
    | 'VALIDATION_ERROR'
    | 'PROVIDER_ERROR';

export class TwilioClientError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: TwilioClientErrorCode,
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'TwilioClientError';
    }
}

export function isTwilioClientError(err: unknown): err is TwilioClientError {
    return err instanceof TwilioClientError;
}

export interface TwilioCredentials {
    accountSid: string;
    apiKeySid: string;
    apiKeySecret: string;
}

export interface TwilioIncomingPhoneNumber {
    sid: string;
    phoneNumber: string;
    friendlyName?: string;
}

export interface TwilioTrunk {
    sid: string;
    domainName: string;
    friendlyName?: string;
}

export interface TwilioOriginationUrl {
    sid: string;
    sipUrl: string;
    enabled: boolean;
}

export interface TwilioTrunkPhoneNumberRef {
    sid: string;
    phoneNumberSid: string;
}

type TwilioErrorBody = {
    message?: string;
    code?: number;
    more_info?: string;
    status?: number;
};

export class TwilioClient {
    private readonly authHeaderValue: string;

    constructor(private readonly creds: TwilioCredentials) {
        // Twilio API keys use HTTP Basic auth:
        // username = apiKeySid, password = apiKeySecret
        const raw = `${creds.apiKeySid}:${creds.apiKeySecret}`;
        this.authHeaderValue = `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
    }

    async verifyCredentials(): Promise<{ valid: true }> {
        // Verify both:
        // - API key is valid (auth),
        // - accountSid is valid (path scoping)
        await this.requestJson(
            'GET',
            API_BASE_URL,
            `/2010-04-01/Accounts/${encodeURIComponent(this.creds.accountSid)}.json`
        );
        return { valid: true };
    }

    async listIncomingPhoneNumbers(): Promise<TwilioIncomingPhoneNumber[]> {
        const all: TwilioIncomingPhoneNumber[] = [];
        let nextPath: string | null = `/2010-04-01/Accounts/${encodeURIComponent(
            this.creds.accountSid
        )}/IncomingPhoneNumbers.json?PageSize=50`;
        let pages = 0;

        while (nextPath && pages < MAX_PAGES) {
            pages++;
            const body = (await this.requestJson('GET', API_BASE_URL, nextPath)) as {
                incoming_phone_numbers?: Array<Record<string, unknown>>;
                next_page_uri?: string | null;
            };

            for (const item of body.incoming_phone_numbers ?? []) {
                all.push({
                    sid: String(item.sid),
                    phoneNumber: String(item.phone_number),
                    friendlyName:
                        item.friendly_name != null ? String(item.friendly_name) : undefined,
                });
            }

            nextPath = body.next_page_uri ? String(body.next_page_uri) : null;
        }

        if (nextPath) {
            throw new TwilioClientError(
                0,
                'PROVIDER_ERROR',
                `Incoming phone number listing exceeds ${MAX_PAGES} pages (${all.length}+ numbers). Contact support.`
            );
        }

        return all;
    }

    async getIncomingPhoneNumber(phoneNumberSid: string): Promise<TwilioIncomingPhoneNumber> {
        const body = (await this.requestJson(
            'GET',
            API_BASE_URL,
            `/2010-04-01/Accounts/${encodeURIComponent(this.creds.accountSid)}/IncomingPhoneNumbers/${encodeURIComponent(phoneNumberSid)}.json`
        )) as Record<string, unknown>;

        return {
            sid: String(body.sid),
            phoneNumber: String(body.phone_number),
            friendlyName: body.friendly_name != null ? String(body.friendly_name) : undefined,
        };
    }

    async listTrunks(): Promise<TwilioTrunk[]> {
        const all: TwilioTrunk[] = [];
        let nextPath: string | null = '/v1/Trunks?PageSize=50';
        let pages = 0;

        while (nextPath && pages < MAX_PAGES) {
            pages++;
            const body = (await this.requestJson('GET', TRUNKING_BASE_URL, nextPath)) as {
                trunks?: Array<Record<string, unknown>>;
                next_page_uri?: string | null;
            };

            for (const item of body.trunks ?? []) {
                all.push({
                    sid: String(item.sid),
                    domainName: String(item.domain_name),
                    friendlyName:
                        item.friendly_name != null ? String(item.friendly_name) : undefined,
                });
            }

            nextPath = body.next_page_uri ? String(body.next_page_uri) : null;
        }

        if (nextPath) {
            throw new TwilioClientError(
                0,
                'PROVIDER_ERROR',
                `Trunk listing exceeds ${MAX_PAGES} pages (${all.length}+ trunks). Contact support.`
            );
        }

        return all;
    }

    async createTrunk(input: {
        friendlyName: string;
        domainName: string;
    }): Promise<{ sid: string }> {
        const body = (await this.requestForm(
            'POST',
            TRUNKING_BASE_URL,
            '/v1/Trunks',
            new URLSearchParams({
                FriendlyName: input.friendlyName,
                DomainName: input.domainName,
            })
        )) as { sid?: string };

        if (!body.sid) {
            throw new TwilioClientError(0, 'PROVIDER_ERROR', 'Twilio trunk create returned no SID');
        }
        return { sid: String(body.sid) };
    }

    async listOriginationUrls(trunkSid: string): Promise<TwilioOriginationUrl[]> {
        const all: TwilioOriginationUrl[] = [];
        let nextPath: string | null = `/v1/Trunks/${encodeURIComponent(
            trunkSid
        )}/OriginationUrls?PageSize=50`;
        let pages = 0;

        while (nextPath && pages < MAX_PAGES) {
            pages++;
            const body = (await this.requestJson('GET', TRUNKING_BASE_URL, nextPath)) as {
                origination_urls?: Array<Record<string, unknown>>;
                next_page_uri?: string | null;
            };

            for (const item of body.origination_urls ?? []) {
                all.push({
                    sid: String(item.sid),
                    sipUrl: String(item.sip_url),
                    enabled: Boolean(item.enabled),
                });
            }

            nextPath = body.next_page_uri ? String(body.next_page_uri) : null;
        }

        if (nextPath) {
            throw new TwilioClientError(
                0,
                'PROVIDER_ERROR',
                `Origination URL listing exceeds ${MAX_PAGES} pages (${all.length}+ urls). Contact support.`
            );
        }

        return all;
    }

    async createOriginationUrl(
        trunkSid: string,
        input: {
            sipUrl: string;
            friendlyName: string;
            enabled?: boolean;
            weight?: number;
            priority?: number;
        }
    ): Promise<{ sid: string }> {
        const params = new URLSearchParams({
            FriendlyName: input.friendlyName,
            SipUrl: input.sipUrl,
            Enabled: String(input.enabled ?? true),
            Weight: String(input.weight ?? 1),
            Priority: String(input.priority ?? 1),
        });

        const body = (await this.requestForm(
            'POST',
            TRUNKING_BASE_URL,
            `/v1/Trunks/${encodeURIComponent(trunkSid)}/OriginationUrls`,
            params
        )) as { sid?: string };

        if (!body.sid) {
            throw new TwilioClientError(
                0,
                'PROVIDER_ERROR',
                'Twilio origination URL create returned no SID'
            );
        }
        return { sid: String(body.sid) };
    }

    async listTrunkPhoneNumbers(trunkSid: string): Promise<TwilioTrunkPhoneNumberRef[]> {
        const all: TwilioTrunkPhoneNumberRef[] = [];
        let nextPath: string | null = `/v1/Trunks/${encodeURIComponent(
            trunkSid
        )}/PhoneNumbers?PageSize=50`;
        let pages = 0;

        while (nextPath && pages < MAX_PAGES) {
            pages++;
            const body = (await this.requestJson('GET', TRUNKING_BASE_URL, nextPath)) as {
                phone_numbers?: Array<Record<string, unknown>>;
                next_page_uri?: string | null;
            };

            for (const item of body.phone_numbers ?? []) {
                all.push({
                    sid: String(item.sid),
                    phoneNumberSid: String(item.phone_number_sid),
                });
            }

            nextPath = body.next_page_uri ? String(body.next_page_uri) : null;
        }

        if (nextPath) {
            throw new TwilioClientError(
                0,
                'PROVIDER_ERROR',
                `Trunk phone number listing exceeds ${MAX_PAGES} pages (${all.length}+ items). Contact support.`
            );
        }

        return all;
    }

    async attachPhoneNumberToTrunk(trunkSid: string, phoneNumberSid: string): Promise<void> {
        const existing = await this.listTrunkPhoneNumbers(trunkSid);
        if (existing.some((p) => p.phoneNumberSid === phoneNumberSid)) return;

        await this.requestForm(
            'POST',
            TRUNKING_BASE_URL,
            `/v1/Trunks/${encodeURIComponent(trunkSid)}/PhoneNumbers`,
            new URLSearchParams({ PhoneNumberSid: phoneNumberSid })
        );
    }

    // ── internal ──────────────────────────────────────────────────────────

    private async requestJson(method: string, baseUrl: string, path: string): Promise<unknown> {
        return this.request(method, baseUrl, path, undefined);
    }

    private async requestForm(
        method: string,
        baseUrl: string,
        path: string,
        form: URLSearchParams
    ): Promise<unknown> {
        return this.request(method, baseUrl, path, form);
    }

    private async request(
        method: string,
        baseUrl: string,
        path: string,
        formBody: URLSearchParams | undefined
    ): Promise<unknown> {
        let response: Response;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            response = await fetch(`${baseUrl}${path}`, {
                method,
                headers: {
                    Authorization: this.authHeaderValue,
                    ...(formBody
                        ? { 'Content-Type': 'application/x-www-form-urlencoded' }
                        : { 'Content-Type': 'application/json' }),
                },
                signal: controller.signal,
                ...(formBody ? { body: formBody.toString() } : {}),
            });
        } catch (err) {
            throw new TwilioClientError(
                0,
                'PROVIDER_UNREACHABLE',
                controller.signal.aborted ? 'Twilio API request timed out' : 'Unable to reach Twilio API',
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

        const detail = extractTwilioErrorMessage(parsed) ?? (response.statusText || 'Twilio error');
        throw new TwilioClientError(response.status, mapStatusToCode(response.status), detail);
    }
}

function mapStatusToCode(status: number): TwilioClientErrorCode {
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

function extractTwilioErrorMessage(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as TwilioErrorBody;
    if (b.message && typeof b.message === 'string') return b.message;
    return null;
}
