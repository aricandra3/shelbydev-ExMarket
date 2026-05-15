/// Aptos client setup and transaction helpers
/// Configured per: https://docs.shelby.xyz/sdks/typescript/acquire-api-keys

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { NETWORK, APTOS_NODE_URL, APTOS_INDEXER_URL, APTOS_API_KEY } from "./constants";

// ── Network Mapping ─────────────────────────────
// "shelbynet" is a custom Aptos network, so we use CUSTOM and provide URLs
const isCustomNetwork = NETWORK === "shelbynet";

const config = new AptosConfig({
    network: isCustomNetwork ? Network.CUSTOM : Network.TESTNET,
    fullnode: APTOS_NODE_URL,
    indexer: APTOS_INDEXER_URL,
    ...(APTOS_API_KEY
        ? {
            clientConfig: {
                API_KEY: APTOS_API_KEY,
            },
        }
        : {}),
});

export const aptosClient = new Aptos(config);

const VIEW_CACHE_TTL_MS = 30_000;
const MAX_CONCURRENT_VIEW_CALLS = 2;
const viewCache = new Map<string, { value: unknown; timestamp: number }>();
const viewInFlight = new Map<string, Promise<unknown>>();
let activeViewCalls = 0;
const viewQueue: Array<() => void> = [];

function shouldCacheView(functionName: string) {
    return functionName.includes("::prompt_registry::");
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
        } catch (error: any) {
            const message = String(error?.message || error || "");
            const isRateLimited =
                message.includes("429") ||
                message.toLowerCase().includes("too many requests");

            if (!isRateLimited || attempt === retries) {
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
    typeArgs: string[] = []
): Promise<T> {
    const cacheable = shouldCacheView(functionName);
    const cacheKey = getViewCacheKey(functionName, args, typeArgs);
    const cached = viewCache.get(cacheKey);

    if (
        cacheable &&
        cached &&
        Date.now() - cached.timestamp < VIEW_CACHE_TTL_MS
    ) {
        return cached.value as T;
    }

    if (cacheable && viewInFlight.has(cacheKey)) {
        return (await viewInFlight.get(cacheKey)) as T;
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
