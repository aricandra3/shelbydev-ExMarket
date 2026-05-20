/// Hook: Creator dashboard data (revenue, prompts)

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppWallet } from "@/components/wallet/walletContext";
import { getCreatorPrompts, getPromptMetadata } from "@/lib/contracts";
import { getCreatorPromptsFromRegistry } from "@/lib/promptRegistry";
import type { PromptMetadata } from "@/types";
import { getErrorMessage, isRateLimitError } from "@/lib/utils";

function normalizePromptId(promptId: string) {
    return promptId.trim().toLowerCase();
}

function sortByCreatorOrder(prompts: PromptMetadata[], promptIds: string[]) {
    const order = new Map(
        promptIds.map((promptId, index) => [normalizePromptId(promptId), index])
    );

    return [...prompts].sort((a, b) => {
        const aOrder = order.get(normalizePromptId(a.promptId));
        const bOrder = order.get(normalizePromptId(b.promptId));

        if (aOrder !== undefined || bOrder !== undefined) {
            return (bOrder ?? -1) - (aOrder ?? -1);
        }

        return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
    });
}

async function loadCreatorPrompts(accountAddress: string) {
    const registryPrompts = await getCreatorPromptsFromRegistry(accountAddress).catch(
        () => [] as PromptMetadata[]
    );
    const promptsById = new Map(
        registryPrompts.map((prompt) => [normalizePromptId(prompt.promptId), prompt])
    );

    let creatorPromptIds: string[];
    try {
        creatorPromptIds = await getCreatorPrompts(accountAddress, { fresh: true });
    } catch (error) {
        if (registryPrompts.length > 0) {
            console.warn("Creator on-chain prompt fallback failed.", error);
            return registryPrompts;
        }

        throw error;
    }

    let metadataFallbackError: unknown = null;

    for (const promptId of creatorPromptIds) {
        const normalizedPromptId = normalizePromptId(promptId);
        if (promptsById.has(normalizedPromptId)) continue;

        try {
            const metadata = await getPromptMetadata(promptId, { fresh: true });
            promptsById.set(normalizedPromptId, metadata);
        } catch (error) {
            metadataFallbackError ??= error;
            console.warn(`Creator prompt metadata fallback failed for ${promptId}.`, error);
        }
    }

    if (creatorPromptIds.length > 0 && promptsById.size === 0 && metadataFallbackError) {
        throw metadataFallbackError;
    }

    const onChainPromptIds = new Set(creatorPromptIds.map(normalizePromptId));
    const confirmedPrompts = Array.from(promptsById.values()).filter((prompt) =>
        onChainPromptIds.has(normalizePromptId(prompt.promptId))
    );

    return sortByCreatorOrder(confirmedPrompts, creatorPromptIds);
}

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
            const metadatas = await loadCreatorPrompts(accountAddress);
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
