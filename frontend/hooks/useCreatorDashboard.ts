/// Hook: Creator dashboard data (revenue, prompts)

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppWallet } from "@/components/wallet/walletContext";
import { getCreatorPromptsFromRegistry } from "@/lib/promptRegistry";
import type { PromptMetadata } from "@/types";
import { getErrorMessage, isRateLimitError } from "@/lib/utils";

export function useCreatorDashboard() {
    const { account } = useAppWallet();
    const accountAddress = account?.address?.toString();
    const [prompts, setPrompts] = useState<PromptMetadata[]>([]);
    const [totalRevenue, setTotalRevenue] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestIdRef = useRef(0);

    const refresh = useCallback(async () => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        if (!accountAddress) {
            setPrompts([]);
            setTotalRevenue(0);
            setError(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        setPrompts([]);
        setTotalRevenue(0);
        try {
            const metadatas = await getCreatorPromptsFromRegistry(accountAddress);
            if (requestId !== requestIdRef.current) return;
            setTotalRevenue(
                metadatas.reduce((sum, prompt) => sum + prompt.totalRevenue, 0)
            );
            setPrompts(metadatas);
        } catch (error: unknown) {
            if (requestId !== requestIdRef.current) return;
            setError(
                isRateLimitError(error)
                    ? "Aptos is rate limiting dashboard data. Wait a moment, then retry."
                    : getErrorMessage(error, "Dashboard data could not be loaded.")
            );
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [accountAddress]);

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
