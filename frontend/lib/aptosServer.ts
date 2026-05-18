/// Server-only Aptos client setup and read helpers
/// Keep @aptos-labs/ts-sdk out of browser bundles.

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { APTOS_INDEXER_URL, APTOS_NODE_URL, NETWORK } from "./constants";
import { isRateLimitError } from "./utils";

const isCustomNetwork = NETWORK === "shelbynet";
const APTOS_API_KEY = process.env.APTOS_API_KEY || "";
const APTOS_API_ORIGIN = process.env.APTOS_API_ORIGIN || "http://localhost:3000";

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

export const aptosServerClient = new Aptos(config);

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
    if (
        functionName.includes("::access_control::") ||
        functionName.includes("::unlock_history::")
    ) {
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

export async function viewFunctionServer<T>(
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
        retryView(() =>
            aptosServerClient.view({
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

export async function waitForTransactionServer(
    transactionHash: string,
    options: { checkSuccess?: boolean; waitForIndexer?: boolean } = {}
) {
    return aptosServerClient.waitForTransaction({
        transactionHash,
        options,
    });
}
