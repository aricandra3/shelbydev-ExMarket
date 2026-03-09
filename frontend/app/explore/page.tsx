/// Explore Page — Browse all prompts with category filtering

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePromptRegistry } from "@/hooks/usePromptRegistry";
import { PROMPT_CATEGORIES } from "@/types";
import { formatApt } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function ExplorePage() {
    const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
        undefined
    );
    const { prompts, loading, error } = usePromptRegistry(selectedCategory);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            {/* Header */}
            <div className="mb-8">
                <h1 className="section-title">Explore Prompts</h1>
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
                            ? "bg-brand-500/15 text-brand-400 border border-brand-500/30"
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
                                ? "bg-brand-500/15 text-brand-400 border border-brand-500/30"
                                : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                        )}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Loading */}
            {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="glass-card p-6">
                            <div className="skeleton h-5 w-3/4 mb-3" />
                            <div className="skeleton h-4 w-full mb-2" />
                            <div className="skeleton h-4 w-2/3 mb-4" />
                            <div className="skeleton h-8 w-24" />
                        </div>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="glass-card p-8 text-center">
                    <p className="text-accent-red text-sm">{error}</p>
                </div>
            )}

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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {prompts.map((prompt) => (
                                <Link
                                    key={prompt.promptId}
                                    href={`/prompt/${prompt.promptId}`}
                                    className="glass-card-hover p-6 block"
                                >
                                    {/* Category badge */}
                                    <div className="badge-brand mb-3">{prompt.category}</div>

                                    {/* Title */}
                                    <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">
                                        {prompt.title}
                                    </h3>

                                    {/* Description */}
                                    <p className="text-sm text-white/40 mb-4 line-clamp-2">
                                        {prompt.description}
                                    </p>

                                    {/* Bottom row */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-brand-400">
                                            {formatApt(prompt.price)}
                                        </span>
                                        <span className="text-xs text-white/30">
                                            {prompt.totalUnlocks} unlocks
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
