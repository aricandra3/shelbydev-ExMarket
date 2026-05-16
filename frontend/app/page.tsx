/// Landing Page — ExMarket Hero

"use client";

import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import { ArrowRight, Coins, Cuboid, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ── Animation ─────────────────────────────────────────────
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const getStagger = (reduceMotion: boolean): Variants => ({
    hidden: {},
    show: reduceMotion
        ? {}
        : { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
});

const getRise = (reduceMotion: boolean): Variants => ({
    hidden: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 },
    show: {
        opacity: 1,
        y: 0,
        transition: reduceMotion ? { duration: 0 } : { duration: 0.65, ease: EASE },
    },
});

// ── Data ──────────────────────────────────────────────────
const STATS = [
    { value: "2,400+", label: "Prompts listed" },
    { value: "180+", label: "Creators" },
    { value: "Aptos", label: "Chain" },
];

const FEATURES = [
    {
        icon: UploadCloud,
        title: "Publish anything",
        body: "Midjourney styles, ChatGPT templates, and agent workflows can live in one on-chain shelf.",
    },
    {
        icon: ShieldCheck,
        title: "On-chain ownership",
        body: "Listings keep a permanent record through Shelby and Aptos without hiding the creator trail.",
    },
    {
        icon: Coins,
        title: "Instant payouts",
        body: "Royalties settle in seconds, not days. No intermediary holds your revenue.",
    },
];

// ── Component ─────────────────────────────────────────────
export default function HomePage() {
    const { connected } = useWallet();
    const shouldReduceMotion = Boolean(useReducedMotion());
    const stagger = getStagger(shouldReduceMotion);
    const rise = getRise(shouldReduceMotion);

    return (
        <div className="flex flex-col">

            <section className="relative overflow-hidden px-4 pb-14 pt-8 md:px-6 md:pb-20 md:pt-10">
                <div aria-hidden className="absolute inset-x-0 top-16 h-14 -rotate-2 border-y-2 border-ink/85 bg-retro-coral/30" />
                <div aria-hidden className="absolute bottom-12 left-0 h-12 w-2/5 rotate-2 border-y-2 border-r-2 border-ink/85 bg-retro-cyan/25" />
                <div aria-hidden className="halftone absolute right-4 top-32 hidden h-36 w-36 opacity-25 md:block" />

                <motion.div
                    className="relative z-10 mx-auto grid min-h-[70vh] max-w-7xl items-center gap-10 lg:grid-cols-2"
                    variants={stagger}
                    initial="hidden"
                    animate="show"
                >
                    <div>
                        <motion.div variants={rise} className="mb-6">
                            <Badge variant="warning" className="shadow-neo-sm">
                                <Sparkles className="h-3.5 w-3.5" />
                                Shelby Protocol / Aptos
                            </Badge>
                        </motion.div>

                        <motion.h1
                            variants={rise}
                            className="mb-5 max-w-3xl font-display text-[3.1rem] font-black leading-[0.92] text-cream sm:text-[4.25rem] lg:text-[5rem]"
                            style={{ textShadow: "5px 5px 0 #111111" }}
                        >
                            ExMarket{" "}
                            <span className="block text-retro-yellow">Prompt Marketplace</span>
                        </motion.h1>

                        <motion.p
                            variants={rise}
                            className="mb-6 max-w-xl text-base font-semibold leading-relaxed text-cream/70 sm:text-lg"
                        >
                            A retro-frosted marketplace for premium AI prompts, creator workflows,
                            and unlockable knowledge on-chain.
                        </motion.p>

                        <motion.div
                            variants={rise}
                            className="mb-10 flex flex-wrap items-center gap-3"
                        >
                            <Link
                                href={connected ? "/create" : "/explore"}
                                className={buttonVariants({ size: "lg" })}
                            >
                                {connected ? "Upload Prompt" : "Browse Market"}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            {!connected && (
                                <Link
                                    href="/create"
                                    className={buttonVariants({ variant: "outline", size: "lg" })}
                                >
                                    Sell Prompts
                                </Link>
                            )}
                        </motion.div>

                        <motion.div
                            variants={rise}
                            className="grid max-w-2xl grid-cols-3 overflow-hidden rounded-[8px] border-2 border-ink bg-cream/[0.08] shadow-neo backdrop-blur-xl"
                        >
                            {STATS.map((s, index) => (
                                <div key={s.label} className="p-4">
                                    <span className="block text-2xl font-black text-retro-yellow tabular-nums">
                                        {s.value}
                                    </span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-cream/50">
                                        {s.label}
                                    </span>
                                    {index < STATS.length - 1 && (
                                        <Separator orientation="vertical" className="absolute hidden" />
                                    )}
                                </div>
                            ))}
                        </motion.div>
                    </div>

                    <motion.div
                        variants={rise}
                        className="absolute right-3 top-24 hidden w-[min(36vw,28rem)] lg:block xl:right-10 xl:top-28"
                    >
                        <Card className="mx-auto w-full max-w-md rotate-2 bg-cream/[0.1] p-0 transition-transform duration-200 hover:rotate-0">
                            <CardHeader className="border-b-2 border-ink bg-retro-mint/90 text-ink">
                                <div className="flex items-center justify-between gap-4">
                                    <Badge variant="outline" className="border-ink bg-cream text-ink">
                                        Featured
                                    </Badge>
                                    <Cuboid className="h-6 w-6" />
                                </div>
                                <CardTitle className="text-ink">
                                    Agent Workflow Pack
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-5 p-6">
                                <div className="rounded-[7px] border-2 border-ink bg-surface-0/55 p-4 font-mono text-xs leading-relaxed text-cream/75 backdrop-blur-xl">
                                    system: sellable prompt bundle
                                    <br />
                                    chain: aptos
                                    <br />
                                    access: buyer verified
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-[7px] border-2 border-ink bg-retro-yellow p-4 text-ink shadow-neo-sm">
                                        <p className="text-[10px] font-black uppercase tracking-widest">Price</p>
                                        <p className="text-2xl font-black">0.8 APT</p>
                                    </div>
                                    <div className="rounded-[7px] border-2 border-ink bg-retro-coral p-4 text-ink shadow-neo-sm">
                                        <p className="text-[10px] font-black uppercase tracking-widest">Unlocks</p>
                                        <p className="text-2xl font-black">312</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </motion.div>
            </section>

            <section className="relative px-4 pb-24 md:px-6">
                <div className="mx-auto mb-12 flex max-w-6xl items-center gap-4">
                    <Separator className="bg-cream/20" />
                    <span className="shrink-0 rounded-[5px] border-2 border-ink bg-retro-coral px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-ink shadow-neo-sm">
                        How it works
                    </span>
                    <Separator className="bg-cream/20" />
                </div>

                <motion.div
                    className="mx-auto grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-3"
                    variants={stagger}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: "-60px" }}
                >
                    {FEATURES.map((f, i) => (
                        <motion.div
                            key={i}
                            variants={rise}
                        >
                            <Card className="group h-full transition-transform duration-200 hover:-translate-x-1 hover:-translate-y-1">
                                <CardContent className="flex h-full flex-col gap-5 p-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-[7px] border-2 border-ink bg-retro-yellow text-ink shadow-neo-sm transition-transform group-hover:rotate-3">
                                            <f.icon className="h-6 w-6" />
                                        </div>
                                        <span className="font-mono text-xs font-black text-cream/35">
                                            0{i + 1}
                                        </span>
                                    </div>
                                    <div>
                                        <h3 className="mb-2 font-display text-xl font-black text-cream">
                                            {f.title}
                                        </h3>
                                        <p className="text-sm font-semibold leading-relaxed text-cream/55">
                                            {f.body}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </motion.div>
            </section>

        </div>
    );
}
