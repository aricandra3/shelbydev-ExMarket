/// Wallet Connect Button

"use client";

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { truncateAddress } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, LogOut, Wallet } from "lucide-react";

export function ConnectButton() {
    const { account, connected, connect, disconnect, wallets } = useWallet();
    const [showMenu, setShowMenu] = useState(false);

    if (connected && account) {
        return (
            <div className="relative">
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-[7px] border-2 border-ink bg-retro-mint px-4 py-2.5 text-sm font-black uppercase tracking-wide text-ink shadow-neo-sm transition-all duration-150 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
                >
                    <span className="h-2 w-2 rounded-full border border-ink bg-accent-green animate-pulse" />
                    {truncateAddress(account.address.toString())}
                    <ChevronDown className="h-4 w-4" />
                </button>

                {showMenu && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setShowMenu(false)}
                        />
                        <div className="absolute right-0 top-full z-50 mt-3 w-52 animate-fade-in glass-card p-2">
                            <button
                                onClick={() => {
                                    disconnect();
                                    setShowMenu(false);
                                }}
                                className="flex min-h-11 w-full items-center gap-2 rounded-[6px] px-3 py-2.5 text-left text-sm font-black uppercase tracking-wide text-cream/70 transition-colors hover:bg-retro-coral hover:text-ink"
                            >
                                <LogOut className="h-4 w-4" />
                                Disconnect
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <Button
            onClick={() => {
                // Connect to the first available wallet
                if (wallets && wallets.length > 0) {
                    connect(wallets[0].name);
                }
            }}
            size="sm"
        >
            <Wallet className="h-4 w-4" />
            Connect Wallet
        </Button>
    );
}
