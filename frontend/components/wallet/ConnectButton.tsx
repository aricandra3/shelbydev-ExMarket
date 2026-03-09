/// Wallet Connect Button

"use client";

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { truncateAddress } from "@/lib/utils";
import { useState } from "react";

export function ConnectButton() {
    const { account, connected, connect, disconnect, wallets } = useWallet();
    const [showMenu, setShowMenu] = useState(false);

    if (connected && account) {
        return (
            <div className="relative">
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                     bg-surface-3 border border-white/[0.08]
                     text-sm font-medium text-white/80
                     hover:border-brand-500/30 transition-all duration-200"
                >
                    <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
                    {truncateAddress(account.address.toString())}
                </button>

                {showMenu && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setShowMenu(false)}
                        />
                        <div className="absolute right-0 top-full mt-2 w-48 py-2 z-50
                            glass-card rounded-xl animate-fade-in">
                            <button
                                onClick={() => {
                                    disconnect();
                                    setShowMenu(false);
                                }}
                                className="w-full px-4 py-2.5 text-left text-sm text-white/60
                           hover:text-white hover:bg-white/[0.04] transition-colors"
                            >
                                Disconnect
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <button
            onClick={() => {
                // Connect to the first available wallet
                if (wallets && wallets.length > 0) {
                    connect(wallets[0].name);
                }
            }}
            className="btn-primary"
        >
            Connect Wallet
        </button>
    );
}
