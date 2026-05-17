/// Hook: Unlock a prompt (handles the full payment → access flow)

"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { aptosClient } from "@/lib/aptos";
import { buildUnlockPromptPayload, buildPurchaseApiCallsPayload, buildSubscribePayload } from "@/lib/contracts";
import { invalidatePromptRegistryCache } from "@/lib/promptRegistry";
import { getErrorMessage } from "@/lib/utils";
import type { TransactionState } from "@/types";

export function useUnlockPrompt() {
    const { account, signAndSubmitTransaction } = useWallet();
    const [txState, setTxState] = useState<TransactionState>({ status: "idle" });

    const unlockPrompt = useCallback(
        async (promptId: string) => {
            if (!account) {
                setTxState({ status: "error", error: "Wallet not connected" });
                return null;
            }

            try {
                setTxState({ status: "signing" });

                const payload = buildUnlockPromptPayload(promptId);
                setTxState({ status: "submitting" });

                const response = await signAndSubmitTransaction({ data: payload });
                setTxState({ status: "confirming", hash: response.hash });

                await aptosClient.waitForTransaction({
                    transactionHash: response.hash,
                });

                invalidatePromptRegistryCache();
                setTxState({ status: "success", hash: response.hash });
                return response.hash;
            } catch (error: unknown) {
                setTxState({
                    status: "error",
                    error: getErrorMessage(error, "Transaction failed"),
                });
                return null;
            }
        },
        [account, signAndSubmitTransaction]
    );

    const purchaseApiCalls = useCallback(
        async (promptId: string, numCalls: number) => {
            if (!account) {
                setTxState({ status: "error", error: "Wallet not connected" });
                return null;
            }

            try {
                setTxState({ status: "signing" });
                const payload = buildPurchaseApiCallsPayload(promptId, numCalls);
                setTxState({ status: "submitting" });

                const response = await signAndSubmitTransaction({ data: payload });
                setTxState({ status: "confirming", hash: response.hash });

                await aptosClient.waitForTransaction({
                    transactionHash: response.hash,
                });

                invalidatePromptRegistryCache();
                setTxState({ status: "success", hash: response.hash });
                return response.hash;
            } catch (error: unknown) {
                setTxState({
                    status: "error",
                    error: getErrorMessage(error, "Transaction failed"),
                });
                return null;
            }
        },
        [account, signAndSubmitTransaction]
    );

    const subscribe = useCallback(
        async (promptId: string, durationSecs: number) => {
            if (!account) {
                setTxState({ status: "error", error: "Wallet not connected" });
                return null;
            }

            try {
                setTxState({ status: "signing" });
                const payload = buildSubscribePayload(promptId, durationSecs);
                setTxState({ status: "submitting" });

                const response = await signAndSubmitTransaction({ data: payload });
                setTxState({ status: "confirming", hash: response.hash });

                await aptosClient.waitForTransaction({
                    transactionHash: response.hash,
                });

                invalidatePromptRegistryCache();
                setTxState({ status: "success", hash: response.hash });
                return response.hash;
            } catch (error: unknown) {
                setTxState({
                    status: "error",
                    error: getErrorMessage(error, "Transaction failed"),
                });
                return null;
            }
        },
        [account, signAndSubmitTransaction]
    );

    const reset = useCallback(() => {
        setTxState({ status: "idle" });
    }, []);

    return {
        txState,
        unlockPrompt,
        purchaseApiCalls,
        subscribe,
        reset,
    };
}
