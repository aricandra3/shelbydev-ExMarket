/// Hook: Fetch prompt listings via cached local API route

"use client";

import { useState, useEffect, useCallback } from "react";
import type { PromptMetadata } from "@/types";
import { getErrorMessage, isRateLimitError } from "@/lib/utils";

const CACHE_TTL_MS = 30_000;

type RegistryLoadResult = {
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

async function loadPromptRegistry(force = false): Promise<RegistryLoadResult> {
    if (
        !force &&
        browserCache &&
        Date.now() - browserCache.timestamp < CACHE_TTL_MS
    ) {
        return { prompts: browserCache.prompts };
    }
    if (!force && browserInFlight) return browserInFlight;

    browserInFlight = fetch("/api/v1/registry", { cache: "no-store" })
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
            const prompts = result.prompts;
            browserCache = { prompts, timestamp: Date.now() };
            return result;
        })
        .finally(() => {
            browserInFlight = null;
        });

    return browserInFlight;
}

export function usePromptRegistry(category?: string) {
    const [prompts, setPrompts] = useState<PromptMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stale, setStale] = useState(false);

    const fetchPrompts = useCallback(async (force = false) => {
        setLoading(true);
        setError(null);

        try {
            const result = await loadPromptRegistry(force);
            let filtered = result.prompts;

            // Category filter
            if (category) {
                filtered = filtered.filter((m) => m.category === category);
            }

            setPrompts(filtered);
            setStale(Boolean(result.stale));
        } catch (err: unknown) {
            setStale(false);
            setError(
                isRateLimitError(err)
                    ? "Aptos is rate limiting registry requests. Wait a moment, then retry."
                    : getErrorMessage(err, "Failed to load prompts")
            );
        } finally {
            setLoading(false);
        }
    }, [category]);

    useEffect(() => {
        fetchPrompts();
    }, [fetchPrompts]);

    return {
        prompts,
        loading,
        error,
        stale,
        refresh: () => fetchPrompts(true),
    };
}
