/// API Route: Cached prompt marketplace registry
/// Keeps Aptos transaction scans off the browser to reduce 429s in dev and production.

import { NextRequest, NextResponse } from "next/server";
import { APTOS_NODE_URL, MODULE_ADDRESS, MODULES } from "@/lib/constants";
import { viewFunction } from "@/lib/aptos";
import { isRateLimitError, truncateAddress } from "@/lib/utils";
import type { PromptMetadata } from "@/types";
import { checkRateLimit, rateLimitHeaders } from "@/lib/apiSecurity";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;
const TRANSACTION_SCAN_LIMIT = 200;
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
    events?: AptosEvent[];
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
        const result = await viewFunction<any[]>(
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
            status: Number(result[7]) === 1 ? "active" : "inactive",
            totalUnlocks: Number(result[8]),
            totalRevenue: Number(result[9]),
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

async function loadPrompts(force = false): Promise<PromptMetadata[]> {
    if (!force && cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
        return cache.prompts;
    }
    if (!force && inFlight) return inFlight;

    inFlight = (async () => {
        const registeredTarget = `${MODULE_ADDRESS}::prompt_registry::PromptRegistered`;
        const updatedTarget = `${MODULE_ADDRESS}::prompt_registry::PromptUpdated`;
        const deactivatedTarget = `${MODULE_ADDRESS}::prompt_registry::PromptDeactivated`;
        const headers: HeadersInit = APTOS_API_KEY
            ? {
                  Authorization: `Bearer ${APTOS_API_KEY}`,
                  Origin: APTOS_API_ORIGIN,
              }
            : {};

        let txResp = await fetchWithRetry(
            `${APTOS_NODE_URL}/accounts/${MODULE_ADDRESS}/transactions?limit=${TRANSACTION_SCAN_LIMIT}`,
            { headers, cache: "no-store" }
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

        const txns = (await txResp.json()) as AptosTransaction[];
        const registered = new Map<string, PromptMetadata>();
        const deactivated = new Set<string>();
        const updatedPrices = new Map<string, number>();

        txns.flatMap((tx) => tx.events ?? []).forEach((event) => {
            if (event.type === deactivatedTarget) {
                if (typeof event.data.prompt_id === "string") {
                    deactivated.add(event.data.prompt_id);
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
                status: "active",
                totalUnlocks: 0,
                totalRevenue: 0,
                tags: [],
                createdAt: Number(event.data.timestamp) || 0,
                updatedAt: Number(event.data.timestamp) || 0,
            });
        });

        const basePrompts = Array.from(registered.values())
            .filter((prompt) => !deactivated.has(prompt.promptId))
            .map((prompt) => ({
                ...prompt,
                price: updatedPrices.get(prompt.promptId) ?? prompt.price,
            }));
        const prompts = await enrichRecentPrompts(basePrompts, !force);

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
