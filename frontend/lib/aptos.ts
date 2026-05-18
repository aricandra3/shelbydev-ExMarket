/// Aptos client setup and transaction helpers
/// Configured per: https://docs.shelby.xyz/sdks/typescript/acquire-api-keys

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { NETWORK, APTOS_NODE_URL, APTOS_INDEXER_URL } from "./constants";
import { isRateLimitError } from "./utils";

// ── Network Mapping ─────────────────────────────
// "shelbynet" is a custom Aptos network, so we use CUSTOM and provide URLs
const isCustomNetwork = NETWORK === "shelbynet";
const APTOS_API_KEY =
    typeof window === "undefined" ? process.env.APTOS_API_KEY : undefined;
const APTOS_API_ORIGIN =
    typeof window === "undefined"
        ? process.env.APTOS_API_ORIGIN || "http://localhost:3000"
        : undefined;

const config = new AptosConfig({
    network: isCustomNetwork ? Network.CUSTOM : Network.TESTNET,
    fullnode: APTOS_NODE_URL,
    indexer: APTOS_INDEXER_URL,
    clientConfig: APTOS_API_KEY
        ? {
              API_KEY: APTOS_API_KEY,
              HEADERS: APTOS_API_ORIGIN ? { Origin: APTOS_API_ORIGIN } : undefined,
          }
        : undefined,
});

export const aptosClient = new Aptos(config);

const PROMPT_REGISTRY_VIEW_CACHE_TTL_MS = 60_000;
const ACCESS_VIEW_CACHE_TTL_MS = 15_000;
const MAX_CONCURRENT_VIEW_CALLS = 2;
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

    if (typeof window !== "undefined") {
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

    const promise = runLimitedView(() =>
        retryView(() =>
            aptosClient.view({
                payload: {
                    function: functionName as `${string}::${string}::${string}`,
                    functionArguments: args,
                    typeArguments: typeArgs,
                },
            })
        )
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
