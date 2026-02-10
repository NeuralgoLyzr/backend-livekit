import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
    requestId: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
    return requestContextStorage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
    return requestContextStorage.getStore();
}

export function getRequestId(): string | undefined {
    return requestContextStorage.getStore()?.requestId;
}
