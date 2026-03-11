/// Hook: Fetch prompt listings (using on-chain events via Aptos REST node API)

"use client";

import { useState, useEffect, useCallback } from "react";
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
            // Aptos Indexer v2 has no events table. The only way to query #[event] module
            // events is via the REST node API — each transaction response includes an `events[]`
            // array. We scan account transactions for MODULE_ADDRESS, then filter client-side.
            const eventsTarget = `${MODULE_ADDRESS}::prompt_registry::PromptRegistered`;
            const { APTOS_NODE_URL, APTOS_API_KEY } = await import("@/lib/constants");
            const headers: HeadersInit = APTOS_API_KEY
                ? { Authorization: `Bearer ${APTOS_API_KEY}` }
                : {};

            // Fetch up to 500 recent transactions for the module account
            const txResp = await fetch(
                `${APTOS_NODE_URL}/accounts/${MODULE_ADDRESS}/transactions?limit=500`,
                { headers }
            );
            if (!txResp.ok) {
                throw new Error(`HTTP ${txResp.status}: ${txResp.statusText}`);
            }
            const txns: any[] = await txResp.json();

            // Extract PromptRegistered events from each transaction
            const events: any[] = txns.flatMap((tx: any) =>
                (tx.events ?? []).filter((e: any) => e.type === eventsTarget)
            );

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
