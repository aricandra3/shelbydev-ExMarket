"use client";

import { createContext, useContext } from "react";

type WalletAddressLike = {
    toString(): string;
};

export type AppWalletAccount = {
    address?: WalletAddressLike;
    publicKey?: unknown;
};

export type AppWalletInfo = {
    name?: string;
};

export type AppWalletOption = {
    name: string;
    readyState?: unknown;
};

export type AppWalletContextValue = {
    account: AppWalletAccount | null;
    connected: boolean;
    connect: (walletName: string) => Promise<void> | void;
    disconnect: () => Promise<void> | void;
    isLoading: boolean;
    signAndSubmitTransaction: (args: any) => Promise<any>;
    signMessage: (args: any) => Promise<any>;
    wallet: AppWalletInfo | null;
    wallets: AppWalletOption[];
};

async function walletUnavailable(): Promise<never> {
    throw new Error("Wallet provider is not ready.");
}

const defaultWalletContext: AppWalletContextValue = {
    account: null,
    connected: false,
    connect: walletUnavailable,
    disconnect: walletUnavailable,
    isLoading: false,
    signAndSubmitTransaction: walletUnavailable,
    signMessage: walletUnavailable,
    wallet: null,
    wallets: [],
};

export const AppWalletContext = createContext<AppWalletContextValue>(
    defaultWalletContext
);

export function useAppWallet() {
    return useContext(AppWalletContext);
}
