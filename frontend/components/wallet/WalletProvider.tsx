/// Aptos Wallet Provider wrapper

"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { NETWORK } from "@/lib/constants";
import { type ReactNode, useCallback, useEffect, useState } from "react";

const networkMap: Record<string, Network> = {
    mainnet: Network.MAINNET,
    testnet: Network.TESTNET,
    devnet: Network.DEVNET,
};

const WALLET_STORAGE_KEYS_TO_RESET = [
    "AptosWalletName",
    "@aptos-connect/connectedAccount",
    "@aptos-connect/dapp-local-state",
    "icDappPairings",
];

const WALLET_JSON_STORAGE_KEYS = [
    "@aptos-connect/connectedAccount",
    "@aptos-connect/dapp-local-state",
    "icDappPairings",
];

function getWalletErrorMessage(error: unknown) {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message ?? "");
    }
    return String(error ?? "");
}

function isStorageJsonParseError(message: string) {
    const normalized = message.toLowerCase();
    return (
        normalized.includes("not valid json") ||
        (normalized.includes("unexpected token") && normalized.includes("json"))
    );
}

export function resetWalletStorage() {
    if (typeof window === "undefined") return;

    WALLET_STORAGE_KEYS_TO_RESET.forEach((key) => {
        window.localStorage.removeItem(key);
    });
}

function sanitizeWalletStorage() {
    if (typeof window === "undefined") return;

    for (const key of WALLET_JSON_STORAGE_KEYS) {
        const value = window.localStorage.getItem(key);
        if (!value) continue;

        try {
            JSON.parse(value);
        } catch {
            resetWalletStorage();
            return;
        }
    }
}

export function WalletProvider({ children }: { children: ReactNode }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        sanitizeWalletStorage();
        setMounted(true);
    }, []);

    const handleWalletError = useCallback((error: unknown) => {
        const message = getWalletErrorMessage(error);

        if (isStorageJsonParseError(message)) {
            resetWalletStorage();
            console.warn("Wallet session storage was reset after invalid data.");
            return;
        }

        console.warn("Wallet adapter warning:", error);
    }, []);

    if (!mounted) {
        return <>{children}</>;
    }

    return (
        <AptosWalletAdapterProvider
            autoConnect={true}
            dappConfig={{
                network: networkMap[NETWORK] || Network.TESTNET,
            }}
            onError={handleWalletError}
        >
            {children}
        </AptosWalletAdapterProvider>
    );
}
