/// Hook: Fetch prompt listings via cached local API route

"use client";

import { useState, useEffect, useCallback } from "react";
import { getErrorMessage, isRateLimitError } from "@/lib/utils";
import { loadPromptRegistry } from "@/lib/promptRegistry";
import type { PromptMetadata } from "@/types";

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
