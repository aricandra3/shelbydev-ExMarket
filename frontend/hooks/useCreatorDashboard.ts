/// Hook: Creator dashboard data (revenue, prompts)

"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import {
    getCreatorPrompts,
    getCreatorRevenue,
    getPromptMetadata,
} from "@/lib/contracts";
import type { PromptMetadata } from "@/types";
import { getErrorMessage, isRateLimitError } from "@/lib/utils";

export function useCreatorDashboard() {
    const { account } = useWallet();
    const [prompts, setPrompts] = useState<PromptMetadata[]>([]);
    const [totalRevenue, setTotalRevenue] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!account?.address) return;

        setLoading(true);
        setError(null);
        try {
            const [promptIds, revenue] = await Promise.all([
                getCreatorPrompts(account.address.toString(), { fresh: true }),
                getCreatorRevenue(account.address.toString()),
            ]);

            setTotalRevenue(revenue);

            // Fetch metadata for each prompt
            const metadatas = (
                await Promise.all(
                    promptIds.map((id) => getPromptMetadata(id).catch(() => null))
                )
            ).filter((metadata): metadata is PromptMetadata => metadata !== null);
            setPrompts(metadatas);
        } catch (error: unknown) {
            setError(
                isRateLimitError(error)
                    ? "Aptos is rate limiting dashboard data. Wait a moment, then retry."
                    : getErrorMessage(error, "Dashboard data could not be loaded.")
            );
        } finally {
            setLoading(false);
        }
    }, [account?.address]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        prompts,
        totalRevenue,
        loading,
        error,
        refresh,
    };
}
