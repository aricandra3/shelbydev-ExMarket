/// Landing Page — ExMarket Hero

"use client";

import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";

// ── Animation ─────────────────────────────────────────────
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const stagger: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const rise: Variants = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

// ── Data ──────────────────────────────────────────────────
const STATS = [
    { value: "2,400+", label: "Prompts listed" },
    { value: "180+",   label: "Creators" },
    { value: "Aptos",  label: "Chain" },
];

const FEATURES = [
    {
        icon: (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="14" height="14" rx="2" />
                <path d="M7 10h6M10 7v6" />
            </svg>
        ),
        title: "Publish anything",
        body: "Midjourney styles, ChatGPT templates, agent workflows — if it's a prompt, ExMarket can list it.",
    },
    {
        icon: (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M10 2L3 7v6l7 5 7-5V7l-7-5z" />
                <path d="M10 2v15M3 7l7 5 7-5" />
            </svg>
        ),
        title: "On-chain ownership",
        body: "Every listing is stored via the Shelby protocol. Your content, your keys, your permanent record.",
    },
    {
        icon: (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="10" cy="10" r="7" />
                <path d="M10 6v4l3 2" />
            </svg>
        ),
        title: "Instant payouts",
        body: "Royalties settle in seconds, not days. No intermediary holds your revenue.",
    },
];

// ── Component ─────────────────────────────────────────────
export default function HomePage() {
    const { connected } = useWallet();

    return (
        <div className="flex flex-col">

            {/* ── Hero ──────────────────────────────────────────────── */}
            <section className="relative min-h-[92vh] flex flex-col items-center justify-center text-center px-6 overflow-hidden">

                {/* Dot grid — original brand texture */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-0 opacity-[0.18]"
                    style={{
                        backgroundImage:
                            "radial-gradient(circle, rgba(139,92,246,0.6) 1px, transparent 1px)",
                        backgroundSize: "32px 32px",
                        maskImage:
                            "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
                        WebkitMaskImage:
                            "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
                    }}
                />

                {/* Core glow */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full z-0"
                    style={{
                        background:
                            "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)",
                    }}
                />

                {/* Content */}
                <motion.div
                    className="relative z-10 flex flex-col items-center max-w-2xl mx-auto"
                    variants={stagger}
                    initial="hidden"
                    animate="show"
                >
                    {/* Pill badge */}
                    <motion.div variants={rise} className="mb-7">
                        <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[11px] font-medium tracking-wide text-primary-300 bg-primary-950/80 border border-primary-800/50 backdrop-blur-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
                            Shelby Protocol · Aptos Network
                        </span>
                    </motion.div>

                    {/* H1 */}
                    <motion.h1
                        variants={rise}
                        className="text-[2.75rem] sm:text-[3.5rem] lg:text-[4.25rem] font-bold leading-[1.08] tracking-tight text-white mb-5"
                    >
                        The marketplace for{" "}
                        <br className="hidden sm:block" />
                        <span className="text-gradient">AI prompt creators.</span>
                    </motion.h1>

                    {/* Sub */}
                    <motion.p
                        variants={rise}
                        className="text-base sm:text-lg text-white/40 max-w-md leading-relaxed mb-9"
                    >
                        Upload your work. Set a price. Earn every time someone buys. 
                        No platform fees holding you back.
                    </motion.p>

                    {/* CTAs */}
                    <motion.div
                        variants={rise}
                        className="flex items-center gap-3 flex-wrap justify-center mb-12"
                    >
                        <Link
                            href={connected ? "/create" : "/explore"}
                            className="btn-primary text-sm"
                        >
                            {connected ? "Upload a Prompt" : "Browse Marketplace"}
                        </Link>
                        {!connected && (
                            <Link
                                href="/create"
                                className="px-5 py-2.5 text-sm font-medium text-white/50 border border-white/[0.08] rounded-lg hover:text-white hover:border-white/20 transition-colors"
                            >
                                Sell your prompts →
                            </Link>
                        )}
                    </motion.div>

                    {/* Stats row */}
                    <motion.div
                        variants={rise}
                        className="flex items-center gap-8 sm:gap-12 flex-wrap justify-center"
                    >
                        {STATS.map((s) => (
                            <div key={s.label} className="flex flex-col items-center gap-0.5">
                                <span className="text-lg font-bold text-white tabular-nums">{s.value}</span>
                                <span className="text-[11px] text-white/30 uppercase tracking-widest">{s.label}</span>
                            </div>
                        ))}
                    </motion.div>
                </motion.div>

                {/* Bottom fade to section */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 z-10"
                    style={{
                        background: "linear-gradient(to bottom, transparent, #09090b)",
                    }}
                />
            </section>

            {/* ── Features ──────────────────────────────────────────── */}
            <section className="relative py-20 px-6">
                {/* Branded rule */}
                <div className="max-w-4xl mx-auto mb-16 flex items-center gap-4">
                    <div className="flex-1 h-px bg-white/5" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/20">
                        How it works
                    </span>
                    <div className="flex-1 h-px bg-white/5" />
                </div>

                <motion.div
                    className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden"
                    variants={stagger}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: "-60px" }}
                >
                    {FEATURES.map((f, i) => (
                        <motion.div
                            key={i}
                            variants={rise}
                            className="flex flex-col gap-4 p-8 bg-surface-1 hover:bg-surface-2 transition-colors group"
                        >
                            <div className="w-9 h-9 rounded-lg bg-primary-950 border border-primary-900/60 flex items-center justify-center text-primary-400 group-hover:text-primary-300 group-hover:border-primary-800 transition-colors">
                                {f.icon}
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-white mb-1.5">{f.title}</h3>
                                <p className="text-sm text-white/35 leading-relaxed">{f.body}</p>
                            </div>
                            <span className="text-[10px] font-mono text-white/20 mt-auto">
                                0{i + 1}
                            </span>
                        </motion.div>
                    ))}
                </motion.div>
            </section>

        </div>
    );
}
