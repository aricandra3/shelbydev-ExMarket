/// Landing Page — Hero + Features + How It Works

"use client";

import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { motion } from "framer-motion";

export default function HomePage() {
    const { connected } = useWallet();

    return (
        <div className="relative overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 bg-hero-glow pointer-events-none" />

            {/* Hero Section */}
            <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="text-center"
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                          bg-primary-500/10 border border-primary-500/20 mb-8">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse-glow" />
                        <span className="text-xs font-medium text-primary-400">
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
                </motion.div>

                {/* Bento Box Stats Section */}
            </section>
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {/* Big Feature Component */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="glass-card p-8 md:col-span-2 lg:col-span-2 row-span-2 flex flex-col justify-between group"
                    >
                        <div>
                            <div className="badge-primary mb-4">Volume</div>
                            <h3 className="text-3xl font-display font-bold text-white mb-2">$42,500+</h3>
                            <p className="text-white/50 text-sm">Creator Revenue Paid</p>
                        </div>
                        <div className="h-32 mt-6 rounded-xl bg-gradient-to-t from-primary-500/10 to-transparent border-b-2 border-primary-500/30 flex items-end">
                            {/* Abstract chart simulation */}
                            <div className="w-full flex items-end gap-2 px-4 h-full opacity-60 group-hover:opacity-100 transition-opacity">
                                {[40, 60, 30, 80, 50, 90, 70, 100].map((h, i) => (
                                    <div key={i} className="flex-1 bg-primary-500/40 rounded-t-sm" style={{ height: `${h}%` }}></div>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    {/* Smaller Stat 1 */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="glass-card-hover p-8 md:col-span-1 lg:col-span-2 flex flex-col justify-center"
                    >
                        <h3 className="text-4xl font-display font-black text-white mb-2">10k+</h3>
                        <p className="text-white/50">Active Users</p>
                    </motion.div>

                    {/* Smaller Stat 2 */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="glass-card p-6 md:col-span-1 lg:col-span-1"
                    >
                        <div className="w-10 h-10 rounded-full bg-surface-3 flex items-center justify-center mb-4 border border-white/[0.05]">
                            ⚡️
                        </div>
                        <h3 className="text-2xl font-display font-bold text-white mb-1">50ms</h3>
                        <p className="text-white/50 text-xs">Unlock Speed</p>
                    </motion.div>

                    {/* Smaller Stat 3 */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        className="glass-card p-6 md:col-span-1 lg:col-span-1 border-primary-500/20 bg-primary-500/5 group"
                    >
                        <h3 className="text-2xl font-display font-bold text-primary-400 mb-1 line-clamp-1">100%</h3>
                        <p className="text-white/50 text-xs">Decentralized</p>
                    </motion.div>
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
                    ].map((item, index) => (
                        <motion.div
                            key={item.step}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.5, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
                            whileHover={{ y: -10 }}
                            className="glass-card p-8 group"
                        >
                            <div className="text-4xl mb-4">{item.icon}</div>
                            <div className="text-xs font-mono text-primary-400 mb-2">
                                STEP {item.step}
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">
                                {item.title}
                            </h3>
                            <p className="text-sm text-white/40 leading-relaxed">
                                {item.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* For Creators */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="glass-card p-12 text-center glow-primary"
                >
                    <h2 className="text-3xl font-bold text-white mb-4">
                        Built for Creators
                    </h2>
                    <p className="text-white/50 max-w-xl mx-auto mb-8">
                        Upload your best prompts. Set your price. Earn 90% of every sale.
                        No middlemen. No platform lock-in. Your content lives on
                        decentralized storage forever.
                    </p>
                    <Link href="/create" className="btn-primary text-base px-8 py-4 inline-block">
                        Start Selling Prompts →
                    </Link>
                </motion.div>
            </section>
        </div>
    );
}
