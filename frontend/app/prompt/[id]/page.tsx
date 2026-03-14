/// Prompt Detail Page — View metadata, unlock, and read content
/// ACE decrypt flow: readEncryptedBlob → signMessage(domain) → aceDecrypt

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Ed25519PublicKey, Ed25519Signature } from "@aptos-labs/ts-sdk";
import { useAccessCheck } from "@/hooks/useAccessCheck";
import { useUnlockPrompt } from "@/hooks/useUnlockPrompt";
import { getPromptMetadata } from "@/lib/contracts";
import { formatApt } from "@/lib/constants";
import { truncateAddress, timeAgo, copyToClipboard } from "@/lib/utils";
import type { PromptMetadata } from "@/types";
import { aceDecrypt, getSigningMessage } from "@/lib/ace";

export default function PromptDetailPage() {
    const params = useParams();
    const promptId = params.id as string;
    const { account, connected, signMessage } = useWallet();

    const [prompt, setPrompt] = useState<PromptMetadata | null>(null);
    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState<string | null>(null);
    const [decrypting, setDecrypting] = useState(false);
    const [copied, setCopied] = useState(false);

    const { hasAccess, loading: accessLoading, refresh: refreshAccess } = useAccessCheck(promptId);
    const { txState, unlockPrompt, purchaseApiCalls, reset } = useUnlockPrompt();

    // Fetch prompt metadata
    useEffect(() => {
        async function load() {
            try {
                const data = await getPromptMetadata(promptId);
                setPrompt(data);
            } catch (err) {
                console.error("Failed to load prompt:", err);
            } finally {
                setLoading(false);
            }
        }
        if (promptId) load();
    }, [promptId]);

    // Auto-decrypt and load content when user has access
    useEffect(() => {
        async function loadAndDecryptContent() {
            if (!hasAccess || !prompt?.blobId || content || !account) return;
            setDecrypting(true);
            try {
                // 1. Fetch the encrypted blob from Shelby
                const { shelbyService } = await import("@/lib/shelby");
                const { ciphertextHex, domainHex } = await shelbyService.readEncryptedBlob(prompt.blobId);

                // 2. Ask the wallet to sign the ACE permission message
                //    This proves to ACE workers that the user controls this account
                const signingMessage = getSigningMessage(domainHex);
                const signResponse = await signMessage({
                    message: signingMessage,
                    nonce: "",
                });

                // 3. Convert wallet adapter key/sig to proper SDK class instances
                //    Wallet adapter returns plain objects; ACE SDK needs instanceof-compatible classes
                const rawPk = account.publicKey;
                const pkHex = typeof rawPk === "string" ? rawPk : (rawPk as any).toString();
                const publicKey = new Ed25519PublicKey(pkHex);

                const rawSig = signResponse.signature;
                const sigHex = typeof rawSig === "string" ? rawSig : (rawSig as any).toString();
                const signature = new Ed25519Signature(sigHex);

                const fullMessage = signResponse.fullMessage;

                // 4. ACE workers verify on-chain access and release decryption key
                const plaintext = await aceDecrypt({
                    ciphertextHex,
                    domainHex,
                    userAddr: account.address.toString(),
                    publicKey,
                    signature,
                    fullMessage,
                });

                setContent(plaintext);
            } catch (err: any) {
                console.error("ACE decrypt failed:", err);
                setContent(`⚠️ Decryption failed: ${err?.message ?? "Unknown error"}`);
            } finally {
                setDecrypting(false);
            }
        }
        loadAndDecryptContent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAccess, prompt?.blobId, account]);

    // After successful unlock, refresh access and load content
    useEffect(() => {
        if (txState.status === "success") {
            refreshAccess();
        }
    }, [txState.status, refreshAccess]);

    const handleUnlock = async () => {
        reset();
        await unlockPrompt(promptId);
    };

    const handleCopy = async () => {
        if (content) {
            await copyToClipboard(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="glass-card p-8">
                    <div className="skeleton h-8 w-2/3 mb-4" />
                    <div className="skeleton h-4 w-full mb-2" />
                    <div className="skeleton h-4 w-3/4 mb-6" />
                    <div className="skeleton h-12 w-40" />
                </div>
            </div>
        );
    }

    if (!prompt) {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="glass-card p-12 text-center">
                    <p className="text-white/40">Prompt not found.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid gap-6">
                {/* Header Card */}
                <div className="glass-card p-8">
                    <div className="flex items-start justify-between mb-4">
                        <div className="badge-primary">{prompt.category}</div>
                        <div className="text-right">
                            <div className="text-2xl font-bold text-primary-400">
                                {formatApt(prompt.price)}
                            </div>
                            <div className="text-xs text-white/30 capitalize">
                                {prompt.pricingModel.replace(/-/g, " ")}
                            </div>
                        </div>
                    </div>

                    <h1 className="text-3xl font-bold text-white mb-3">
                        {prompt.title}
                    </h1>
                    <p className="text-white/50 leading-relaxed mb-6">
                        {prompt.description}
                    </p>

                    {/* Creator + stats row */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-white/30">
                        <span>
                            by{" "}
                            <span className="text-white/60 font-mono">
                                {truncateAddress(prompt.creator)}
                            </span>
                        </span>
                        <span>•</span>
                        <span>{prompt.totalUnlocks} unlocks</span>
                        <span>•</span>
                        <span>{formatApt(prompt.totalRevenue)} earned</span>
                    </div>
                </div>

                {/* Action Card */}
                <div className="glass-card p-8">
                    {!connected ? (
                        <div className="text-center py-4">
                            <p className="text-white/40 mb-4">
                                Connect your wallet to unlock this prompt
                            </p>
                        </div>
                    ) : accessLoading ? (
                        <div className="skeleton h-12 w-full" />
                    ) : hasAccess ? (
                        /* ── User has access: show content ── */
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-accent-green" />
                                    Unlocked
                                </h2>
                                <button onClick={handleCopy} className="btn-ghost text-xs">
                                    {copied ? "Copied ✓" : "Copy"}
                                </button>
                            </div>

                            {decrypting ? (
                                <div className="space-y-3">
                                    <div className="skeleton h-40 w-full rounded-xl" />
                                    <p className="text-xs text-white/30 text-center">
                                        ACE workers verifying on-chain access...
                                    </p>
                                </div>
                            ) : content ? (
                                <div className="bg-surface-1 rounded-xl p-6 font-mono text-sm
                                text-white/80 whitespace-pre-wrap max-h-[500px]
                                overflow-y-auto border border-white/[0.04]">
                                    {content}
                                </div>
                            ) : (
                                <p className="text-white/40 text-sm">
                                    Loading content from Shelby...
                                </p>
                            )}
                        </div>
                    ) : (
                        /* ── User needs to unlock ── */
                        <div className="text-center py-4">
                            <p className="text-white/50 mb-6">
                                Unlock this prompt to view the full content
                            </p>

                            <button
                                onClick={handleUnlock}
                                disabled={
                                    txState.status === "signing" ||
                                    txState.status === "submitting" ||
                                    txState.status === "confirming"
                                }
                                className="btn-primary text-base px-10 py-4"
                            >
                                {txState.status === "idle" && `Unlock for ${formatApt(prompt.price)}`}
                                {txState.status === "signing" && "Waiting for signature..."}
                                {txState.status === "submitting" && "Submitting..."}
                                {txState.status === "confirming" && "Confirming..."}
                                {txState.status === "success" && "Unlocked ✓"}
                                {txState.status === "error" && "Try Again"}
                            </button>

                            {txState.error && (
                                <p className="text-accent-red text-xs mt-3">
                                    {txState.error}
                                </p>
                            )}

                            <p className="text-xs text-white/20 mt-4">
                                {90}% goes to the creator • {10}% platform fee
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
