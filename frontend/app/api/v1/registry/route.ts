/// API Route: Cached prompt marketplace registry
/// Keeps Aptos transaction scans off the browser to reduce 429s in dev and production.

import { NextResponse } from "next/server";
import { APTOS_API_KEY, APTOS_NODE_URL, MODULE_ADDRESS } from "@/lib/constants";
import { getErrorMessage, isRateLimitError, truncateAddress } from "@/lib/utils";
import type { PromptMetadata } from "@/types";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;
const TRANSACTION_SCAN_LIMIT = 200;
const RATE_LIMIT_STATUS = 429;

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

async function loadPrompts(): Promise<PromptMetadata[]> {
    if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
        return cache.prompts;
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
        const registeredTarget = `${MODULE_ADDRESS}::prompt_registry::PromptRegistered`;
        const updatedTarget = `${MODULE_ADDRESS}::prompt_registry::PromptUpdated`;
        const deactivatedTarget = `${MODULE_ADDRESS}::prompt_registry::PromptDeactivated`;
        const headers: HeadersInit = APTOS_API_KEY
            ? { Authorization: `Bearer ${APTOS_API_KEY}` }
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

        const prompts = Array.from(registered.values())
            .filter((prompt) => !deactivated.has(prompt.promptId))
            .map((prompt) => ({
                ...prompt,
                price: updatedPrices.get(prompt.promptId) ?? prompt.price,
            }));

        cache = { prompts, timestamp: Date.now() };
        return prompts;
    })().finally(() => {
        inFlight = null;
    });

    return inFlight;
}

export async function GET() {
    try {
        const prompts = await loadPrompts();

        return NextResponse.json(
            {
                prompts,
                cachedAt: cache?.timestamp ?? Date.now(),
            },
            {
                headers: {
                    "Cache-Control": "private, max-age=30",
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
                        "Cache-Control": "private, max-age=15",
                    },
                }
            );
        }

        return NextResponse.json(
            {
                error: isRateLimitError(error)
                    ? "Aptos is rate limiting registry requests. Please retry in a few seconds."
                    : getErrorMessage(error, "Failed to load prompt registry from Aptos"),
            },
            { status: isRateLimitError(error) ? 429 : 502 }
        );
    }
}
