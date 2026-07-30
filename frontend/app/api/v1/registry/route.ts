/// API Route: Cached prompt marketplace registry
/// Keeps Aptos transaction scans off the browser to reduce 429s in dev and production.

import { NextRequest, NextResponse } from "next/server";
import {
    APTOS_INDEXER_URL,
    APTOS_NODE_URL,
    MODULE_ADDRESS,
    MODULES,
} from "@/lib/constants";
import { viewFunctionServer } from "@/lib/aptosServer";
import { isRateLimitError, truncateAddress } from "@/lib/utils";
import type { PromptMetadata } from "@/types";
import { checkRateLimit, rateLimitHeaders } from "@/lib/apiSecurity";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;
const TRANSACTION_SCAN_LIMIT = 200;
const TRANSACTION_FETCH_CONCURRENCY = 4;
// account_transactions is indexed by account and answers in ~0.4s, so scan a
// wide window: it also contains publish/initialize/unrelated txs, and only the
// ones carrying a PromptRegistered event become listings.
const INDEXER_PAGE_SIZE = 100;
const INDEXER_MAX_PAGES = 3;
const METADATA_ENRICH_LIMIT = 80;
const METADATA_ENRICH_CONCURRENCY = 2;
const RATE_LIMIT_STATUS = 429;
const APTOS_API_KEY = process.env.APTOS_API_KEY || "";
const APTOS_API_ORIGIN = process.env.APTOS_API_ORIGIN || "http://localhost:3000";

type AptosEvent = {
    type: string;
    data: Record<string, string | number | undefined>;
};

type AptosTransaction = {
    version?: number | string;
    events?: AptosEvent[];
};

type IndexerAccountTransaction = {
    transaction_version: number | string;
};

type IndexerAccountTransactionsResponse = {
    data?: {
        account_transactions?: IndexerAccountTransaction[];
    };
    errors?: Array<{ message?: string }>;
};

let cache:
    | {
          prompts: PromptMetadata[];
          timestamp: number;
      }
    | null = null;
let inFlight: Promise<PromptMetadata[]> | null = null;

const pricingMap: Record<number, PromptMetadata["pricingModel"]> = {
    1: "pay-per-unlock",
    2: "subscription",
    3: "api-pay-per-call",
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAptosHeaders(contentType = false): HeadersInit {
    const headers: Record<string, string> = {};
    if (contentType) headers["Content-Type"] = "application/json";
    if (APTOS_API_ORIGIN) headers.Origin = APTOS_API_ORIGIN;
    if (APTOS_API_KEY) headers.Authorization = `Bearer ${APTOS_API_KEY}`;
    return headers;
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const response = await fetch(url, init);

        if (response.status !== RATE_LIMIT_STATUS || attempt === retries) {
            return response;
        }

        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
        const delayMs = Math.min(
            Number.isFinite(retryAfter) ? retryAfter * 1000 : 600 * 2 ** attempt,
            4_000
        );
        await sleep(delayMs);
    }

    throw new Error("Failed to fetch after retry");
}

