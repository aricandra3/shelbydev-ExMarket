/// Library Page — Glassmorphism Masonry View

"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useAppWallet } from "@/components/wallet/walletContext";
import { getAccessRecord, getUserUnlockedPrompts, type AccessRecord } from "@/lib/contracts";
import { loadPromptRegistry } from "@/lib/promptRegistry";
import { formatApt } from "@/lib/constants";
import { getErrorMessage, isRateLimitError } from "@/lib/utils";
import type { PromptMetadata } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Archive, ArrowRight, LockKeyhole, Search, X } from "lucide-react";

// ── Category → accent colour map ─────────────────────────────────────
const CATEGORY_COLORS: Record<string, { pill: string; glow: string; icon: string }> = {
  ChatGPT: { pill: "border-ink bg-retro-mint text-ink", glow: "rgba(143,240,194,0.18)", icon: "C" },
  Midjourney: { pill: "border-ink bg-retro-pink text-ink", glow: "rgba(255,139,209,0.18)", icon: "M" },
  "Stable Diffusion": { pill: "border-ink bg-retro-coral text-ink", glow: "rgba(255,107,87,0.18)", icon: "S" },
  Claude: { pill: "border-ink bg-retro-yellow text-ink", glow: "rgba(255,216,77,0.18)", icon: "C" },
  Gemini: { pill: "border-ink bg-retro-cyan text-ink", glow: "rgba(116,215,255,0.18)", icon: "G" },
  "Agent Workflow": { pill: "border-ink bg-retro-grape text-ink", glow: "rgba(143,124,255,0.18)", icon: "A" },
  Automation: { pill: "border-ink bg-retro-cyan text-ink", glow: "rgba(116,215,255,0.18)", icon: "AU" },
  "Code Generation": { pill: "border-ink bg-retro-lime text-ink", glow: "rgba(185,255,102,0.18)", icon: "CG" },
  Writing: { pill: "border-ink bg-retro-coral text-ink", glow: "rgba(255,107,87,0.18)", icon: "W" },
  Marketing: { pill: "border-ink bg-retro-pink text-ink", glow: "rgba(255,139,209,0.18)", icon: "MK" },
  SEO: { pill: "border-ink bg-retro-lime text-ink", glow: "rgba(185,255,102,0.18)", icon: "SEO" },
  "Data Analysis": { pill: "border-ink bg-retro-cyan text-ink", glow: "rgba(116,215,255,0.18)", icon: "DA" },
  Other: { pill: "border-cream/60 bg-cream/10 text-cream", glow: "rgba(255,244,214,0.1)", icon: "OT" },
};

function getAccent(category: string) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Other"];
}

// ── Single prompt card ────────────────────────────────────────────────
/// What the buyer holds, for the footer badge: perpetual, a window that ends,
/// or a quota that depletes. get_user_unlocked_prompts returns expired
/// subscriptions too, so saying "Unlocked" for all of them would be a lie.
function accessLabel(record?: AccessRecord): { text: string; expired: boolean } {
  if (!record || record.accessType === "none") {
    return { text: "Unlocked", expired: false };
  }

  if (record.accessType === "subscription") {
    const daysLeft = Math.ceil((record.expiresAt * 1000 - Date.now()) / 86_400_000);
    if (record.expiresAt > 0 && daysLeft <= 0) {
      return { text: "Expired", expired: true };
    }
    return {
      text: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
      expired: false,
    };
  }

  if (record.accessType === "api") {
    if (record.apiCallsRemaining <= 0) {
      return { text: "No calls left", expired: true };
    }
    return {
      text: `${record.apiCallsRemaining} call${record.apiCallsRemaining === 1 ? "" : "s"}`,
      expired: false,
    };
  }

  return { text: "Unlocked", expired: false };
}

