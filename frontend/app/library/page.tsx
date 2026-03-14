/// Library Page — Glassmorphism Masonry View

"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { getUserUnlockedPrompts, getPromptMetadata } from "@/lib/contracts";
import { formatApt } from "@/lib/constants";
import type { PromptMetadata } from "@/types";

// ── Category → accent colour map ─────────────────────────────────────
const CATEGORY_COLORS: Record<string, { pill: string; glow: string; icon: string }> = {
  ChatGPT:          { pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",   glow: "rgba(16,185,129,0.12)", icon: "💬" },
  Midjourney:       { pill: "bg-pink-500/15 text-pink-300 border-pink-500/30",            glow: "rgba(236,72,153,0.12)", icon: "🎨" },
  "Stable Diffusion":{ pill: "bg-orange-500/15 text-orange-300 border-orange-500/30",    glow: "rgba(249,115,22,0.12)", icon: "🖼️" },
  Claude:           { pill: "bg-amber-500/15 text-amber-300 border-amber-500/30",         glow: "rgba(245,158,11,0.12)", icon: "⚡" },
  Gemini:           { pill: "bg-blue-500/15 text-blue-300 border-blue-500/30",            glow: "rgba(59,130,246,0.12)", icon: "✨" },
  "Agent Workflow": { pill: "bg-violet-500/15 text-violet-300 border-violet-500/30",      glow: "rgba(139,92,246,0.12)", icon: "🤖" },
  Automation:       { pill: "bg-sky-500/15 text-sky-300 border-sky-500/30",               glow: "rgba(14,165,233,0.12)", icon: "⚙️" },
  "Code Generation":{ pill: "bg-green-500/15 text-green-300 border-green-500/30",         glow: "rgba(34,197,94,0.12)",  icon: "🧑‍💻" },
  Writing:          { pill: "bg-rose-500/15 text-rose-300 border-rose-500/30",            glow: "rgba(244,63,94,0.12)",  icon: "✍️" },
  Marketing:        { pill: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",   glow: "rgba(217,70,239,0.12)", icon: "📢" },
  SEO:              { pill: "bg-lime-500/15 text-lime-300 border-lime-500/30",             glow: "rgba(132,204,22,0.12)", icon: "🔍" },
  "Data Analysis":  { pill: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",            glow: "rgba(6,182,212,0.12)",  icon: "📊" },
  Other:            { pill: "bg-white/10 text-white/50 border-white/10",                  glow: "rgba(255,255,255,0.06)", icon: "📁" },
};

function getAccent(category: string) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Other"];
}

// ── Masonry card heights — vary per card for visual rhythm ────────────
const CARD_SIZE_CLASSES = ["", "md:row-span-1", ""];

// ── Single prompt card ────────────────────────────────────────────────
function PromptCard({ prompt, index }: { prompt: PromptMetadata; index: number }) {
  const accent = getAccent(prompt.category);
  const isLarge = index % 5 === 1 || index % 5 === 4; // roughly every 2nd/5th card is taller

  return (
    <Link
      href={`/prompt/${prompt.promptId}`}
      className={`group relative rounded-2xl overflow-hidden transition-all duration-500 ease-out flex flex-col
        ${isLarge ? "md:row-span-2" : ""}
        hover:-translate-y-1`}
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.06),
          0 8px 32px 0 rgba(0,0,0,0.5),
          0 0 0 1px rgba(0,0,0,0.15)`,
      }}
    >
      {/* Hover coloured glow layer */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${accent.glow} 0%, transparent 70%)`,
        }}
      />

      {/* Top shimmer line */}
      <div
        className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${accent.glow.replace("0.12", "0.6")} 50%, transparent 100%)`,
        }}
      />

      {/* Frosted inner gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />

      {/* Card content */}
      <div className="relative z-10 p-5 flex flex-col h-full gap-3">

        {/* Header row — icon + category badge */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-2xl leading-none select-none">{accent.icon}</span>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[9px] font-mono uppercase tracking-widest border ${accent.pill}`}>
            {prompt.category}
          </span>
        </div>

        {/* Title */}
        <h3 className={`font-semibold text-white leading-tight group-hover:text-white transition-colors duration-300
          ${isLarge ? "text-lg" : "text-base"} line-clamp-3`}>
          {prompt.title}
        </h3>

        {/* Description — only shown on large cards */}
        {isLarge && (
          <p className="text-sm text-white/40 leading-relaxed line-clamp-3 flex-grow">
            {prompt.description}
          </p>
        )}

        {/* Tags */}
        {prompt.tags && prompt.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto">
            {prompt.tags.slice(0, isLarge ? 4 : 2).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded text-[9px] font-mono text-white/30 border border-white/[0.06] bg-white/[0.03]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer — price strip + unlock badge */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
          <span className="text-xs text-white/30 font-mono">
            {formatApt(prompt.price)} APT
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-mono uppercase tracking-widest border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Unlocked
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────
function SkeletonCard({ isLarge }: { isLarge: boolean }) {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${isLarge ? "md:row-span-2" : ""} p-5 space-y-3 animate-pulse`}
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div className="flex items-start justify-between">
        <div className="w-8 h-8 rounded-lg bg-white/[0.05]" />
        <div className="h-5 w-20 rounded-md bg-white/[0.05]" />
      </div>
      <div className="h-5 w-3/4 rounded-lg bg-white/[0.06]" />
      {isLarge && (
        <>
          <div className="h-4 w-full rounded-lg bg-white/[0.04]" />
          <div className="h-4 w-5/6 rounded-lg bg-white/[0.04]" />
        </>
      )}
      <div className="flex gap-1.5 pt-2">
        <div className="h-4 w-12 rounded bg-white/[0.04]" />
        <div className="h-4 w-14 rounded bg-white/[0.04]" />
      </div>
      <div className="flex justify-between pt-3 border-t border-white/[0.04]">
        <div className="h-4 w-16 rounded bg-white/[0.04]" />
        <div className="h-5 w-20 rounded-md bg-emerald-500/10" />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────
export default function LibraryPage() {
  const { account, connected } = useWallet();
  const [prompts, setPrompts] = useState<PromptMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      if (!account?.address) return;
      try {
        const ids = await getUserUnlockedPrompts(account.address.toString());
        const metadatas = await Promise.all(
          ids.map((id) => getPromptMetadata(id).catch(() => null))
        );
        setPrompts(metadatas.filter((m): m is PromptMetadata => m !== null));
      } catch (err) {
        console.error("Failed to load library:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [account?.address]);

  // Unique categories present in library
  const categories = useMemo(() => {
    const cats = Array.from(new Set(prompts.map((p) => p.category)));
    return ["All", ...cats];
  }, [prompts]);

  // Filtered prompts
  const filtered = useMemo(() => {
    return prompts.filter((p) => {
      const matchCat = activeCategory === "All" || p.category === activeCategory;
      const matchSearch =
        !search ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [prompts, activeCategory, search]);

  // ── Not connected state ────────────────────────────────────────────
  if (!connected) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        {/* Ambient glow blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
        </div>

        <div
          className="relative max-w-md w-full rounded-3xl p-10 text-center"
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(32px) saturate(160%)",
            WebkitBackdropFilter: "blur(32px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 32px 64px rgba(0,0,0,0.6)",
          }}
        >
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-white mb-2">Wallet Required</h2>
          <p className="text-sm text-white/40 leading-relaxed">
            Connect your Aptos wallet to access your personal prompt library.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* ── Page-level ambient glow blobs ───── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-700/[0.07] blur-3xl" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full bg-fuchsia-700/[0.06] blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full bg-blue-700/[0.06] blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* ── Page header ─────────────────────── */}
        <div className="mb-10">
          {/* Pill label */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur text-xs font-mono text-white/40 tracking-widest uppercase mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            My Collection
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-display font-semibold text-white leading-none">
                My{" "}
                <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent">
                  Library
                </span>
              </h1>
              <p className="text-white/40 text-sm mt-2 font-normal">
                {loading ? "Loading your collection…" : `${filtered.length} prompt${filtered.length !== 1 ? "s" : ""} unlocked`}
              </p>
            </div>

            {/* Search bar */}
            {!loading && prompts.length > 0 && (
              <div className="relative sm:w-72">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search prompts…"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.8)",
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Category filter pills ────────────── */}
        {!loading && categories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {categories.map((cat) => {
              const accent = cat !== "All" ? getAccent(cat) : null;
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-mono tracking-wide transition-all duration-300 border"
                  style={{
                    background: isActive
                      ? "rgba(139,92,246,0.2)"
                      : "rgba(255,255,255,0.04)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: isActive
                      ? "1px solid rgba(139,92,246,0.4)"
                      : "1px solid rgba(255,255,255,0.06)",
                    color: isActive ? "#c4b5fd" : "rgba(255,255,255,0.4)",
                    boxShadow: isActive ? "0 0 12px rgba(139,92,246,0.2)" : "none",
                  }}
                >
                  {cat !== "All" && accent ? `${accent.icon} ` : ""}
                  {cat}
                  {cat !== "All" && (
                    <span className="ml-1.5 opacity-50">
                      {prompts.filter((p) => p.category === cat).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Skeleton loading ─────────────────── */}
        {loading ? (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gridAutoRows: "minmax(160px, auto)",
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} isLarge={i % 5 === 1 || i % 5 === 4} />
            ))}
          </div>
        ) : prompts.length === 0 ? (
          /* ── Empty state ──────────────────────── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center text-4xl mb-6"
              style={{
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              📭
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Empty library</h2>
            <p className="text-white/40 text-sm mb-6 max-w-xs leading-relaxed">
              You haven't unlocked any prompts yet. Head to the marketplace to find your first gem.
            </p>
            <Link href="/explore" className="btn-primary">
              Browse Marketplace
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          /* ── No search results ─────────────────── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl mb-4">🔎</div>
            <p className="text-white/40 text-sm">No prompts match your search.</p>
            <button
              onClick={() => { setSearch(""); setActiveCategory("All"); }}
              className="mt-4 btn-ghost text-xs"
            >
              Clear filters
            </button>
          </div>
        ) : (
          /* ── Masonry grid ─────────────────────── */
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gridAutoRows: "minmax(160px, auto)",
            }}
          >
            {filtered.map((prompt, i) => (
              <PromptCard key={prompt.promptId} prompt={prompt} index={i} />
            ))}
          </div>
        )}

        {/* ── Bottom stat bar ──────────────────── */}
        {!loading && prompts.length > 0 && (
          <div
            className="mt-12 flex flex-wrap items-center justify-between gap-4 px-6 py-4 rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.03)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-2xl font-semibold text-white">{prompts.length}</p>
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">Total Prompts</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-white">{categories.length - 1}</p>
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">Categories</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-white">
                  {formatApt(prompts.reduce((sum, p) => sum + p.price, 0))}
                </p>
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">Total Value (APT)</p>
              </div>
            </div>
            <Link
              href="/explore"
              className="text-xs font-mono text-white/30 hover:text-white/60 transition-colors inline-flex items-center gap-1.5"
            >
              Explore more prompts
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