async function fetchModuleTransactionVersionsPage(
    offset: number
): Promise<Array<number | string>> {
    // Discovery reads `account_transactions` for the module address, which is
    // indexed by account and answers in well under a second.
    //
    // Filtering `user_transactions` by `entry_function_id_str` — the obvious
    // query — is not indexed and times out against the public testnet indexer
    // (measured: 10s+ → HTTP 408 for every page size). The indexer also no
    // longer exposes an `events` table at all.
    //
    // Every `register_prompt` bumps `Registry.prompt_count` at @exmarket, so
    // the module address appears in that transaction's write set no matter who
    // the creator is — verified with a registration from a non-deployer wallet.
    // `link_blob` / `unlock_prompt` / `update_price` touch only the prompt
    // object and the creator's account, so they will NOT show up here. That is
    // fine: transactions are used to discover prompt ids, and current state
    // comes from `get_prompt_metadata` in enrichPromptMetadata below.
    const query = `
        query PromptRegistryTransactions($address: String!, $limit: Int!, $offset: Int!) {
            account_transactions(
                where: { account_address: { _eq: $address } }
                order_by: { transaction_version: desc }
                limit: $limit
                offset: $offset
            ) {
                transaction_version
            }
        }
    `;

    const response = await fetchWithRetry(APTOS_INDEXER_URL, {
        method: "POST",
        headers: getAptosHeaders(true),
        cache: "no-store",
        body: JSON.stringify({
            query,
            variables: {
                address: MODULE_ADDRESS,
                limit: INDEXER_PAGE_SIZE,
                offset,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Aptos indexer HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = (await response.json()) as IndexerAccountTransactionsResponse;
    if (payload.errors?.length) {
        throw new Error(
            payload.errors.map((error) => error.message).filter(Boolean).join("; ") ||
                "Aptos indexer query failed."
        );
    }

    return (payload.data?.account_transactions ?? []).map(
        (tx) => tx.transaction_version
    );
}

async function fetchModuleTransactionVersions(): Promise<Array<number | string>> {
    const versions: Array<number | string> = [];

    for (let page = 0; page < INDEXER_MAX_PAGES; page += 1) {
        const offset = page * INDEXER_PAGE_SIZE;

        try {
            const pageVersions = await fetchModuleTransactionVersionsPage(offset);
            versions.push(...pageVersions);
            if (pageVersions.length < INDEXER_PAGE_SIZE) break;
        } catch (error) {
            if (versions.length === 0) throw error;
            console.warn("Partial Aptos indexer pagination failed.", error);
            break;
        }
    }

    return versions;
}

async function fetchTransactionByVersion(
    version: number | string
): Promise<AptosTransaction> {
    let response = await fetchWithRetry(
        `${APTOS_NODE_URL}/transactions/by_version/${version}`,
        { headers: getAptosHeaders(), cache: "no-store" }
    );

    if (response.status === 401 && APTOS_API_KEY) {
        response = await fetchWithRetry(
            `${APTOS_NODE_URL}/transactions/by_version/${version}`,
            { cache: "no-store" }
        );
    }

    if (!response.ok) {
        throw new Error(`Aptos HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as AptosTransaction;
}

async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (nextIndex < items.length) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                results[currentIndex] = await worker(items[currentIndex]);
            }
        })
    );

    return results;
}

async function enrichPromptMetadata(
    prompt: PromptMetadata,
    useCache: boolean
): Promise<PromptMetadata> {
    try {
        const result = await viewFunctionServer<any[]>(
            `${MODULES.PROMPT_REGISTRY}::get_prompt_metadata`,
            [prompt.promptId],
            [],
            { cache: useCache }
        );

        return {
            ...prompt,
            creator: String(result[0]),
            blobId: String(result[1]),
            title: String(result[2]),
            description: String(result[3]),
            category: String(result[4]),
            pricingModel: pricingMap[Number(result[5])] || "pay-per-unlock",
            price: Number(result[6]),
            status:
                Number(result[7]) === 1 && Boolean(result[12])
                    ? "active"
                    : "inactive",
            totalUnlocks: Number(result[8]),
            totalRevenue: Number(result[9]),
            subscriptionPeriodSecs: Number(result[10]) || 0,
            contentHash: String(result[11] ?? ""),
            blobLinked: Boolean(result[12]),
        };
    } catch (error) {
        console.warn(`Prompt metadata enrichment failed for ${prompt.promptId}`, error);
        return prompt;
    }
}

async function enrichRecentPrompts(
    prompts: PromptMetadata[],
    useCache: boolean
): Promise<PromptMetadata[]> {
    const promptIdsToEnrich = new Set(
        [...prompts]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, METADATA_ENRICH_LIMIT)
            .map((prompt) => prompt.promptId)
    );

    const candidates = prompts.filter((prompt) =>
        promptIdsToEnrich.has(prompt.promptId)
    );
    const enriched = await mapWithConcurrency(
        candidates,
        METADATA_ENRICH_CONCURRENCY,
        (prompt) => enrichPromptMetadata(prompt, useCache)
    );
    const enrichedById = new Map(
        enriched.map((prompt) => [prompt.promptId, prompt])
    );

    return prompts.map((prompt) => enrichedById.get(prompt.promptId) ?? prompt);
}

async function fetchModuleAccountTransactions(): Promise<AptosTransaction[]> {
    let txResp = await fetchWithRetry(
        `${APTOS_NODE_URL}/accounts/${MODULE_ADDRESS}/transactions?limit=${TRANSACTION_SCAN_LIMIT}`,
        { headers: getAptosHeaders(), cache: "no-store" }
    );

    if (txResp.status === 401 && APTOS_API_KEY) {
        txResp = await fetchWithRetry(
            `${APTOS_NODE_URL}/accounts/${MODULE_ADDRESS}/transactions?limit=${TRANSACTION_SCAN_LIMIT}`,
            { cache: "no-store" }
        );
    }

    if (!txResp.ok) {
        throw new Error(`Aptos HTTP ${txResp.status}: ${txResp.statusText}`);
    }

    return (await txResp.json()) as AptosTransaction[];
}

async function fetchRegistryTransactions(): Promise<AptosTransaction[]> {
    try {
        const versions = await fetchModuleTransactionVersions();
        if (versions.length === 0) return fetchModuleAccountTransactions();

        const indexerTransactions = await mapWithConcurrency(
            versions,
            TRANSACTION_FETCH_CONCURRENCY,
            fetchTransactionByVersion
        );
        const moduleTransactions = await fetchModuleAccountTransactions().catch(
            () => []
        );
        const seenVersions = new Set<string>();

        return [...indexerTransactions, ...moduleTransactions].filter((tx) => {
            const version = tx.version?.toString();
            if (!version) return true;
            if (seenVersions.has(version)) return false;
            seenVersions.add(version);
            return true;
        });
    } catch (error) {
        console.warn(
            "Aptos indexer registry discovery failed; falling back to module account scan.",
            error
        );
        return fetchModuleAccountTransactions();
    }
}

async function loadPrompts(force = false): Promise<PromptMetadata[]> {
    if (!force && cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
        return cache.prompts;
    }
    if (!force && inFlight) return inFlight;

    inFlight = (async () => {
        const registeredTarget = `${MODULE_ADDRESS}::prompt_registry::PromptRegistered`;
        const updatedTarget = `${MODULE_ADDRESS}::prompt_registry::PromptUpdated`;
        const deactivatedTarget = `${MODULE_ADDRESS}::prompt_registry::PromptDeactivated`;
        const blobLinkedTarget = `${MODULE_ADDRESS}::prompt_registry::BlobLinked`;
        const txns = await fetchRegistryTransactions();
        const registered = new Map<string, PromptMetadata>();
        const deactivated = new Set<string>();
        const updatedPrices = new Map<string, number>();
        const linkedBlobs = new Map<string, { blobId: string; contentHash: string }>();

        txns.flatMap((tx) => tx.events ?? []).forEach((event) => {
            if (event.type === deactivatedTarget) {
                if (typeof event.data.prompt_id === "string") {
                    deactivated.add(event.data.prompt_id);
                }
                return;
            }

            if (event.type === blobLinkedTarget) {
                if (typeof event.data.prompt_id === "string") {
                    linkedBlobs.set(event.data.prompt_id, {
                        blobId: String(event.data.blob_id ?? ""),
                        contentHash: String(event.data.content_hash ?? ""),
                    });
                }
                return;
            }

            if (event.type === updatedTarget) {
                if (typeof event.data.prompt_id === "string") {
                    updatedPrices.set(
                        event.data.prompt_id,
                        Number(event.data.new_price)
                    );
                }
                return;
            }

            if (event.type !== registeredTarget) return;

            const promptId = event.data.prompt_id;
            if (typeof promptId !== "string") return;
            const creator = String(event.data.creator ?? "");
            registered.set(promptId, {
                promptId,
                creator,
                blobId: String(event.data.blob_id ?? ""),
                title: String(event.data.title ?? "Untitled prompt"),
                description: `Prompt by ${truncateAddress(creator)}. Open the listing for current on-chain details.`,
                category: String(event.data.category ?? "Other"),
                pricingModel:
                    Number(event.data.pricing_model) === 2
                        ? "subscription"
                        : Number(event.data.pricing_model) === 3
                          ? "api-pay-per-call"
                          : "pay-per-unlock",
                price: Number(event.data.price),
                // Listings start unlinked and unsellable; a BlobLinked event
                // (below) is what promotes them to active.
                status: "inactive",
                totalUnlocks: 0,
                totalRevenue: 0,
                tags: [],
                createdAt: Number(event.data.timestamp) || 0,
                updatedAt: Number(event.data.timestamp) || 0,
                subscriptionPeriodSecs: Number(event.data.subscription_period_secs) || 0,
                blobLinked: false,
            });
        });

        // Events give us the set of listings that exist. Their *current* state
        // (linked, price, active, unlock counts) can only come from the view
        // function, because link_blob / update_price / deactivate_prompt never
        // touch @exmarket and so never appear in the scanned transactions.
        const basePrompts = Array.from(registered.values())
            .filter((prompt) => !deactivated.has(prompt.promptId))
            .map((prompt) => {
                const linked = linkedBlobs.get(prompt.promptId);

                return {
                    ...prompt,
                    price: updatedPrices.get(prompt.promptId) ?? prompt.price,
                    blobId: linked?.blobId ?? prompt.blobId,
                    contentHash: linked?.contentHash ?? prompt.contentHash,
                    blobLinked: Boolean(linked),
                    status: linked ? ("active" as const) : ("inactive" as const),
                };
            });

        const enriched = await enrichRecentPrompts(basePrompts, !force);

        // Only list what can actually be bought. `status` here already folds in
        // both halves of the on-chain is_prompt_active check (creator-active AND
        // blob linked), which matters because a later deactivate_prompt never
        // shows up in the scanned transactions either.
        const prompts = enriched.filter(
            (prompt) => prompt.status === "active" && prompt.blobLinked
        );

        const hiddenCount = enriched.length - prompts.length;
        if (hiddenCount > 0) {
            console.info(
                `Registry: hiding ${hiddenCount} of ${enriched.length} listing(s) that are not purchasable (no Shelby blob linked, or deactivated).`
            );
        }
        if (basePrompts.length > METADATA_ENRICH_LIMIT) {
            console.warn(
                `Registry: ${basePrompts.length} listings discovered but only the newest ${METADATA_ENRICH_LIMIT} were enriched; older listings are omitted.`
            );
        }

        cache = { prompts, timestamp: Date.now() };
        return prompts;
    })().finally(() => {
        inFlight = null;
    });

    return inFlight;
}

export async function GET(req: NextRequest) {
    const rateLimit = checkRateLimit(req.headers, {
        namespace: "api-registry",
        limit: 60,
        windowMs: 60_000,
    });

    if (rateLimit.limited) {
        return NextResponse.json(
            { error: "Too many registry requests. Please retry shortly." },
            { status: 429, headers: rateLimitHeaders(rateLimit) }
        );
    }

    try {
        const force = req.nextUrl.searchParams.get("refresh") === "1";
        const prompts = await loadPrompts(force);

        return NextResponse.json(
            {
                prompts,
                cachedAt: cache?.timestamp ?? Date.now(),
            },
            {
                headers: {
                    ...rateLimitHeaders(rateLimit),
                    "Cache-Control": force ? "no-store" : "private, max-age=30",
                },
            }
        );
    } catch (error: unknown) {
        console.error("Failed to load prompt registry:", error);

        if (cache) {
            return NextResponse.json(
                {
                    prompts: cache.prompts,
                    cachedAt: cache.timestamp,
                    stale: true,
                    warning: "Showing cached registry data while Aptos is unavailable.",
                },
                {
                    headers: {
                        ...rateLimitHeaders(rateLimit),
                        "Cache-Control": "private, max-age=15",
                    },
                }
            );
        }

        return NextResponse.json(
            {
                error: isRateLimitError(error)
                    ? "Aptos is rate limiting registry requests. Please retry in a few seconds."
                    : "Unable to load prompt registry right now.",
            },
            {
                status: isRateLimitError(error) ? 429 : 502,
                headers: rateLimitHeaders(rateLimit),
            }
        );
    }
}