function PromptCard({
  prompt,
  index,
  record,
}: {
  prompt: PromptMetadata;
  index: number;
  record?: AccessRecord;
}) {
  const access = accessLabel(record);
  const accent = getAccent(prompt.category);
  const isLarge = index % 5 === 1 || index % 5 === 4; // roughly every 2nd/5th card is taller

  return (
    <Link
      href={`/prompt/${prompt.promptId}`}
      className={`group glass-card-hover relative flex flex-col overflow-hidden
        ${isLarge ? "md:row-span-2" : ""}
        `}
    >
      {/* Hover coloured glow layer */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${accent.glow} 0%, transparent 70%)`,
        }}
      />

      {/* Top shimmer line */}
      <div
        className="absolute left-0 right-0 top-0 h-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${accent.glow.replace("0.18", "0.7")} 50%, transparent 100%)`,
        }}
      />

      {/* Frosted inner gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cream/[0.08] to-transparent" />

      {/* Card content */}
      <div className="relative z-10 p-5 flex flex-col h-full gap-3">

        {/* Header row — icon + category badge */}
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-h-9 min-w-9 items-center justify-center rounded-[6px] border-2 border-ink bg-retro-yellow px-1 text-xs font-black leading-none text-ink shadow-neo-sm select-none">
            {accent.icon}
          </span>
          <span className={`inline-flex items-center rounded-[5px] border-2 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${accent.pill}`}>
            {prompt.category}
          </span>
        </div>

        {/* Title */}
        <h3 className={`font-display font-black leading-tight text-cream transition-colors duration-200
          ${isLarge ? "text-lg" : "text-base"} line-clamp-3`}>
          {prompt.title}
        </h3>

        {/* Description — only shown on large cards */}
        {isLarge && (
          <p className="flex-grow text-sm font-semibold leading-relaxed text-cream/55 line-clamp-3">
            {prompt.description}
          </p>
        )}

        {/* Tags */}
        {prompt.tags && prompt.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto">
            {prompt.tags.slice(0, isLarge ? 4 : 2).map((tag) => (
              <span
                key={tag}
                className="rounded-[5px] border border-cream/20 bg-cream/[0.06] px-2 py-0.5 font-mono text-[9px] text-cream/40"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer — price strip + unlock badge */}
        <div className="flex items-center justify-between border-t border-cream/10 pt-3">
          <span className="font-mono text-xs font-black text-retro-yellow">
            {formatApt(prompt.price)} APT
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-[5px] border-2 border-ink px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-ink ${
              access.expired ? "bg-retro-coral" : "bg-retro-lime"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full border border-ink bg-ink ${
                access.expired ? "" : "animate-pulse"
              }`}
            />
            {access.text}
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
      className={`glass-card animate-pulse space-y-3 overflow-hidden p-5 ${isLarge ? "md:row-span-2" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="skeleton h-8 w-8" />
        <div className="skeleton h-5 w-20" />
      </div>
      <div className="skeleton h-5 w-3/4" />
      {isLarge && (
        <>
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
        </>
      )}
      <div className="flex gap-1.5 pt-2">
        <div className="skeleton h-4 w-12" />
        <div className="skeleton h-4 w-14" />
      </div>
      <div className="flex justify-between border-t border-cream/10 pt-3">
        <div className="skeleton h-4 w-16" />
        <div className="skeleton h-5 w-20" />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────
export default function LibraryPage() {
  const { account, connected } = useAppWallet();
  const accountAddress = account?.address?.toString();
  const [prompts, setPrompts] = useState<PromptMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [accessRecords, setAccessRecords] = useState<Record<string, AccessRecord>>({});
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    async function load() {
      if (!accountAddress) {
        if (!cancelled && requestId === requestIdRef.current) {
          setPrompts([]);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      setPrompts([]);
      setAccessRecords({});
      try {
        const [ids, registry] = await Promise.all([
          getUserUnlockedPrompts(accountAddress),
          loadPromptRegistry(),
        ]);
        const unlockedIds = new Set(ids.map((id) => id.toLowerCase()));
        const metadatas = registry.prompts.filter((prompt) =>
          unlockedIds.has(prompt.promptId.toLowerCase())
        );
        if (!cancelled && requestId === requestIdRef.current) {
          setPrompts(metadatas);
        }

        // Then fill in what each entitlement actually is. Supplementary, so a
        // failure here leaves the cards rendered without the detail badge.
        const records: Record<string, AccessRecord> = {};
        for (const prompt of metadatas) {
          if (cancelled || requestId !== requestIdRef.current) return;
          try {
            records[prompt.promptId] = await getAccessRecord(
              accountAddress,
              prompt.promptId
            );
          } catch {
            // leave this one unlabeled
          }
        }
        if (!cancelled && requestId === requestIdRef.current) {
          setAccessRecords(records);
        }
      } catch (err: unknown) {
        if (!cancelled && requestId === requestIdRef.current) {
          setPrompts([]);
          setError(
            isRateLimitError(err)
              ? "Aptos is rate limiting your library request. Wait a moment, then retry."
              : getErrorMessage(err, "Your library could not be loaded.")
          );
        }
      } finally {
        if (!cancelled && requestId === requestIdRef.current) setLoading(false);
      }
    }
    load();

    return () => {
      cancelled = true;
    };
  }, [accountAddress, loadAttempt]);

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
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="relative max-w-md p-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[8px] border-2 border-ink bg-retro-coral text-ink shadow-neo">
            <LockKeyhole className="h-9 w-9" />
          </div>
          <h2 className="mb-2 font-display text-2xl font-black text-cream">Wallet Required</h2>
          <p className="text-sm font-semibold leading-relaxed text-cream/55">
            Connect your Aptos wallet to access your personal prompt library.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* ── Page header ─────────────────────── */}
        <div className="mb-10">
          {/* Pill label */}
          <Badge variant="secondary" className="mb-4 shadow-neo-sm">
            My Collection
          </Badge>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="section-title">
                My Library
              </h1>
              <p className="mt-3 text-sm font-semibold text-cream/50">
                {loading ? "Loading your collection…" : `${filtered.length} prompt${filtered.length !== 1 ? "s" : ""} unlocked`}
              </p>
            </div>

            {/* Search bar */}
            {!loading && prompts.length > 0 && (
              <div className="relative sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream/35" />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search prompts…"
                  className="pl-9"
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
                  className={`min-h-11 rounded-[7px] border-2 px-3.5 py-2 text-xs font-black uppercase tracking-wide transition-all duration-150 ${isActive
                    ? "border-ink bg-retro-yellow text-ink shadow-neo-sm"
                    : "border-cream/15 bg-cream/[0.04] text-cream/45 hover:border-cream/50 hover:text-cream"
                    }`}
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
        ) : error ? (
          <Alert className="p-6">
            <AlertTitle>Library could not be loaded</AlertTitle>
            <AlertDescription className="mb-4">{error}</AlertDescription>
            <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)} size="sm" variant="outline">
              Retry
            </Button>
          </Alert>
        ) : prompts.length === 0 ? (
          /* ── Empty state ──────────────────────── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[8px] border-2 border-ink bg-retro-yellow text-ink shadow-neo">
              <Archive className="h-12 w-12" />
            </div>
            <h2 className="mb-2 font-display text-2xl font-black text-cream">Empty library</h2>
            <p className="mb-6 max-w-xs text-sm font-semibold leading-relaxed text-cream/55">
              You haven't unlocked any prompts yet. Head to the marketplace to find your first gem.
            </p>
            <Link href="/explore" className={buttonVariants()}>
              Browse Marketplace
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          /* ── No search results ─────────────────── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Search className="mb-4 h-10 w-10 text-retro-yellow" />
            <p className="text-sm font-semibold text-cream/55">No prompts match your search.</p>
            <button
              onClick={() => { setSearch(""); setActiveCategory("All"); }}
              className="mt-4 btn-ghost text-xs"
            >
              <X className="h-4 w-4" />
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
              <PromptCard
                key={prompt.promptId}
                prompt={prompt}
                index={i}
                record={accessRecords[prompt.promptId]}
              />
            ))}
          </div>
        )}

        {/* ── Bottom stat bar ──────────────────── */}
        {!loading && prompts.length > 0 && (
          <Card className="mt-12 flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-2xl font-black text-retro-yellow">{prompts.length}</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-cream/35">Total Prompts</p>
              </div>
              <div>
                <p className="text-2xl font-black text-retro-cyan">{categories.length - 1}</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-cream/35">Categories</p>
              </div>
              <div>
                <p className="text-2xl font-black text-retro-mint">
                  {formatApt(prompts.reduce((sum, p) => sum + p.price, 0))}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-cream/35">Total Value (APT)</p>
              </div>
            </div>
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-cream/45 transition-colors hover:text-retro-yellow"
            >
              Explore more prompts
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
