/// Landing Page — Hero + Features + How It Works

"use client";

import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

export default function HomePage() {
    const { connected } = useWallet();

    return (
        <div className="relative overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 bg-hero-glow pointer-events-none" />

            {/* Hero Section */}
            <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
                <div className="text-center animate-fade-in">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full
                          bg-brand-500/10 border border-brand-500/20 mb-8">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-glow" />
                        <span className="text-xs font-medium text-brand-400">
                            Powered by Aptos + Shelby Protocol
                        </span>
                    </div>

                    <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight">
                        <span className="text-white">The AI Prompt</span>
                        <br />
                        <span className="text-gradient">Marketplace</span>
                    </h1>

                    <p className="mt-6 max-w-2xl mx-auto text-lg text-white/50 leading-relaxed">
                        Buy, sell, and access premium AI prompts, agent workflows, and
                        automation templates. Pay-per-use. Fully decentralized.
                        Creator-first.
                    </p>

                    <div className="mt-10 flex items-center justify-center gap-4">
                        <Link href="/explore" className="btn-primary text-base px-8 py-4">
                            Explore Prompts
                        </Link>
                        {connected && (
                            <Link href="/create" className="btn-secondary text-base px-8 py-4">
                                Start Creating
                            </Link>
                        )}
                    </div>
                </div>

                {/* Stats */}
                <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-4 animate-slide-up">
                    {[
                        { label: "Prompts Listed", value: "—" },
                        { label: "Creators", value: "—" },
                        { label: "Total Unlocks", value: "—" },
                        { label: "Revenue Paid", value: "—" },
                    ].map((stat) => (
                        <div key={stat.label} className="glass-card p-6 text-center">
                            <div className="text-2xl font-bold text-white">{stat.value}</div>
                            <div className="text-xs text-white/40 mt-1">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* How It Works */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <h2 className="section-title text-center">How It Works</h2>
                <p className="section-subtitle text-center">
                    Three steps to unlock premium AI prompts
                </p>

                <div className="mt-12 grid md:grid-cols-3 gap-6">
                    {[
                        {
                            step: "01",
                            title: "Connect Wallet",
                            desc: "Connect your Aptos wallet to browse and purchase prompts.",
                            icon: "🔗",
                        },
                        {
                            step: "02",
                            title: "Unlock Prompt",
                            desc: "Pay with APT to unlock. 90% goes directly to the creator.",
                            icon: "🔓",
                        },
                        {
                            step: "03",
                            title: "Use Instantly",
                            desc: "Access your prompt immediately. Use via UI or API.",
                            icon: "⚡",
                        },
                    ].map((item) => (
                        <div key={item.step} className="glass-card p-8 group">
                            <div className="text-4xl mb-4">{item.icon}</div>
                            <div className="text-xs font-mono text-brand-400 mb-2">
                                STEP {item.step}
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">
                                {item.title}
                            </h3>
                            <p className="text-sm text-white/40 leading-relaxed">
                                {item.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* For Creators */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <div className="glass-card p-12 text-center glow-brand">
                    <h2 className="text-3xl font-bold text-white mb-4">
                        Built for Creators
                    </h2>
                    <p className="text-white/50 max-w-xl mx-auto mb-8">
                        Upload your best prompts. Set your price. Earn 90% of every sale.
                        No middlemen. No platform lock-in. Your content lives on
                        decentralized storage forever.
                    </p>
                    <Link href="/create" className="btn-primary text-base px-8 py-4">
                        Start Selling Prompts →
                    </Link>
                </div>
            </section>
        </div>
    );
}
