/// API Route: Cached prompt marketplace registry
/// Keeps Aptos transaction scans off the browser to reduce 429s in dev and production.

import { NextResponse } from "next/server";
import { APTOS_API_KEY, APTOS_NODE_URL, MODULE_ADDRESS } from "@/lib/constants";
import { truncateAddress } from "@/lib/utils";
import type { PromptMetadata } from "@/types";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;
const TRANSACTION_SCAN_LIMIT = 200;
const RATE_LIMIT_STATUS = 429;

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

        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter)
            ? retryAfter * 1000
            : 600 * (attempt + 1);
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

        const txns: any[] = await txResp.json();
        const registered = new Map<string, PromptMetadata>();
        const deactivated = new Set<string>();
        const updatedPrices = new Map<string, number>();

        txns.flatMap((tx) => tx.events ?? []).forEach((event) => {
            if (event.type === deactivatedTarget) {
                deactivated.add(event.data.prompt_id);
                return;
            }

            if (event.type === updatedTarget) {
                updatedPrices.set(
                    event.data.prompt_id,
                    Number(event.data.new_price)
                );
                return;
            }

            if (event.type !== registeredTarget) return;

            const promptId = event.data.prompt_id as string;
            registered.set(promptId, {
                promptId,
                creator: event.data.creator as string,
                blobId: event.data.blob_id as string,
                title: event.data.title as string,
                description: `Prompt by ${truncateAddress(event.data.creator as string)}. Open the listing for current on-chain details.`,
                category: event.data.category as string,
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
    } catch (error: any) {
        console.error("Failed to load prompt registry:", error);

        if (cache) {
            return NextResponse.json(
                {
                    prompts: cache.prompts,
                    cachedAt: cache.timestamp,
                    stale: true,
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
                error:
                    error?.message ||
                    "Failed to load prompt registry from Aptos",
            },
            { status: error?.message?.includes("429") ? 429 : 502 }
        );
    }
}
