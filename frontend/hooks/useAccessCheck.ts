/// Hook: Check on-chain access for the connected wallet

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppWallet } from "@/components/wallet/walletContext";
import {
    hasAccess as checkAccess,
    getAccessRecord,
    type AccessRecord,
} from "@/lib/contracts";

const NO_ACCESS: AccessRecord = {
    accessType: "none",
    grantedAt: 0,
    expiresAt: 0,
    apiCallsRemaining: 0,
};

export function useAccessCheck(promptId: string | null) {
    const { account } = useAppWallet();
    const accountAddress = account?.address?.toString();
    const [hasAccessResult, setHasAccess] = useState(false);
    const [record, setRecord] = useState<AccessRecord>(NO_ACCESS);
    const [loading, setLoading] = useState(false);
    const requestIdRef = useRef(0);

    const refresh = useCallback(async (fresh = false) => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        if (!accountAddress || !promptId) {
            setHasAccess(false);
            setRecord(NO_ACCESS);
            setLoading(false);
            return;
        }

        setLoading(true);
        setHasAccess(false);
        setRecord(NO_ACCESS);
        try {
            // One record read now covers both the API quota and the
            // subscription window, so this is no more expensive than before.
            const [access, accessRecord] = await Promise.all([
                checkAccess(accountAddress, promptId, { fresh }),
                getAccessRecord(accountAddress, promptId, { fresh }),
            ]);

            if (requestId !== requestIdRef.current) return;
            setHasAccess(access);
            setRecord(accessRecord);
        } catch (error) {
            if (requestId !== requestIdRef.current) return;
            console.error("Access check failed:", error);
            setHasAccess(false);
            setRecord(NO_ACCESS);
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [accountAddress, promptId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        hasAccess: hasAccessResult,
        record,
        apiCallsRemaining: record.apiCallsRemaining,
        /** Unix seconds; 0 for perpetual or no access. */
        expiresAt: record.expiresAt,
        loading,
        refresh,
    };
}
