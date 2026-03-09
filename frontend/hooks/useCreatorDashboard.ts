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

export function useCreatorDashboard() {
    const { account } = useWallet();
    const [prompts, setPrompts] = useState<PromptMetadata[]>([]);
    const [totalRevenue, setTotalRevenue] = useState(0);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!account?.address) return;

        setLoading(true);
        try {
            const [promptIds, revenue] = await Promise.all([
                getCreatorPrompts(account.address.toString()),
                getCreatorRevenue(account.address.toString()),
            ]);

            setTotalRevenue(revenue);

            // Fetch metadata for each prompt
            const metadatas = await Promise.all(
                promptIds.map((id) => getPromptMetadata(id))
            );
            setPrompts(metadatas);
        } catch (error) {
            console.error("Dashboard fetch failed:", error);
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
        refresh,
    };
}
