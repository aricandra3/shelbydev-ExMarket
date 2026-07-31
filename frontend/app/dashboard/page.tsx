/// Creator Dashboard — Revenue stats and prompt management

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAppWallet } from "@/components/wallet/walletContext";
import { useCreatorDashboard } from "@/hooks/useCreatorDashboard";
import { STORAGE_WARNING_DAYS, useBlobStorage } from "@/hooks/useBlobStorage";
import { formatApt } from "@/lib/constants";
import { truncateAddress } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HardDrive, Plus, TriangleAlert, WalletCards } from "lucide-react";

export default function DashboardPage() {
    const { account, connected } = useAppWallet();
    const { prompts, totalRevenue, loading, error, refresh } = useCreatorDashboard();
    const promptIds = useMemo(() => prompts.map((p) => p.promptId), [prompts]);
    const { statuses, extendStorage, extendingId, extendError } =
        useBlobStorage(promptIds);
    const expiringSoon = prompts.filter((p) => {
        const days = statuses[p.promptId]?.daysRemaining;
        return typeof days === "number" && days <= STORAGE_WARNING_DAYS;
    });

    if (!connected) {
        return (
            <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
                <Card className="p-12 text-center">
                    <Badge variant="warning" className="mb-4 shadow-neo-sm">
                        Wallet Required
                    </Badge>
                    <p className="font-semibold text-cream/55">
                        Connect your wallet to access your creator dashboard.
                    </p>
                </Card>
            </div>
        );
    }

    const totalUnlocks = prompts.reduce((sum, p) => sum + p.totalUnlocks, 0);
    const activePrompts = prompts.filter((p) => p.status === "active").length;

    return (
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <Badge variant="secondary" className="mb-4 shadow-neo-sm">
                        <WalletCards className="h-3.5 w-3.5" />
                        Creator Console
                    </Badge>
                    <h1 className="section-title">Creator Dashboard</h1>
                    <p className="section-subtitle">
                        {account?.address
                            ? truncateAddress(account.address.toString(), 6)
                            : ""}
                    </p>
                </div>
                <Link href="/create" className={buttonVariants()}>
                    <Plus className="h-4 w-4" />
                    New Prompt
                </Link>
            </div>

            {error && (
                <Alert className="mb-6 p-5">
                    <AlertTitle>Dashboard data is temporarily unavailable</AlertTitle>
                    <AlertDescription className="mb-4">{error}</AlertDescription>
                    <Button onClick={refresh} size="sm" variant="outline">
                        Retry
                    </Button>
                </Alert>
            )}

            {expiringSoon.length > 0 && (
                <Alert className="mb-6 border-accent-red/70 bg-accent-red/10 p-5">
                    <AlertTitle>
                        {expiringSoon.length} listing
                        {expiringSoon.length === 1 ? "" : "s"} run out of Shelby storage soon
                    </AlertTitle>
                    <AlertDescription>
                        Buyers hold perpetual access, but content stops being readable once
                        its storage window closes. Extend it below before that happens.
                    </AlertDescription>
                </Alert>
            )}

            {extendError && (
                <Alert className="mb-6 p-5">
                    <AlertTitle>Could not extend storage</AlertTitle>
                    <AlertDescription>{extendError}</AlertDescription>
                </Alert>
            )}

            {/* Stats Grid */}
            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                    {
                        label: "Total Revenue",
                        value: loading ? "..." : formatApt(totalRevenue),
                        color: "text-accent-green",
                    },
                    {
                        label: "Total Unlocks",
                        value: loading ? "..." : totalUnlocks.toString(),
                        color: "text-retro-cyan",
                    },
                    {
                        label: "Active Prompts",
                        value: loading ? "..." : activePrompts.toString(),
                        color: "text-retro-yellow",
                    },
                    {
                        label: "All Prompts",
                        value: loading ? "..." : prompts.length.toString(),
                        color: "text-cream/70",
                    },
                ].map((stat, i) => (
                    <div key={stat.label} className="animate-slide-up">
                        <Card className="h-full p-5 holographic-hover">
                            <div className={`text-3xl font-black ${stat.color}`}>
                                {stat.value}
                            </div>
                            <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-cream/45">
                                {stat.label}
                            </div>
                        </Card>
                    </div>
                ))}
            </div>

            {/* Prompt List */}
            <Card className="overflow-hidden">
                <div className="border-b-2 border-ink bg-retro-yellow px-6 py-4 text-ink">
                    <h2 className="text-sm font-black uppercase tracking-wide">Your Prompts</h2>
                </div>

                {loading ? (
                    <div className="p-6 space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div
                                key={i}
                                className="skeleton h-12 w-full"
                            />
                        ))}
                    </div>
                ) : prompts.length === 0 ? (
                    <div className="p-12 text-center">
                        <p className="mb-5 font-semibold text-cream/50">
                            You haven't created any prompts yet.
                        </p>
                        <Link href="/create" className={buttonVariants()}>
                            Create Your First Prompt
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y divide-cream/10 animate-fade-in">
                        {prompts.map((prompt) => {
                            const storage = statuses[prompt.promptId];
                            const days = storage?.daysRemaining;
                            const expiring =
                                typeof days === "number" && days <= STORAGE_WARNING_DAYS;

                            return (
                                <div key={prompt.promptId}>
                                    <Link
                                        href={`/prompt/${prompt.promptId}`}
                                        className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-cream/[0.06]"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="truncate text-sm font-black text-cream">
                                                    {prompt.title}
                                                </h3>
                                                <Badge
                                                    variant={prompt.status === "active" ? "success" : "outline"}
                                                    className="text-[10px]"
                                                >
                                                    {prompt.status}
                                                </Badge>
                                            </div>
                                            <div className="mt-1 text-xs font-semibold text-cream/40">
                                                {prompt.category} • {prompt.pricingModel.replace(/-/g, " ")}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-4">
                                            <div className="text-sm font-black text-accent-green">
                                                {formatApt(prompt.totalRevenue)}
                                            </div>
                                            <div className="text-xs font-semibold text-cream/35">
                                                {prompt.totalUnlocks} unlocks
                                            </div>
                                        </div>
                                    </Link>

                                    {/* Shelby storage lifetime. Access is sold as
                                        perpetual, so this date is the real limit. */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-4">
                                        <div
                                            className={`flex items-center gap-2 text-xs font-semibold ${
                                                expiring ? "text-accent-red" : "text-cream/40"
                                            }`}
                                        >
                                            {expiring ? (
                                                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                                            ) : (
                                                <HardDrive className="h-3.5 w-3.5 shrink-0" />
                                            )}
                                            {storage?.ok && typeof days === "number" ? (
                                                <span>
                                                    Shelby storage paid for {days} more day
                                                    {days === 1 ? "" : "s"}
                                                    {storage.sizeBytes
                                                        ? ` • ${storage.sizeBytes} B`
                                                        : ""}
                                                    {storage.isWritten === false
                                                        ? " • upload not finalized"
                                                        : ""}
                                                </span>
                                            ) : storage && !storage.ok ? (
                                                <span>{storage.error}</span>
                                            ) : (
                                                <span className="text-cream/25">
                                                    Reading storage status...
                                                </span>
                                            )}
                                        </div>

                                        {storage?.ok && (
                                            <Button
                                                onClick={() => extendStorage(prompt.promptId)}
                                                disabled={extendingId === prompt.promptId}
                                                size="sm"
                                                variant={expiring ? "default" : "outline"}
                                            >
                                                {extendingId === prompt.promptId
                                                    ? "Extending..."
                                                    : "Extend 1 year"}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}
