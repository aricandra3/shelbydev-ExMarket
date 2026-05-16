/// Aptos Wallet Provider wrapper

"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { NETWORK } from "@/lib/constants";
import { type ReactNode } from "react";

const networkMap: Record<string, Network> = {
    mainnet: Network.MAINNET,
    testnet: Network.TESTNET,
    devnet: Network.DEVNET,
};

export function WalletProvider({ children }: { children: ReactNode }) {
    return (
        <AptosWalletAdapterProvider
            autoConnect={true}
            dappConfig={{
                network: networkMap[NETWORK] || Network.TESTNET,
            }}
            onError={(error) => {
                console.error("Wallet error:", error);
            }}
        >
            {children}
        </AptosWalletAdapterProvider>
    );
}
