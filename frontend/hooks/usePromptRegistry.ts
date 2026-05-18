/// Hook: Fetch prompt listings via cached local API route

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getErrorMessage, isRateLimitError } from "@/lib/utils";
import { loadPromptRegistry } from "@/lib/promptRegistry";
import type { PromptMetadata } from "@/types";

export function usePromptRegistry(category?: string) {
    const [registryPrompts, setRegistryPrompts] = useState<PromptMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stale, setStale] = useState(false);

    const fetchPrompts = useCallback(async (force = false) => {
        setLoading(true);
        setError(null);

        try {
            const result = await loadPromptRegistry(force);
            setRegistryPrompts(result.prompts);
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
    }, []);

    useEffect(() => {
        fetchPrompts();
    }, [fetchPrompts]);

    const prompts = useMemo(() => {
        if (!category) return registryPrompts;
        return registryPrompts.filter((prompt) => prompt.category === category);
    }, [registryPrompts, category]);

    return {
        prompts,
        loading,
        error,
        stale,
        refresh: () => fetchPrompts(true),
    };
}
