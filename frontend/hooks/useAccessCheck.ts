/// Hook: Check on-chain access for the connected wallet

"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { hasAccess as checkAccess, getApiCallsRemaining } from "@/lib/contracts";

export function useAccessCheck(promptId: string | null) {
    const { account } = useWallet();
    const [hasAccessResult, setHasAccess] = useState(false);
    const [apiCallsRemaining, setApiCallsRemaining] = useState(0);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!account?.address || !promptId) {
            setHasAccess(false);
            setApiCallsRemaining(0);
            return;
        }

        setLoading(true);
        try {
            const [access, calls] = await Promise.all([
                checkAccess(account.address.toString(), promptId),
                getApiCallsRemaining(account.address.toString(), promptId),
            ]);
            setHasAccess(access);
            setApiCallsRemaining(calls);
        } catch (error) {
            console.error("Access check failed:", error);
            setHasAccess(false);
            setApiCallsRemaining(0);
        } finally {
            setLoading(false);
        }
    }, [account?.address, promptId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        hasAccess: hasAccessResult,
        apiCallsRemaining,
        loading,
        refresh,
    };
}
