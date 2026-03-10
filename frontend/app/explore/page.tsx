/// Explore Page — Browse all prompts with category filtering

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePromptRegistry } from "@/hooks/usePromptRegistry";
import { PROMPT_CATEGORIES } from "@/types";
import { formatApt } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function ExplorePage() {
    const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
        undefined
    );
    const { prompts, loading, error } = usePromptRegistry(selectedCategory);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-4xl md:text-5xl font-display font-extrabold tracking-tight text-white mb-4">
                    Explore Prompts
                </h1>
                <p className="text-lg text-white/50">
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
                            ? "bg-primary-500/15 text-primary-400 border border-primary-500/30"
                            : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
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
                                ? "bg-primary-500/15 text-primary-400 border border-primary-500/30"
                                : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
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
                            className="glass-card p-6 h-[250px] flex flex-col justify-between animate-pulse"
                        >
                            <div className="flex justify-between items-start">
                                <div className="h-6 w-20 bg-surface-3 rounded-md"></div>
                                <div className="h-6 w-16 bg-surface-3 rounded-md"></div>
                            </div>
                            <div className="space-y-3 mt-4">
                                <div className="h-6 w-11/12 bg-surface-3 rounded-md"></div>
                                <div className="h-4 w-full bg-surface-3 rounded-md"></div>
                                <div className="h-4 w-4/5 bg-surface-3 rounded-md"></div>
                            </div>
                            <div className="mt-auto pt-6 flex justify-between items-center border-t border-white/[0.04]">
                                <div className="h-4 w-24 bg-surface-3 rounded-md"></div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            ) : error ? (
                <div className="glass-card p-8 text-center">
                    <p className="text-accent-red text-sm">{error}</p>
                </div>
            ) : null}

            {/* Prompt Grid */}
            {!loading && !error && (
                <>
                    {prompts.length === 0 ? (
                        <div className="glass-card p-12 text-center">
                            <p className="text-white/40 text-sm">
                                No prompts found. Be the first to create one!
                            </p>
                            <Link href="/create" className="btn-primary mt-4 inline-block">
                                Create Prompt
                            </Link>
                        </div>
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
                                        className="glass-card-hover holographic-hover p-6 block h-full flex flex-col"
                                    >
                                        <div className="flex-1">
                                            {/* Category badge */}
                                            <div className="badge-primary mb-3">{prompt.category}</div>

                                            {/* Title */}
                                            <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">
                                                {prompt.title}
                                            </h3>

                                            {/* Description */}
                                            <p className="text-sm text-white/40 mb-4 line-clamp-2">
                                                {prompt.description}
                                            </p>
                                        </div>

                                        {/* Bottom row */}
                                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/[0.04]">
                                            <span className="text-sm font-bold text-primary-400">
                                                {formatApt(prompt.price)}
                                            </span>
                                            <span className="text-xs font-medium text-white/30 bg-surface-3 px-2 py-1 rounded-md">
                                                {prompt.totalUnlocks} unlocks
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
