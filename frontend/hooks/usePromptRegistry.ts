/// Hook: Fetch prompt listings via cached local API route

"use client";

import { useState, useEffect, useCallback } from "react";
import type { PromptMetadata } from "@/types";

const CACHE_TTL_MS = 30_000;

let browserCache:
    | {
          prompts: PromptMetadata[];
          timestamp: number;
      }
    | null = null;
let browserInFlight: Promise<PromptMetadata[]> | null = null;

async function loadPromptRegistry(force = false): Promise<PromptMetadata[]> {
    if (
        !force &&
        browserCache &&
        Date.now() - browserCache.timestamp < CACHE_TTL_MS
    ) {
        return browserCache.prompts;
    }
    if (!force && browserInFlight) return browserInFlight;

    browserInFlight = fetch("/api/v1/registry", { cache: "no-store" })
        .then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    payload?.error || `HTTP ${response.status}: ${response.statusText}`
                );
            }
            return payload.prompts as PromptMetadata[];
        })
        .then((prompts) => {
            browserCache = { prompts, timestamp: Date.now() };
            return prompts;
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

    const fetchPrompts = useCallback(async (force = false) => {
        setLoading(true);
        setError(null);

        try {
            let filtered = await loadPromptRegistry(force);

            // Category filter
            if (category) {
                filtered = filtered.filter((m) => m.category === category);
            }

            setPrompts(filtered);
        } catch (err: any) {
            console.error("Failed to fetch prompts:", err);
            setError(err?.message || "Failed to load prompts");
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
        refresh: () => fetchPrompts(true),
    };
}
