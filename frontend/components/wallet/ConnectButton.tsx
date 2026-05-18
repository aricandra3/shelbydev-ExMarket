/// Wallet Connect Button

"use client";

import { useEffect, useMemo, useState } from "react";
import {
    useWallet,
    WalletReadyState,
} from "@aptos-labs/wallet-adapter-react";
import { resetWalletStorage } from "@/components/wallet/WalletProvider";
import { copyToClipboard, getErrorMessage, truncateAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Check,
    ChevronDown,
    Clipboard,
    Loader2,
    LogOut,
    ShieldCheck,
    Wallet,
} from "lucide-react";

function getWalletLabel(name: string) {
    return name.replace(/_/g, " ");
}

export function ConnectButton() {
    const {
        account,
        connected,
        connect,
        disconnect,
        wallet,
        wallets,
        isLoading,
    } = useWallet();
    const [showMenu, setShowMenu] = useState(false);
    const [busyWallet, setBusyWallet] = useState<string | null>(null);
    const [disconnecting, setDisconnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const availableWallets = wallets ?? [];

    const installedWallets = useMemo(
        () =>
            availableWallets.filter(
                (item) => item.readyState === WalletReadyState.Installed
            ),
        [availableWallets]
    );
    const unavailableWallets = useMemo(
        () =>
            availableWallets.filter(
                (item) => item.readyState !== WalletReadyState.Installed
            ),
        [availableWallets]
    );
    const address = account?.address?.toString();

    useEffect(() => {
        if (!showMenu) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") setShowMenu(false);
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [showMenu]);

    const handleConnect = async (walletName: string) => {
        setError(null);
        setBusyWallet(walletName);

        try {
            await Promise.resolve(connect(walletName));
            setShowMenu(false);
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Wallet connection failed."));
        } finally {
            setBusyWallet(null);
        }
    };

    const handleDisconnect = async () => {
        setError(null);
        setDisconnecting(true);

        try {
            await Promise.resolve(disconnect());
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Wallet disconnect failed."));
        } finally {
            resetWalletStorage();
            setDisconnecting(false);
            setShowMenu(false);
        }
    };

    const handleCopyAddress = async () => {
        if (!address) return;
        const didCopy = await copyToClipboard(address);
        if (!didCopy) {
            setError("Clipboard permission was blocked.");
            return;
        }

        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    };

    if (connected && account && address) {
        return (
            <div className="relative">
                <button
                    type="button"
                    onClick={() => {
                        setError(null);
                        setShowMenu((open) => !open);
                    }}
                    aria-expanded={showMenu}
                    className="inline-flex min-h-11 items-center gap-2 rounded-[7px] border-2 border-ink bg-retro-mint px-3 py-2.5 text-xs font-black uppercase tracking-wide text-ink shadow-neo-sm transition-all duration-150 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none sm:px-4 sm:text-sm"
                >
                    <span className="h-2 w-2 rounded-full border border-ink bg-accent-green" />
                    <span className="hidden sm:inline">
                        {wallet?.name ? getWalletLabel(wallet.name) : "Wallet"}
                    </span>
                    <span className="font-mono">{truncateAddress(address)}</span>
                    <ChevronDown className="h-4 w-4" />
                </button>

                {showMenu && (
                    <>
                        <button
                            type="button"
                            aria-label="Close wallet menu"
                            className="fixed inset-0 z-40 cursor-default"
                            onClick={() => setShowMenu(false)}
                        />
                        <div className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] animate-fade-in overflow-hidden rounded-[8px] border-2 border-ink bg-surface-1/95 p-2 text-cream shadow-neo-dark backdrop-blur-xl">
                            <div className="border-b border-cream/10 px-3 py-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="inline-flex items-center gap-1.5 rounded-[5px] border-2 border-ink bg-retro-cyan px-2 py-1 text-[10px] font-black uppercase tracking-wide text-ink">
                                        <ShieldCheck className="h-3.5 w-3.5" />
                                        Connected
                                    </span>
                                    <span className="truncate text-xs font-black uppercase text-cream/45">
                                        {wallet?.name ? getWalletLabel(wallet.name) : "Aptos"}
                                    </span>
                                </div>
                                <p className="break-all font-mono text-xs font-semibold leading-relaxed text-cream/70">
                                    {address}
                                </p>
                            </div>

                            <div className="grid gap-1 py-2">
                                <button
                                    type="button"
                                    onClick={handleCopyAddress}
                                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[6px] px-3 py-2.5 text-left text-sm font-black uppercase tracking-wide text-cream/70 transition-colors hover:bg-cream/[0.08] hover:text-cream"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        {copied ? (
                                            <Check className="h-4 w-4 text-accent-green" />
                                        ) : (
                                            <Clipboard className="h-4 w-4" />
                                        )}
                                        {copied ? "Copied" : "Copy address"}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDisconnect}
                                    disabled={disconnecting}
                                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[6px] px-3 py-2.5 text-left text-sm font-black uppercase tracking-wide text-cream/70 transition-colors hover:bg-retro-coral hover:text-ink disabled:pointer-events-none disabled:opacity-55"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        {disconnecting ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <LogOut className="h-4 w-4" />
                                        )}
                                        Disconnect
                                    </span>
                                </button>
                            </div>

                            {error && (
                                <p className="border-t border-cream/10 px-3 py-2 text-xs font-semibold text-retro-coral">
                                    {error}
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="relative">
            <Button
                type="button"
                onClick={() => {
                    setError(null);
                    setShowMenu((open) => !open);
                }}
                disabled={isLoading || Boolean(busyWallet)}
                size="sm"
                aria-expanded={showMenu}
            >
                {isLoading || busyWallet ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Wallet className="h-4 w-4" />
                )}
                Connect Wallet
            </Button>

            {showMenu && (
                <>
                    <button
                        type="button"
                        aria-label="Close wallet menu"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setShowMenu(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] animate-fade-in overflow-hidden rounded-[8px] border-2 border-ink bg-surface-1/95 p-2 text-cream shadow-neo-dark backdrop-blur-xl">
                        <div className="border-b border-cream/10 px-3 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-retro-yellow">
                                Select wallet
                            </p>
                            <p className="mt-1 text-xs font-semibold text-cream/45">
                                Choose the wallet you want to use for this session.
                            </p>
                        </div>

                        <div className="grid gap-1 py-2">
                            {installedWallets.length > 0 ? (
                                installedWallets.map((item) => (
                                    <button
                                        key={item.name}
                                        type="button"
                                        onClick={() => handleConnect(item.name)}
                                        disabled={Boolean(busyWallet)}
                                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[6px] px-3 py-2.5 text-left text-sm font-black uppercase tracking-wide text-cream/75 transition-colors hover:bg-retro-mint hover:text-ink disabled:pointer-events-none disabled:opacity-55"
                                    >
                                        <span className="inline-flex min-w-0 items-center gap-2">
                                            {busyWallet === item.name ? (
                                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                            ) : (
                                                <Wallet className="h-4 w-4 shrink-0" />
                                            )}
                                            <span className="truncate">
                                                {getWalletLabel(item.name)}
                                            </span>
                                        </span>
                                        <span className="rounded-[5px] border border-cream/15 px-2 py-0.5 text-[10px] text-cream/45">
                                            Ready
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <p className="px-3 py-4 text-sm font-semibold text-cream/55">
                                    No Aptos wallet extension was detected.
                                </p>
                            )}
                        </div>

                        {unavailableWallets.length > 0 && (
                            <div className="border-t border-cream/10 px-3 py-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-cream/35">
                                    Detected but unavailable
                                </p>
                                <p className="mt-1 truncate text-xs font-semibold text-cream/45">
                                    {unavailableWallets
                                        .map((item) => getWalletLabel(item.name))
                                        .join(", ")}
                                </p>
                            </div>
                        )}

                        {error && (
                            <p className="border-t border-cream/10 px-3 py-2 text-xs font-semibold text-retro-coral">
                                {error}
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
