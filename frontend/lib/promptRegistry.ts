/// Shared browser-side prompt registry loader

import type { PromptMetadata } from "@/types";

const CACHE_TTL_MS = 120_000;

export type RegistryLoadResult = {
    prompts: PromptMetadata[];
    stale?: boolean;
};

type RegistryPayload = {
    prompts?: PromptMetadata[];
    stale?: boolean;
    error?: string;
};

let browserCache:
    | {
          prompts: PromptMetadata[];
          timestamp: number;
      }
    | null = null;
let browserInFlight: Promise<RegistryLoadResult> | null = null;
let forceNextLoad = false;

function normalizeAptosAddress(address: string) {
    const trimmed = address.trim().toLowerCase();
    const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
    return `0x${hex.padStart(64, "0")}`;
}

export async function loadPromptRegistry(
    force = false
): Promise<RegistryLoadResult> {
    if (typeof window === "undefined") {
        throw new Error("Prompt registry can only be loaded from the browser.");
    }

    const shouldRefresh = force || forceNextLoad;

    if (
        !shouldRefresh &&
        browserCache &&
        Date.now() - browserCache.timestamp < CACHE_TTL_MS
    ) {
        return { prompts: browserCache.prompts };
    }

    if (!shouldRefresh && browserInFlight) return browserInFlight;

    browserInFlight = fetch(
        `/api/v1/registry${shouldRefresh ? "?refresh=1" : ""}`,
        { cache: "no-store" }
    )
        .then(async (response) => {
            const payload = (await response.json().catch(() => ({}))) as RegistryPayload;
            if (!response.ok) {
                throw new Error(
                    payload?.error || `HTTP ${response.status}: ${response.statusText}`
                );
            }

            return {
                prompts: payload.prompts ?? [],
                stale: payload.stale,
            };
        })
        .then((result) => {
            browserCache = { prompts: result.prompts, timestamp: Date.now() };
            return result;
        })
        .catch((error) => {
            if (browserCache) {
                console.warn("Prompt registry refresh failed; using browser cache.", error);
                return { prompts: browserCache.prompts, stale: true };
            }

            throw error;
        })
        .finally(() => {
            forceNextLoad = false;
            browserInFlight = null;
        });

    return browserInFlight;
}

export function invalidatePromptRegistryCache() {
    browserCache = null;
    forceNextLoad = true;
}

export async function findPromptInRegistry(promptId: string) {
    const result = await loadPromptRegistry();
    const normalizedPromptId = promptId.toLowerCase();

    return (
        result.prompts.find(
            (prompt) => prompt.promptId.toLowerCase() === normalizedPromptId
        ) ?? null
    );
}

export async function getCreatorPromptIdsFromRegistry(creatorAddr: string) {
    const prompts = await getCreatorPromptsFromRegistry(creatorAddr);
    return prompts.map((prompt) => prompt.promptId);
}

export async function getCreatorPromptsFromRegistry(creatorAddr: string) {
    const normalizedCreator = normalizeAptosAddress(creatorAddr);
    const result = await loadPromptRegistry();

    return result.prompts
        .filter(
            (prompt) => normalizeAptosAddress(prompt.creator) === normalizedCreator
        );
}
