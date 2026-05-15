/// Creator Dashboard — Revenue stats and prompt management

"use client";

import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useCreatorDashboard } from "@/hooks/useCreatorDashboard";
import { formatApt } from "@/lib/constants";
import { truncateAddress } from "@/lib/utils";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, WalletCards } from "lucide-react";

export default function DashboardPage() {
    const { account, connected } = useWallet();
    const { prompts, totalRevenue, loading } = useCreatorDashboard();

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

            {/* Stats Grid */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
            >
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
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.1 }}
                    >
                        <Card className="h-full p-5 holographic-hover">
                            <div className={`text-3xl font-black ${stat.color}`}>
                                {stat.value}
                            </div>
                            <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-cream/45">
                                {stat.label}
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </motion.div>

            {/* Prompt List */}
            <Card className="overflow-hidden">
                <div className="border-b-2 border-ink bg-retro-yellow px-6 py-4 text-ink">
                    <h2 className="text-sm font-black uppercase tracking-wide">Your Prompts</h2>
                </div>

                {loading ? (
                    <div className="p-6 space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.4, delay: i * 0.1 }}
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
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="divide-y divide-cream/10"
                    >
                        {prompts.map((prompt, i) => (
                            <motion.div
                                key={prompt.promptId}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.3, delay: i * 0.05 }}
                            >
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
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </Card>
        </div>
    );
}
