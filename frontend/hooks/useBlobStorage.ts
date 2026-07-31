/// Hook: storage lifetime for a creator's listings, and extending it.
///
/// A listing sells perpetual access while its Shelby storage is paid only up to
/// a fixed expiry. Left alone, content silently becomes unreadable a year after
/// publishing — so the dashboard shows the date and offers to push it out.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppWallet } from "@/components/wallet/walletContext";
import { waitForTransaction } from "@/lib/aptos";
import { buildExtendBlobStoragePayload } from "@/lib/contracts";
import { getErrorMessage } from "@/lib/utils";

export type BlobStorageStatus = {
    promptId: string;
    ok: boolean;
    error?: string;
    blobId?: string;
    expirationMicros?: number;
    expiresAt?: string;
    daysRemaining?: number;
    sizeBytes?: number;
    isWritten?: boolean;
};

const EXTENSION_MICROS = 365 * 24 * 60 * 60 * 1_000_000;

/// Anything inside this window is worth flagging to the creator.
export const STORAGE_WARNING_DAYS = 30;

export function useBlobStorage(promptIds: string[]) {
    const { signAndSubmitTransaction } = useAppWallet();
    const [statuses, setStatuses] = useState<Record<string, BlobStorageStatus>>({});
    const [loading, setLoading] = useState(false);
    const [extendingId, setExtendingId] = useState<string | null>(null);
    const [extendError, setExtendError] = useState<string | null>(null);

    // Stable key so the effect does not re-run on every render.
    const idsKey = useMemo(() => promptIds.slice(0, 25).join(","), [promptIds]);

    const load = useCallback(async () => {
        if (!idsKey) {
            setStatuses({});
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(
                `/api/v1/shelby/status?promptIds=${encodeURIComponent(idsKey)}`,
                { cache: "no-store" }
            );
            if (!response.ok) return;

            const payload = (await response.json()) as {
                statuses?: BlobStorageStatus[];
            };
            const next: Record<string, BlobStorageStatus> = {};
            (payload.statuses ?? []).forEach((status) => {
                next[status.promptId] = status;
            });
            setStatuses(next);
        } catch {
            // Storage status is supplementary — the dashboard still works without it.
        } finally {
            setLoading(false);
        }
    }, [idsKey]);

    useEffect(() => {
        load();
    }, [load]);

    /// Push the paid window out by a year from its *current* expiry, so
    /// remaining paid time is not discarded. Costs ShelbyUSD.
    const extendStorage = useCallback(
        async (promptId: string) => {
            const status = statuses[promptId];
            if (!status?.blobId || !status.expirationMicros) {
                setExtendError("Storage status for this listing is not loaded yet.");
                return false;
            }

            const [, ...nameParts] = status.blobId.split("/");
            const blobName = nameParts.join("/");
            if (!blobName) {
                setExtendError("This listing has an unreadable blob reference.");
                return false;
            }

            setExtendingId(promptId);
            setExtendError(null);

            try {
                const target = status.expirationMicros + EXTENSION_MICROS;
                const response = await signAndSubmitTransaction({
                    data: buildExtendBlobStoragePayload(blobName, target),
                });
                await waitForTransaction(response.hash, { checkSuccess: true });
                await load();
                return true;
            } catch (error: unknown) {
                setExtendError(
                    getErrorMessage(error, "Could not extend Shelby storage.")
                );
                return false;
            } finally {
                setExtendingId(null);
            }
        },
        [statuses, signAndSubmitTransaction, load]
    );

    return { statuses, loading, extendStorage, extendingId, extendError, refresh: load };
}
