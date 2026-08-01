/// Prompt Detail Page — View metadata, unlock, and read content
/// ACE decrypt flow: readEncryptedBlob → signMessage(domain) → aceDecrypt

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAppWallet } from "@/components/wallet/walletContext";
import { useAccessCheck } from "@/hooks/useAccessCheck";
import { useUnlockPrompt } from "@/hooks/useUnlockPrompt";
import { getPromptMetadata } from "@/lib/contracts";
import { formatApt } from "@/lib/constants";
import { copyToClipboard, getErrorMessage, truncateAddress } from "@/lib/utils";
import type { PromptMetadata } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clipboard, LockKeyhole, Minus, Plus, Wallet } from "lucide-react";

/// Human-readable duration for a subscription window.
function formatPeriod(seconds: number): string {
    if (seconds <= 0) return "no period set";
    const days = Math.round(seconds / 86_400);
    if (days % 365 === 0) {
        const years = days / 365;
        return `${years} year${years === 1 ? "" : "s"}`;
    }
    if (days % 30 === 0) {
        const months = days / 30;
        return `${months} month${months === 1 ? "" : "s"}`;
    }
    if (days % 7 === 0) {
        const weeks = days / 7;
        return `${weeks} week${weeks === 1 ? "" : "s"}`;
    }
    return `${days} day${days === 1 ? "" : "s"}`;
}

/// "in 12 days" / "expired" for a unix-seconds deadline.
function formatDaysLeft(expiresAtSecs: number): string {
    const days = Math.ceil((expiresAtSecs * 1000 - Date.now()) / 86_400_000);
    if (days < 0) return "expired";
    if (days === 0) return "ends today";
    return `${days} day${days === 1 ? "" : "s"} left`;
}

