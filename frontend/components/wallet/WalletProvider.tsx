/// Aptos Wallet Provider wrapper

"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { NETWORK } from "@/lib/constants";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
    AppWalletContext,
    type AppWalletContextValue,
} from "@/components/wallet/walletContext";
import { resetWalletStorage, sanitizeWalletStorage } from "@/components/wallet/walletStorage";

const networkMap: Record<string, string> = {
    mainnet: "mainnet",
    testnet: "testnet",
    devnet: "devnet",
};

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

function WalletStateBridge({ children }: { children: ReactNode }) {
    const walletState = useWallet();
    const value = useMemo<AppWalletContextValue>(
        () => ({
            account: walletState.account ?? null,
            connected: walletState.connected,
            connect: (walletName: string) => walletState.connect(walletName),
            disconnect: () => walletState.disconnect(),
            isLoading: walletState.isLoading,
            signAndSubmitTransaction: (args: any) =>
                walletState.signAndSubmitTransaction(args),
            signMessage: (args: any) => walletState.signMessage(args),
            wallet: walletState.wallet ?? null,
            wallets: [...(walletState.wallets ?? [])].map((wallet) => ({
                name: wallet.name,
                readyState: wallet.readyState,
            })),
        }),
        [
            walletState.account,
            walletState.connected,
            walletState.connect,
            walletState.disconnect,
            walletState.isLoading,
            walletState.signAndSubmitTransaction,
            walletState.signMessage,
            walletState.wallet,
            walletState.wallets,
        ]
    );

    return (
        <AppWalletContext.Provider value={value}>
            {children}
        </AppWalletContext.Provider>
    );
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
                network: (networkMap[NETWORK] || "testnet") as any,
            }}
            onError={handleWalletError}
        >
            <WalletStateBridge>{children}</WalletStateBridge>
        </AptosWalletAdapterProvider>
    );
}
