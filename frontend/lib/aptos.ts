/// Browser-safe Aptos helpers
/// Read calls go through /api/v1/view so @aptos-labs/ts-sdk stays server-side.

import { isRateLimitError } from "./utils";

const PROMPT_REGISTRY_VIEW_CACHE_TTL_MS = 60_000;
const ACCESS_VIEW_CACHE_TTL_MS = 15_000;
const MAX_CONCURRENT_VIEW_CALLS = 2;
const TRANSACTION_WAIT_TIMEOUT_MS = 90_000;
const viewCache = new Map<string, { value: unknown; timestamp: number }>();
const viewInFlight = new Map<string, Promise<unknown>>();
let activeViewCalls = 0;
const viewQueue: Array<() => void> = [];

function shouldCacheView(functionName: string) {
    return (
        functionName.includes("::prompt_registry::") ||
        functionName.includes("::access_control::") ||
        functionName.includes("::unlock_history::")
    );
}

function getViewCacheTtl(functionName: string) {
    if (functionName.includes("::access_control::")) {
        return ACCESS_VIEW_CACHE_TTL_MS;
    }

    if (functionName.includes("::unlock_history::")) {
        return ACCESS_VIEW_CACHE_TTL_MS;
    }

    return PROMPT_REGISTRY_VIEW_CACHE_TTL_MS;
}

function getViewCacheKey(functionName: string, args: any[], typeArgs: string[]) {
    return JSON.stringify({ functionName, args, typeArgs });
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLimitedView<T>(task: () => Promise<T>): Promise<T> {
    if (activeViewCalls >= MAX_CONCURRENT_VIEW_CALLS) {
        await new Promise<void>((resolve) => viewQueue.push(resolve));
    }

    activeViewCalls += 1;
    try {
        return await task();
    } finally {
        activeViewCalls -= 1;
        viewQueue.shift()?.();
    }
}

async function retryView<T>(task: () => Promise<T>, retries = 2): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await task();
        } catch (error: unknown) {
            if (!isRateLimitError(error) || attempt === retries) {
                throw error;
            }

            await sleep(700 * (attempt + 1));
        }
    }

    throw new Error("View function retry failed");
}

// ── View Function Helper ────────────────────────
export async function viewFunction<T>(
    functionName: string,
    args: any[] = [],
    typeArgs: string[] = [],
    options: { cache?: boolean } = {}
): Promise<T> {
    const cacheable = options.cache !== false && shouldCacheView(functionName);
    const cacheKey = getViewCacheKey(functionName, args, typeArgs);
    const cached = viewCache.get(cacheKey);

    if (
        cacheable &&
        cached &&
        Date.now() - cached.timestamp < getViewCacheTtl(functionName)
    ) {
        return cached.value as T;
    }

    if (cacheable && viewInFlight.has(cacheKey)) {
        return (await viewInFlight.get(cacheKey)) as T;
    }

    const promise = runLimitedView(() =>
        retryView(async () => {
            const response = await fetch("/api/v1/view", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    functionName,
                    args,
                    typeArgs,
                    cache: options.cache !== false,
                }),
                cache: "no-store",
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                const message =
                    payload && typeof payload.error === "string"
                        ? payload.error
                        : "Aptos view request failed.";
                throw new Error(message);
            }

            if (!payload || typeof payload !== "object" || !("result" in payload)) {
                throw new Error("Aptos view response was invalid.");
            }

            return payload.result as T;
        })
    );

    if (cacheable) {
        viewInFlight.set(cacheKey, promise);
    }

    const result = await promise.finally(() => {
        if (cacheable) viewInFlight.delete(cacheKey);
    });

    if (cacheable) {
        viewCache.set(cacheKey, { value: result, timestamp: Date.now() });
    }

    return result as T;
}

export async function waitForTransaction(
    transactionHash: string,
    options: { checkSuccess?: boolean; waitForIndexer?: boolean } = {}
) {
    const controller = new AbortController();
    const timeout = window.setTimeout(
        () => controller.abort(),
        TRANSACTION_WAIT_TIMEOUT_MS
    );

    let response: Response;
    try {
        response = await fetch("/api/v1/transaction", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transactionHash, options }),
            cache: "no-store",
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error(
                "Transaction confirmation timed out. Check the wallet activity or explorer before retrying."
            );
        }

        throw error;
    } finally {
        window.clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const message =
            payload && typeof payload.error === "string"
                ? payload.error
                : "Transaction confirmation failed.";
        throw new Error(message);
    }

    return payload;
}

export function invalidateViewCache(functionNamePart?: string) {
    if (!functionNamePart) {
        viewCache.clear();
        viewInFlight.clear();
        return;
    }

    Array.from(viewCache.keys()).forEach((key) => {
        if (key.includes(functionNamePart)) viewCache.delete(key);
    });
    Array.from(viewInFlight.keys()).forEach((key) => {
        if (key.includes(functionNamePart)) viewInFlight.delete(key);
    });
}

// ── Transaction Builder ─────────────────────────
export function buildEntryPayload(
    functionName: string,
    args: any[],
    typeArgs: string[] = []
) {
    return {
        function: functionName as `${string}::${string}::${string}`,
        functionArguments: args,
        typeArguments: typeArgs,
    };
}
