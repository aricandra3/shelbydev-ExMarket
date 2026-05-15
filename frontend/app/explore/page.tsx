/// Explore Page — Browse all prompts with category filtering

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePromptRegistry } from "@/hooks/usePromptRegistry";
import { PROMPT_CATEGORIES } from "@/types";
import { formatApt } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Search } from "lucide-react";

export default function ExplorePage() {
    const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
        undefined
    );
    const { prompts, loading, error } = usePromptRegistry(selectedCategory);

    return (
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-8">
                <Badge variant="warning" className="mb-4 shadow-neo-sm">
                    <Search className="h-3.5 w-3.5" />
                    Marketplace
                </Badge>
                <h1 className="section-title">
                    Explore Prompts
                </h1>
                <p className="section-subtitle">
                    Discover premium AI prompts from top creators
                </p>
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2 mb-8">
                <button
                    onClick={() => setSelectedCategory(undefined)}
                    className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        !selectedCategory
                            ? "border-2 border-ink bg-retro-yellow text-ink shadow-neo-sm"
                            : "border-2 border-transparent bg-cream/[0.04] text-cream/45 hover:border-cream/50 hover:text-cream"
                    )}
                >
                    All
                </button>
                {PROMPT_CATEGORIES.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        selectedCategory === cat
                            ? "border-2 border-ink bg-retro-cyan text-ink shadow-neo-sm"
                            : "border-2 border-transparent bg-cream/[0.04] text-cream/45 hover:border-cream/50 hover:text-cream"
                    )}
                >
                    {cat}
                    </button>
                ))}
            </div>

            {/* Loading / Error */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <motion.div
                            key={`skeleton-${i}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1, duration: 0.5 }}
                        >
                            <Card className="flex h-[250px] animate-pulse flex-col justify-between p-6">
                                <div className="flex items-start justify-between">
                                    <div className="skeleton h-6 w-20"></div>
                                    <div className="skeleton h-6 w-16"></div>
                                </div>
                                <div className="mt-4 space-y-3">
                                    <div className="skeleton h-6 w-11/12"></div>
                                    <div className="skeleton h-4 w-full"></div>
                                    <div className="skeleton h-4 w-4/5"></div>
                                </div>
                                <div className="mt-auto flex items-center justify-between border-t border-cream/10 pt-6">
                                    <div className="skeleton h-4 w-24"></div>
                                </div>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            ) : error ? (
                <Card className="p-8 text-center">
                    <p className="text-sm font-semibold text-accent-red">{error}</p>
                </Card>
            ) : null}

            {/* Prompt Grid */}
            {!loading && !error && (
                <>
                    {prompts.length === 0 ? (
                        <Card className="p-12 text-center">
                            <p className="text-sm font-semibold text-cream/50">
                                No prompts found. Be the first to create one!
                            </p>
                            <Link href="/create" className={buttonVariants({ className: "mt-5" })}>
                                Create Prompt
                            </Link>
                        </Card>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                            {prompts.map((prompt, i) => (
                                <motion.div
                                    key={prompt.promptId}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4, delay: i * 0.05 }}
                                >
                                    <Link
                                        href={`/prompt/${prompt.promptId}`}
                                        className="glass-card-hover holographic-hover flex h-full flex-col p-6"
                                    >
                                        <div className="flex-1">
                                            {/* Category badge */}
                                            <Badge className="mb-3">{prompt.category}</Badge>

                                            {/* Title */}
                                            <h3 className="mb-2 font-display text-xl font-black text-cream line-clamp-2">
                                                {prompt.title}
                                            </h3>

                                            {/* Description */}
                                            <p className="mb-4 text-sm font-semibold leading-relaxed text-cream/55 line-clamp-2">
                                                {prompt.description}
                                            </p>
                                        </div>

                                        {/* Bottom row */}
                                        <div className="mt-auto flex items-center justify-between border-t border-cream/10 pt-4">
                                            <span className="text-sm font-black text-retro-yellow">
                                                {formatApt(prompt.price)}
                                            </span>
                                            <span className="inline-flex items-center gap-1 rounded-[5px] border border-cream/20 bg-cream/[0.08] px-2 py-1 text-xs font-black uppercase text-cream/45">
                                                {prompt.totalUnlocks} unlocks
                                                <ArrowRight className="h-3 w-3" />
                                            </span>
                                        </div>
                                    </Link>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </>
            )}
        </div>
    );
}
