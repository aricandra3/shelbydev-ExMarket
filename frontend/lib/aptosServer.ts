/// Server-only Aptos client setup and read helpers
/// Keep @aptos-labs/ts-sdk out of browser bundles.

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { APTOS_INDEXER_URL, APTOS_NODE_URL, NETWORK } from "./constants";
import { isRateLimitError } from "./utils";
import { warnAboutMisplacedKeys } from "./envCheck";

const isCustomNetwork = NETWORK === "shelbynet";
const APTOS_API_KEY = process.env.APTOS_API_KEY || "";
// Only set this for a Geomi *client* key, which is bound to one web app URL and
// rejects a mismatched or missing Origin. A *server* key is not origin-bound and
// wants no Origin header at all — hence no default here.
const APTOS_API_ORIGIN = process.env.APTOS_API_ORIGIN || "";

warnAboutMisplacedKeys([
    {
        name: "APTOS_API_KEY",
        value: APTOS_API_KEY,
        purpose: "Aptos reads",
    },
    {
        name: "SHELBY_API_KEY",
        value: process.env.SHELBY_API_KEY || "",
        purpose: "Shelby uploads and egress accounting",
    },
]);

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

/// Same node, no credentials. The REST paths in the registry route already fall
/// back to anonymous when the key is rejected, which is why they kept working in
/// production while every view call failed: the SDK path had no such fallback,
/// so a bad key looked like "Aptos read request failed" and nothing else.
const anonymousClient = new Aptos(
    new AptosConfig({
        network: isCustomNetwork ? Network.CUSTOM : Network.TESTNET,
        fullnode: APTOS_NODE_URL,
        indexer: APTOS_INDEXER_URL,
    })
);

function isAuthError(error: unknown): boolean {
    const status = (error as { status?: number })?.status;
    return status === 401 || status === 403;
}

let authFailureReported = false;

async function runView<T>(
    payload: Parameters<typeof aptosServerClient.view>[0]["payload"]
): Promise<T> {
    if (!APTOS_API_KEY) {
        return (await anonymousClient.view({ payload })) as T;
    }

    try {
        return (await aptosServerClient.view({ payload })) as T;
    } catch (error: unknown) {
        if (!isAuthError(error)) throw error;

        // Say it once, loudly: an unusable key is a configuration problem, and
        // anonymous limits are far tighter than the key's.
        if (!authFailureReported) {
            authFailureReported = true;
            console.error(
                `Aptos rejected APTOS_API_KEY (HTTP ${(error as { status?: number }).status}) ` +
                    `with Origin "${APTOS_API_ORIGIN || "(none)"}". A client key must be called ` +
                    "with the exact origin it was registered for; a server key needs no origin. " +
                    "Falling back to anonymous reads, which rate limit much sooner."
            );
        }

        return (await anonymousClient.view({ payload })) as T;
    }
}

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

/// Retries exist only for rate-limit errors, and the Aptos key's limit is a
/// 200-request budget over a 5-minute window — not a short burst limit. Retrying
/// inside that window cannot succeed and spends the budget three times over,
/// which is how a single busy page turned into a wall of 429s. Fail fast and let
/// callers serve cached or stale data instead.
async function retryView<T>(task: () => Promise<T>, retries = 0): Promise<T> {
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
            runView<T>({
                function: functionName as `${string}::${string}::${string}`,
                functionArguments: args,
                typeArguments: typeArgs,
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
