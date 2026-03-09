/// Library Page — User's unlocked prompts

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { getUserUnlockedPrompts, getPromptMetadata } from "@/lib/contracts";
import { formatApt } from "@/lib/constants";
import type { PromptMetadata } from "@/types";

export default function LibraryPage() {
    const { account, connected } = useWallet();
    const [prompts, setPrompts] = useState<PromptMetadata[]>([]);
    const [loading, setLoading] = useState(true);

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

    if (!connected) {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="glass-card p-12 text-center">
                    <p className="text-white/40">
                        Connect your wallet to view your unlocked prompts.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h1 className="section-title mb-2">My Library</h1>
            <p className="section-subtitle mb-8">
                Prompts you've unlocked
            </p>

            {loading ? (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="glass-card p-6">
                            <div className="skeleton h-5 w-2/3 mb-2" />
                            <div className="skeleton h-4 w-1/3" />
                        </div>
                    ))}
                </div>
            ) : prompts.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <p className="text-white/40 mb-4">No prompts unlocked yet.</p>
                    <Link href="/explore" className="btn-primary">
                        Explore Prompts
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {prompts.map((prompt) => (
                        <Link
                            key={prompt.promptId}
                            href={`/prompt/${prompt.promptId}`}
                            className="glass-card-hover p-6 flex items-center justify-between block"
                        >
                            <div>
                                <div className="badge-brand text-[10px] mb-2">
                                    {prompt.category}
                                </div>
                                <h3 className="text-base font-semibold text-white">
                                    {prompt.title}
                                </h3>
                                <p className="text-sm text-white/30 mt-1 line-clamp-1">
                                    {prompt.description}
                                </p>
                            </div>
                            <div className="text-right shrink-0 ml-4">
                                <span className="badge-green">Unlocked</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