export default function PromptDetailPage() {
    const params = useParams();
    const promptId = params.id as string;
    const { account, connected, signMessage } = useAppWallet();
    const accountAddress = account?.address?.toString();

    const [prompt, setPrompt] = useState<PromptMetadata | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [content, setContent] = useState<string | null>(null);
    const [decrypting, setDecrypting] = useState(false);
    const [decryptError, setDecryptError] = useState<string | null>(null);
    const [decryptAttempt, setDecryptAttempt] = useState(0);
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);

    const {
        hasAccess,
        record: accessRecord,
        loading: accessLoading,
        refresh: refreshAccess,
    } = useAccessCheck(promptId);
    const { txState, unlockPrompt, subscribe, purchaseApiCalls, reset } =
        useUnlockPrompt();

    // How much to buy. Subscriptions are counted in billing periods, API
    // listings in calls — the contract decides the period length and the
    // per-call price, so quantity is the only choice a buyer makes.
    const [quantity, setQuantity] = useState(1);

    const isSubscription = prompt?.pricingModel === "subscription";
    const isApi = prompt?.pricingModel === "api-pay-per-call";
    const periodSecs = prompt?.subscriptionPeriodSecs ?? 0;
    // Mirrors MAX_PERIODS_PER_PURCHASE / MAX_API_CALLS_PER_PURCHASE in payment.move.
    const maxQuantity = isSubscription ? 120 : isApi ? 1_000_000 : 1;
    const isBusy =
        txState.status === "signing" ||
        txState.status === "submitting" ||
        txState.status === "confirming";

    // Fetch prompt metadata
    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setLoadError(null);
            try {
                const data = await getPromptMetadata(promptId, { fresh: loadAttempt > 0 });
                if (!cancelled) setPrompt(data);
            } catch (err: unknown) {
                if (!cancelled) {
                    setPrompt(null);
                    setLoadError(getErrorMessage(err, "Prompt metadata could not be loaded."));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        if (promptId) load();

        return () => {
            cancelled = true;
        };
    }, [promptId, loadAttempt]);

    useEffect(() => {
        setContent(null);
        setDecryptError(null);
        setDecrypting(false);
        setCopied(false);
        setCopyError(false);
    }, [accountAddress, promptId]);

    // Auto-decrypt and load content when user has access
    useEffect(() => {
        let cancelled = false;

        async function loadAndDecryptContent() {
            if (!hasAccess || !prompt?.blobId || content || !account || !accountAddress) return;
            setDecrypting(true);
            setDecryptError(null);
            try {
                // 1. Fetch the encrypted blob from Shelby
                const [
                    { shelbyService },
                    { aceDecrypt, getSigningMessage },
                    { Ed25519PublicKey, Ed25519Signature },
                ] = await Promise.all([
                    import("@/lib/shelby"),
                    import("@/lib/ace"),
                    import("@aptos-labs/ts-sdk"),
                ]);
                const { ciphertextHex, domainHex } =
                    await shelbyService.readEncryptedBlob(promptId);

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
                if (!rawPk) throw new Error("Wallet public key is unavailable.");
                const pkHex = typeof rawPk === "string" ? rawPk : rawPk.toString();
                const publicKey = new Ed25519PublicKey(pkHex);

                const rawSig = signResponse.signature;
                if (!rawSig) throw new Error("Wallet signature was not returned.");
                const sigHex = typeof rawSig === "string" ? rawSig : rawSig.toString();
                const signature = new Ed25519Signature(sigHex);

                const fullMessage = signResponse.fullMessage;

                // 4. ACE workers verify on-chain access and release decryption key
                const plaintext = await aceDecrypt({
                    ciphertextHex,
                    domainHex,
                    userAddr: accountAddress,
                    publicKey,
                    signature,
                    fullMessage,
                });

                if (!cancelled) setContent(plaintext);
            } catch (err: unknown) {
                if (!cancelled) {
                    setDecryptError(getErrorMessage(err, "Decryption failed. Please try again."));
                }
            } finally {
                if (!cancelled) setDecrypting(false);
            }
        }
        loadAndDecryptContent();

        return () => {
            cancelled = true;
        };
    }, [hasAccess, prompt?.blobId, account, accountAddress, content, signMessage, decryptAttempt]);

    // After successful unlock, refresh access and load content
    useEffect(() => {
        if (txState.status === "success") {
            refreshAccess(true);
            setLoadAttempt((attempt) => attempt + 1);
        }
    }, [txState.status, refreshAccess]);

    // Each pricing model has its own entry function, and the contract rejects
    // paying through the wrong one — so the button has to match the listing.
    const handleBuy = async () => {
        reset();

        if (prompt?.pricingModel === "subscription") {
            await subscribe(promptId, quantity);
            return;
        }

        if (prompt?.pricingModel === "api-pay-per-call") {
            await purchaseApiCalls(promptId, quantity);
            return;
        }

        await unlockPrompt(promptId);
    };

    const handleCopy = async () => {
        if (content) {
            setCopyError(false);
            const didCopy = await copyToClipboard(content);
            if (!didCopy) {
                setCopyError(true);
                return;
            }
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleRetryDecrypt = () => {
        setContent(null);
        setDecryptError(null);
        setLoadAttempt((attempt) => attempt + 1);
        setDecryptAttempt((attempt) => attempt + 1);
    };

    if (loading) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
                <Card className="p-8">
                    <div className="skeleton h-8 w-2/3 mb-4" />
                    <div className="skeleton h-4 w-full mb-2" />
                    <div className="skeleton h-4 w-3/4 mb-6" />
                    <div className="skeleton h-12 w-40" />
                </Card>
            </div>
        );
    }

    if (!prompt) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
                <Alert className="p-8 text-center">
                    <AlertTitle>Prompt unavailable</AlertTitle>
                    <AlertDescription className="mb-5">
                        {loadError ?? "Prompt not found."}
                    </AlertDescription>
                    <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)} size="sm" variant="outline">
                        Retry
                    </Button>
                </Alert>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="grid gap-6">
                {/* Header Card */}
                <Card className="p-6 sm:p-8">
                    <div className="mb-4 flex items-start justify-between gap-4">
                        <Badge>{prompt.category}</Badge>
                        <div className="shrink-0 text-right">
                            <div className="text-3xl font-black text-retro-yellow">
                                {formatApt(prompt.price)}
                            </div>
                            <div className="text-xs font-black uppercase tracking-wide text-cream/40">
                                {isSubscription
                                    ? `per ${formatPeriod(periodSecs)}`
                                    : isApi
                                      ? "per api call"
                                      : prompt.pricingModel.replace(/-/g, " ")}
                            </div>
                        </div>
                    </div>

                    <h1 className="mb-3 break-words font-display text-3xl font-black text-cream sm:text-4xl">
                        {prompt.title}
                    </h1>
                    <p className="mb-6 break-words font-semibold leading-relaxed text-cream/60">
                        {prompt.description}
                    </p>

                    {/* Creator + stats row */}
                    <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-cream/40 sm:gap-4">
                        <span>
                            by{" "}
                            <span className="font-mono text-cream/70">
                                {truncateAddress(prompt.creator)}
                            </span>
                        </span>
                        <span>•</span>
                        <span>{prompt.totalUnlocks} unlocks</span>
                        <span>•</span>
                        <span>{formatApt(prompt.totalRevenue)} earned</span>
                    </div>
                </Card>

                {/* Action Card */}
                <Card className="p-8">
                    {!connected ? (
                        <div className="text-center py-4">
                            <Wallet className="mx-auto mb-4 h-10 w-10 text-retro-yellow" />
                            <p className="mb-4 font-semibold text-cream/60">
                                Connect your wallet to unlock this prompt
                            </p>
                        </div>
                    ) : accessLoading ? (
                        <div className="skeleton h-12 w-full" />
                    ) : hasAccess ? (
                        /* ── User has access: show content ── */
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="flex items-center gap-2 text-lg font-black text-cream">
                                    <CheckCircle2 className="h-5 w-5 text-accent-green" />
                                    {accessRecord.accessType === "subscription"
                                        ? "Subscribed"
                                        : accessRecord.accessType === "api"
                                          ? "API access"
                                          : "Unlocked"}
                                </h2>
                                <Button onClick={handleCopy} variant="ghost" size="sm">
                                    <Clipboard className="h-4 w-4" />
                                    {copied ? "Copied" : "Copy"}
                                </Button>
                            </div>

                            {/* What the buyer actually holds: a window that ends,
                                a quota that depletes, or nothing that expires. */}
                            {accessRecord.accessType === "subscription" &&
                                accessRecord.expiresAt > 0 && (
                                    <p className="mb-4 text-xs font-semibold text-cream/60">
                                        Access runs until{" "}
                                        <span className="text-cream/70">
                                            {new Date(
                                                accessRecord.expiresAt * 1000
                                            ).toLocaleString()}
                                        </span>{" "}
                                        ({formatDaysLeft(accessRecord.expiresAt)}). Buy more
                                        periods any time — they stack onto this date.
                                    </p>
                                )}

                            {accessRecord.accessType === "api" && (
                                <p className="mb-4 text-xs font-semibold text-cream/60">
                                    <span className="text-cream/70">
                                        {accessRecord.apiCallsRemaining}
                                    </span>{" "}
                                    API call
                                    {accessRecord.apiCallsRemaining === 1 ? "" : "s"} left.
                                    Each request through the API spends one.
                                </p>
                            )}

                            {copyError && (
                                <p className="mb-3 text-xs font-semibold text-accent-red">
                                    Clipboard permission was blocked. Select the content manually to copy it.
                                </p>
                            )}

                            {decrypting ? (
                                <div className="space-y-3">
                                    <div className="skeleton h-40 w-full rounded-xl" />
                                    <p className="text-center text-xs font-semibold text-cream/40">
                                        ACE workers verifying on-chain access...
                                    </p>
                                </div>
                            ) : decryptError ? (
                                <Alert className="p-5">
                                    <AlertTitle>Could not decrypt content</AlertTitle>
                                    <AlertDescription className="mb-4">{decryptError}</AlertDescription>
                                    <Button onClick={handleRetryDecrypt} size="sm" variant="outline">
                                        Retry decrypt
                                    </Button>
                                </Alert>
                            ) : content ? (
                                <div className="max-h-[500px] overflow-y-auto whitespace-pre-wrap break-words rounded-[8px] border-2 border-ink bg-surface-1/75 p-6 font-mono text-sm text-cream/80 shadow-neo-dark backdrop-blur-xl">
                                    {content}
                                </div>
                            ) : (
                                <p className="text-sm font-semibold text-cream/60">
                                    Loading content from Shelby...
                                </p>
                            )}
                        </div>
                    ) : (
                        /* ── User needs to buy ── */
                        <div className="text-center py-4">
                            <LockKeyhole className="mx-auto mb-4 h-11 w-11 text-retro-coral" />
                            <p className="mb-6 font-semibold text-cream/60">
                                {isSubscription
                                    ? `Subscribe to read this prompt. ${formatApt(prompt.price)} buys ${formatPeriod(periodSecs)} of access.`
                                    : isApi
                                      ? `This prompt is sold per API call at ${formatApt(prompt.price)} each.`
                                      : "Unlock this prompt to view the full content"}
                            </p>

                            {/* Quantity, for the two models that have one */}
                            {(isSubscription || isApi) && (
                                <div className="mx-auto mb-6 max-w-xs">
                                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                        {isSubscription
                                            ? "How many periods"
                                            : "How many calls"}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            aria-label="Decrease"
                                            onClick={() =>
                                                setQuantity((q) => Math.max(1, q - 1))
                                            }
                                            disabled={quantity <= 1 || isBusy}
                                        >
                                            <Minus className="h-3.5 w-3.5" />
                                        </Button>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={maxQuantity}
                                            inputMode="numeric"
                                            className="text-center"
                                            value={quantity}
                                            onChange={(e) => {
                                                const next = Number(e.target.value);
                                                if (!Number.isFinite(next)) return;
                                                setQuantity(
                                                    Math.min(maxQuantity, Math.max(1, Math.floor(next)))
                                                );
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            aria-label="Increase"
                                            onClick={() =>
                                                setQuantity((q) => Math.min(maxQuantity, q + 1))
                                            }
                                            disabled={quantity >= maxQuantity || isBusy}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                    <p className="mt-2 text-xs font-semibold text-cream/60">
                                        {isSubscription
                                            ? `${formatPeriod(periodSecs * quantity)} of access`
                                            : `${quantity} call${quantity === 1 ? "" : "s"}`}{" "}
                                        • total {formatApt(prompt.price * quantity)}
                                    </p>
                                </div>
                            )}

                            <Button
                                onClick={handleBuy}
                                disabled={isBusy}
                                size="lg"
                            >
                                {txState.status === "idle" &&
                                    (isSubscription
                                        ? `Subscribe for ${formatApt(prompt.price * quantity)}`
                                        : isApi
                                          ? `Buy ${quantity} call${quantity === 1 ? "" : "s"} for ${formatApt(prompt.price * quantity)}`
                                          : `Unlock for ${formatApt(prompt.price)}`)}
                                {txState.status === "signing" && "Waiting for signature..."}
                                {txState.status === "submitting" && "Submitting..."}
                                {txState.status === "confirming" && "Confirming..."}
                                {txState.status === "success" && "Done ✓"}
                                {txState.status === "error" && "Try Again"}
                            </Button>

                            {txState.error && (
                                <p className="mt-3 break-words text-xs font-semibold text-accent-red">
                                    {txState.error}
                                </p>
                            )}

                            <p className="mt-4 text-xs font-semibold text-cream/60">
                                {90}% goes to the creator • {10}% platform fee
                            </p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
