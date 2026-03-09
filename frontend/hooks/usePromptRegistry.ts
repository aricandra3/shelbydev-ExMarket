/// Hook: Fetch prompt listings (using on-chain events via indexer)

"use client";

import { useState, useEffect, useCallback } from "react";
import { aptosClient } from "@/lib/aptos";
import { getPromptMetadata } from "@/lib/contracts";
import { MODULE_ADDRESS } from "@/lib/constants";
import type { PromptMetadata } from "@/types";

export function usePromptRegistry(category?: string) {
    const [prompts, setPrompts] = useState<PromptMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPrompts = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Query PromptRegistered events from the indexer
            const response = await aptosClient.queryIndexer({
                query: {
                    query: `
                        query GetPromptEvents($eventType: String!) {
                            events(where: {type: {_eq: $eventType}}) {
                                data
                            }
                        }
                    `,
                    variables: {
                        eventType: `${MODULE_ADDRESS}::prompt_registry::PromptRegistered`
                    }
                }
            });
            const events = (response as any).events || [];

            // Extract prompt IDs from events
            const promptIds: string[] = events.map(
                (event: any) => event.data.prompt_id
            );

            // Deduplicate
            const uniqueIds = Array.from(new Set(promptIds));

            // Fetch full metadata for each
            const metadatas = await Promise.all(
                uniqueIds.map((id) =>
                    getPromptMetadata(id).catch(() => null)
                )
            );

            let filtered = metadatas.filter(
                (m): m is PromptMetadata => m !== null && m.status === "active"
            );

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
        refresh: fetchPrompts,
    };
}
