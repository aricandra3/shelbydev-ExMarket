/// Creator Dashboard — Revenue stats and prompt management

"use client";

import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useCreatorDashboard } from "@/hooks/useCreatorDashboard";
import { formatApt } from "@/lib/constants";
import { truncateAddress } from "@/lib/utils";
import { motion } from "framer-motion";

export default function DashboardPage() {
    const { account, connected } = useWallet();
    const { prompts, totalRevenue, loading } = useCreatorDashboard();

    if (!connected) {
        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="glass-card p-12 text-center">
                    <p className="text-white/40">
                        Connect your wallet to access your creator dashboard.
                    </p>
                </div>
            </div>
        );
    }

    const totalUnlocks = prompts.reduce((sum, p) => sum + p.totalUnlocks, 0);
    const activePrompts = prompts.filter((p) => p.status === "active").length;

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="section-title">Creator Dashboard</h1>
                    <p className="section-subtitle">
                        {account?.address
                            ? truncateAddress(account.address.toString(), 6)
                            : ""}
                    </p>
                </div>
                <Link href="/create" className="btn-primary">
                    + New Prompt
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
                        color: "text-primary-400",
                    },
                    {
                        label: "Active Prompts",
                        value: loading ? "..." : activePrompts.toString(),
                        color: "text-white",
                    },
                    {
                        label: "All Prompts",
                        value: loading ? "..." : prompts.length.toString(),
                        color: "text-white/60",
                    },
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.1 }}
                        className="glass-card p-5 holographic-hover"
                    >
                        <div className={`text-2xl font-bold ${stat.color}`}>
                            {stat.value}
                        </div>
                        <div className="text-xs text-white/40 mt-1">{stat.label}</div>
                    </motion.div>
                ))}
            </motion.div>

            {/* Prompt List */}
            <div className="glass-card overflow-hidden">
                <div className="px-6 py-4 border-b border-white/[0.06]">
                    <h2 className="text-sm font-semibold text-white">Your Prompts</h2>
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
                        <p className="text-white/40 mb-4">
                            You haven't created any prompts yet.
                        </p>
                        <Link href="/create" className="btn-primary">
                            Create Your First Prompt
                        </Link>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="divide-y divide-white/[0.04]"
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
                                    className="flex items-center justify-between px-6 py-4
                               hover:bg-white/[0.02] transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-medium text-white truncate">
                                                {prompt.title}
                                            </h3>
                                            <span
                                                className={`badge text-[10px] ${prompt.status === "active"
                                                    ? "badge-green"
                                                    : "bg-white/[0.06] text-white/30"
                                                    }`}
                                            >
                                                {prompt.status}
                                            </span>
                                        </div>
                                        <div className="text-xs text-white/30 mt-0.5">
                                            {prompt.category} • {prompt.pricingModel.replace(/-/g, " ")}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0 ml-4">
                                        <div className="text-sm font-medium text-accent-green">
                                            {formatApt(prompt.totalRevenue)}
                                        </div>
                                        <div className="text-xs text-white/30">
                                            {prompt.totalUnlocks} unlocks
                                        </div>
                                    </div>
                                </Link>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
