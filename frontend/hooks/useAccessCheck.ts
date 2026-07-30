/// Hook: Check on-chain access for the connected wallet

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppWallet } from "@/components/wallet/walletContext";
import { getAccessRecord, type AccessRecord } from "@/lib/contracts";

const NO_ACCESS: AccessRecord = {
    accessType: "none",
    grantedAt: 0,
    expiresAt: 0,
    apiCallsRemaining: 0,
};

/// Mirrors access_control::has_access over a record we already fetched, instead
/// of spending a second view call to ask the chain the same question. The
/// contract still decides at payment time, and ACE workers still call
/// check_permission on-chain before releasing a key — this only gates the UI.
function recordGrantsAccess(record: AccessRecord): boolean {
    if (record.accessType === "perpetual") return true;
    if (record.accessType === "subscription") {
        return record.expiresAt === 0 || record.expiresAt * 1000 > Date.now();
    }
    if (record.accessType === "api") return record.apiCallsRemaining > 0;
    return false;
}

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
            // A single record read answers everything: whether access is live,
            // when a subscription ends, and how much API quota is left.
            const accessRecord = await getAccessRecord(accountAddress, promptId, {
                fresh,
            });

            if (requestId !== requestIdRef.current) return;
            setHasAccess(recordGrantsAccess(accessRecord));
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
