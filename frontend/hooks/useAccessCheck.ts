/// Hook: Check on-chain access for the connected wallet

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppWallet } from "@/components/wallet/walletContext";
import { hasAccess as checkAccess, getApiCallsRemaining } from "@/lib/contracts";

export function useAccessCheck(promptId: string | null) {
    const { account } = useAppWallet();
    const accountAddress = account?.address?.toString();
    const [hasAccessResult, setHasAccess] = useState(false);
    const [apiCallsRemaining, setApiCallsRemaining] = useState(0);
    const [loading, setLoading] = useState(false);
    const requestIdRef = useRef(0);

    const refresh = useCallback(async (fresh = false) => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        if (!accountAddress || !promptId) {
            setHasAccess(false);
            setApiCallsRemaining(0);
            setLoading(false);
            return;
        }

        setLoading(true);
        setHasAccess(false);
        setApiCallsRemaining(0);
        try {
            const [access, calls] = await Promise.all([
                checkAccess(accountAddress, promptId, { fresh }),
                getApiCallsRemaining(accountAddress, promptId, { fresh }),
            ]);

            if (requestId !== requestIdRef.current) return;
            setHasAccess(access);
            setApiCallsRemaining(calls);
        } catch (error) {
            if (requestId !== requestIdRef.current) return;
            console.error("Access check failed:", error);
            setHasAccess(false);
            setApiCallsRemaining(0);
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [accountAddress, promptId]);

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
