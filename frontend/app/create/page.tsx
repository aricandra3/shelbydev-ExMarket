/// Create Page — Upload prompt to Shelby + register on-chain
/// ACE encryption applied before upload so only verified buyers can read content.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppWallet } from "@/components/wallet/walletContext";
import { invalidateViewCache, waitForTransaction } from "@/lib/aptos";
import {
    buildDeactivatePromptPayload,
    buildPublishPromptPayload,
    getPromptMetadata,
} from "@/lib/contracts";
import {
    invalidatePromptRegistryCache,
    rememberPromptInRegistry,
} from "@/lib/promptRegistry";
import { aptToOctas, PROMPT_CATEGORIES } from "@/lib/constants";
import { PRICING_MODEL_REVERSE, SUBSCRIPTION_PERIODS } from "@/types";
import type { PricingModel, SubscriptionPeriodKey } from "@/types";
import { getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, CheckCircle2, Eye, Send, Unlock, Zap } from "lucide-react";

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 520;
const MAX_TAGS_LENGTH = 180;
const MAX_CONTENT_LENGTH = 12_000;

/// Publishing is two wallet signatures, not three:
///   encrypting     — derive the prompt id from (wallet, seed), ACE-encrypt
///   registering-blob (tx 1) — Shelby blob_metadata::register_blob
///   uploading-blob  — server-side Shelby upload, the slow part
///   publishing      (tx 2) — publish_prompt, listing goes live complete
///
/// Shelby's register_blob is a private entry function, so it can never be
/// folded into our own transaction — two signatures is the floor here.
type PublishStep =
    | "form"
    | "encrypting"
    | "registering-blob"
    | "uploading-blob"
    | "finalizing-blob"
    | "publishing"
    | "success"
    | "error";

type PublishRecovery = {
    /** Deterministic address the listing will occupy, known before any signing. */
    promptId: string;
    seed: Uint8Array;
    blobName: string;
    ciphertextHex: string;
    domainHex: string;
    accountAddress: string;
    /** Submitted tx 1. Retrying confirms this exact transaction instead of registering another blob. */
    registerTxHash: string;
    /** sha-256 of the exact bytes uploaded to Shelby, pinned on-chain at publish time. */
    contentHash: Uint8Array;
    listing: {
        title: string;
        description: string;
        category: string;
        tags: string[];
        pricingModel: number;
        price: number;
        subscriptionPeriodSecs: number;
    };
};

/// Seed for the named object. Random per publish so two listings from the same
/// wallet never collide on an address.
function newPromptSeed(): Uint8Array {
    const nonce = new Uint8Array(16);
    crypto.getRandomValues(nonce);
    const hex = Array.from(nonce)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    return new TextEncoder().encode(`exmarket/prompt/${hex}`);
}

/// Hash the bytes that go to Shelby so the on-chain listing commits to the
/// stored payload. Buyers can re-hash what they download and compare.
async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
    const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
    return new Uint8Array(digest);
}

const BUSY_STEPS = new Set<PublishStep>([
    "encrypting",
    "registering-blob",
    "uploading-blob",
    "finalizing-blob",
    "publishing",
]);

const PUBLISH_STEP_LABELS: Record<PublishStep, string> = {
    form: "Publish Prompt",
    encrypting: "Encrypting content...",
    "registering-blob": "Registering Shelby blob (1/2)...",
    "uploading-blob": "Uploading to Shelby...",
    "finalizing-blob": "Finalizing Shelby upload...",
    publishing: "Publishing listing (2/2)...",
    success: "Published",
    error: "Try Again",
};

export default function CreatePage() {
    const router = useRouter();
    const { account, connected, signAndSubmitTransaction, signMessage } = useAppWallet();
    const accountAddress = account?.address?.toString();

    const [form, setForm] = useState({
        title: "",
        description: "",
        category: "ChatGPT",
        tags: "",
        pricingModel: "pay-per-unlock" as PricingModel,
        subscriptionPeriod: "monthly" as SubscriptionPeriodKey,
        price: "",
        content: "",
    });

    const [step, setStep] = useState<PublishStep>("form");
    const [error, setError] = useState("");
    const [statusDetail, setStatusDetail] = useState("");
    const [stepStartedAt, setStepStartedAt] = useState<number | null>(null);
    const [elapsedSecs, setElapsedSecs] = useState(0);
    const [txHash, setTxHash] = useState("");
    const [recovery, setRecovery] = useState<PublishRecovery | null>(null);
    const isBusy = BUSY_STEPS.has(step);

    // The Shelby upload takes double-digit seconds. A ticking counter is the
    // difference between "working" and "hung" for whoever is watching it.
    useEffect(() => {
        if (!isBusy) {
            setStepStartedAt(null);
            setElapsedSecs(0);
            return;
        }

        const startedAt = Date.now();
        setStepStartedAt(startedAt);
        setElapsedSecs(0);

        const timer = window.setInterval(() => {
            setElapsedSecs(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);

        return () => window.clearInterval(timer);
    }, [isBusy, step]);
    const submitLabel =
        step === "error" && recovery
            ? "Resume Publish Safely"
            : PUBLISH_STEP_LABELS[step];

    const confirmRegisteredBlob = async (publish: PublishRecovery) => {
        setStep("registering-blob");
        setStatusDetail("Confirming the existing Shelby registration transaction...");
        await waitForTransaction(publish.registerTxHash, {
            checkSuccess: true,
            waitForIndexer: true,
        });
    };

    const finalizePublish = async (publish: PublishRecovery) => {
        if (!accountAddress || publish.accountAddress !== accountAddress) {
            throw new Error("Reconnect the same wallet to finish this publish.");
        }

        const { shelbyService, createUploadProof } = await import("@/lib/shelby");

        setStep("uploading-blob");
        setStatusDetail("Signing the Shelby upload proof...");

        // The upload endpoint spends our Shelby quota under this wallet's
        // account, so it requires proof the wallet owns it. One signature
        // covers both upload phases.
        const proofHeaders = await createUploadProof(
            async (message) => {
                const signed = await signMessage({ message, nonce: "" });
                const rawSig = signed?.signature;
                const rawPk = account?.publicKey;
                if (!rawSig || !rawPk) {
                    throw new Error("Wallet did not return a usable signature.");
                }

                return {
                    fullMessage: signed.fullMessage ?? message,
                    signature: typeof rawSig === "string" ? rawSig : rawSig.toString(),
                    publicKey: typeof rawPk === "string" ? rawPk : rawPk.toString(),
                };
            },
            publish.accountAddress,
            publish.blobName
        );

        setStatusDetail("Uploading encrypted content to Shelby RPC...");

        // Transfer the bytes first (~2.3s). Finalizing is the slow part, and it
        // is deliberately NOT awaited here: nothing in the publish transaction
        // depends on it, so it runs while the wallet dialog is open.
        //
        // Settled into a value rather than left to reject unobserved.
        type Finalizing = Promise<{ ok: true } | { ok: false; err: unknown }>;
        let finalizing: Finalizing;

        try {
            const { uploadId } = await shelbyService.startEncryptedBlobUpload(
                publish.ciphertextHex,
                publish.domainHex,
                publish.accountAddress,
                publish.blobName,
                proofHeaders
            );

            finalizing = shelbyService
                .finalizeUpload(
                    uploadId,
                    publish.accountAddress,
                    publish.blobName,
                    proofHeaders
                )
                .then(() => ({ ok: true as const }))
                .catch((err: unknown) => ({ ok: false as const, err }));
        } catch (err: unknown) {
            // On a retry the blob may already be stored from the previous
            // attempt; that is a success, not a failure.
            const message = getErrorMessage(err, "");
            if (!/(already|exists|duplicate|409|written)/i.test(message)) throw err;
            setStatusDetail("Shelby blob is already stored. Continuing to publish...");
            finalizing = Promise.resolve({ ok: true as const });
        }

        const blobId = `${publish.accountAddress}/${publish.blobName}`;
        setStep("publishing");
        setStatusDetail(
            "Waiting for wallet signature for tx 2: publish the listing. Shelby is finalizing storage in the background."
        );

        const publishPayload = buildPublishPromptPayload({
            seed: publish.seed,
            title: publish.listing.title,
            description: publish.listing.description,
            category: publish.listing.category,
            tags: publish.listing.tags,
            pricingModel: publish.listing.pricingModel,
            price: publish.listing.price,
            subscriptionPeriodSecs: publish.listing.subscriptionPeriodSecs,
            blobId,
            contentHash: publish.contentHash,
        });
        const updateResponse = await signAndSubmitTransaction({ data: publishPayload });

        setStatusDetail("Confirming tx 2 on-chain...");
        await waitForTransaction(updateResponse.hash, { checkSuccess: true });

        // The listing is live now, so storage has to be confirmed before we call
        // this a success. Whatever is left of Shelby's ~10s finalize is what the
        // creator waits for here — usually little or nothing.
        setStep("finalizing-blob");
        setStatusDetail("Confirming Shelby finished storing the content...");

        const finalized = await finalizing;
        if (!finalized.ok) {
            // Published, but the content is not confirmed stored. Take the
            // listing off the market rather than leave a prompt that buyers
            // could pay for and fail to decrypt.
            setStatusDetail("Shelby storage failed. Deactivating the listing...");

            try {
                const deactivateResponse = await signAndSubmitTransaction({
                    data: buildDeactivatePromptPayload(publish.promptId),
                });
                await waitForTransaction(deactivateResponse.hash, {
                    checkSuccess: true,
                });
                invalidateViewCache("::prompt_registry::");
                invalidatePromptRegistryCache();
            } catch {
                // Fall through — the message below tells the creator what to do.
            }

            throw new Error(
                `${getErrorMessage(finalized.err, "Shelby could not finalize the upload.")} ` +
                    "The listing was published and then deactivated, so nobody can buy content that is not stored. " +
                    "Retry to re-upload and reactivate it from your dashboard."
            );
        }

        invalidateViewCache("::prompt_registry::");
        const metadata = await getPromptMetadata(publish.promptId, { fresh: true }).catch(
            () => null
        );
        if (metadata) {
            rememberPromptInRegistry(metadata);
        } else {
            invalidatePromptRegistryCache();
        }

        setTxHash(updateResponse.hash);
        setRecovery(null);
        setStatusDetail("");
        setStep("success");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!connected || !account || !accountAddress) return;

        setError("");
        if (step === "error" && recovery) {
            try {
                await confirmRegisteredBlob(recovery);
                await finalizePublish(recovery);
            } catch (err: unknown) {
                setError(getErrorMessage(err, "Could not finish publishing."));
                setStep("error");
            }
            return;
        }

        const title = form.title.trim();
        const description = form.description.trim();
        const content = form.content;
        const price = Number(form.price);

        if (!title || !description || !content.trim()) {
            setStep("error");
            setError("Title, description, and prompt content are required.");
            return;
        }

        if (!Number.isFinite(price) || price <= 0) {
            setStep("error");
            setError("Enter a valid APT price greater than 0.");
            return;
        }

        try {
            setStep("encrypting");
            setRecovery(null);
            setStatusDetail("Deriving prompt address and encrypting with ACE...");

            const tags = form.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);

            const priceInOctas = aptToOctas(price);
            const pricingModelNum = PRICING_MODEL_REVERSE[form.pricingModel];
            // Only subscription listings carry a period; the contract rejects a
            // non-zero period on any other model.
            const subscriptionPeriodSecs =
                form.pricingModel === "subscription"
                    ? SUBSCRIPTION_PERIODS.find(
                          (period) => period.key === form.subscriptionPeriod
                      )?.seconds ?? 0
                    : 0;

            // ─── PHASE 1: Derive the prompt address, no transaction needed ────
            // publish_prompt creates a *named* object, so its address is a pure
            // function of (creator, seed). Computing it here is what lets ACE
            // encrypt against the real prompt id before anything is signed —
            // the old flow had to register on-chain first just to learn it.
            const { AccountAddress, createObjectAddress } = await import(
                "@aptos-labs/ts-sdk"
            );
            const seed = newPromptSeed();
            const promptId = createObjectAddress(
                AccountAddress.fromString(accountAddress),
                seed
            ).toString();

            // ─── PHASE 2: ACE-encrypt against that address ────────────────────
            // check_permission resolves the domain back to this prompt id, so
            // ACE workers can call has_access(buyer, prompt_id) once it exists.
            setStatusDetail("Encrypting prompt content with ACE...");

            const blobName = `prompt_${Date.now()}.txt`;
            const { aceEncrypt } = await import("@/lib/ace");
            const { ciphertextHex, domainHex } = await aceEncrypt(content, promptId);
            const encryptedPayload = JSON.stringify({ ciphertextHex, domainHex });
            const uploadBytes = new TextEncoder().encode(encryptedPayload);

            // ─── PHASE 3: Generate Shelby commitments from encrypted bytes ────
            const {
                createDefaultErasureCodingProvider,
                generateCommitments,
                ShelbyBlobClient,
                defaultErasureCodingConfig,
                expectedTotalChunksets,
            } = await import("@/lib/shelby");

            const erasureCodingConfig = defaultErasureCodingConfig();
            const provider = await createDefaultErasureCodingProvider();
            const commitments = await generateCommitments(provider, uploadBytes);

            const chunksetSize = erasureCodingConfig.chunkSizeBytes * erasureCodingConfig.erasure_k;
            const numChunksets = expectedTotalChunksets(uploadBytes.length, chunksetSize);

            // ─── PHASE 4: Register blob on Shelby L1 (tx 1 of 2) ─────────────
            // Shelby's register_blob is a private entry function, so this can
            // never be merged into publish_prompt — it has to be its own tx.
            setStep("registering-blob");
            setStatusDetail("Waiting for wallet signature for tx 1: register Shelby blob...");

            const shelbyPayload = ShelbyBlobClient.createRegisterBlobPayload({
                account: AccountAddress.fromString(accountAddress),
                blobName,
                blobSize: uploadBytes.length,
                blobMerkleRoot: commitments.blob_merkle_root,
                expirationMicros: Date.now() * 1000 + 31536000000000,
                numChunksets,
                encoding: erasureCodingConfig.enumIndex,
            });

            const shelbyResponse = await signAndSubmitTransaction({ data: shelbyPayload });
            const recoveryData: PublishRecovery = {
                promptId,
                seed,
                blobName,
                ciphertextHex,
                domainHex,
                accountAddress,
                registerTxHash: shelbyResponse.hash,
                contentHash: await sha256(uploadBytes),
                listing: {
                    title,
                    description,
                    category: form.category,
                    tags,
                    pricingModel: pricingModelNum,
                    price: priceInOctas,
                    subscriptionPeriodSecs,
                },
            };
            // Save recovery immediately after signing tx 1. If confirmation is
            // interrupted, retrying verifies this tx rather than creating a
            // second (orphaned) registered blob.
            setRecovery(recoveryData);
            setStatusDetail("Confirming tx 1 and waiting for Shelby indexer...");
            await confirmRegisteredBlob(recoveryData);

            // No fixed wait here: the upload route already retries while Shelby
            // reports the blob as "not registered", so sleeping first only adds
            // dead time to a step the user is watching.
            setStatusDetail("Preparing Shelby RPC upload...");

            await finalizePublish(recoveryData);
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Something went wrong while publishing."));
            setStep("error");
        }
    };

    // Render early exit for disconnected wallet
    if (!connected) {
        return (
            <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
                <div className="animate-slide-up">
                    <Card className="p-12 text-center">
                        <Badge variant="warning" className="mb-5 shadow-neo-sm">
                            Creator Gate
                        </Badge>
                        <h2 className="mb-4 font-display text-3xl font-black text-cream">
                            Connect Your Wallet
                        </h2>
                        <p className="font-semibold text-cream/55">
                            Connect your Aptos wallet to start creating prompts.
                        </p>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="mb-9">
                <Badge variant="secondary" className="mb-4 shadow-neo-sm">
                    New Listing
                </Badge>
                <h1 className="section-title">
                    Create Prompt
                </h1>
                <p className="section-subtitle">
                    List your instructions on the decentralized marketplace
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Left side Start - Form */}
                <div className="space-y-8 relative">
                    {step === "success" ? (
                            <div className="animate-slide-up">
                                <Card className="p-12 text-center">
                                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[8px] border-2 border-ink bg-retro-lime text-ink shadow-neo">
                                        <CheckCircle2 className="h-9 w-9" />
                                    </div>
                                    <h2 className="mb-2 font-display text-3xl font-black text-cream">
                                        Prompt Published!
                                    </h2>
                                    <p className="mb-6 font-semibold text-cream/55">
                                        Your prompt is now live on the marketplace.
                                    </p>
                                    {txHash && (
                                        <p className="mb-6 break-all font-mono text-xs text-cream/60">
                                            tx: {txHash}
                                        </p>
                                    )}
                                    <Button onClick={() => router.push("/dashboard")}>
                                        Go to Dashboard
                                    </Button>
                                </Card>
                            </div>
                        ) : (
                            <div className="animate-fade-in">
                                <form onSubmit={handleSubmit} className="space-y-6" aria-busy={isBusy}>
                                    <Card className="space-y-5 p-8">
                                        {/* Title */}
                                        <div>
                                            <label htmlFor="prompt-title" className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                Title
                                            </label>
                                            <Input
                                                id="prompt-title"
                                                type="text"
                                                required
                                                minLength={2}
                                                maxLength={MAX_TITLE_LENGTH}
                                                placeholder="e.g. Ultimate SEO Blog Post Generator"
                                                value={form.title}
                                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                            />
                                        </div>

                                        {/* Description */}
                                        <div>
                                            <label htmlFor="prompt-description" className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                Description
                                            </label>
                                            <Textarea
                                                id="prompt-description"
                                                required
                                                maxLength={MAX_DESCRIPTION_LENGTH}
                                                rows={3}
                                                placeholder="Describe what your prompt does and who it's for..."
                                                value={form.description}
                                                onChange={(e) =>
                                                    setForm({ ...form, description: e.target.value })
                                                }
                                            />
                                        </div>

                                        {/* Category */}
                                        <div>
                                            <label htmlFor="prompt-category" className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                Category
                                            </label>
                                            <select
                                                id="prompt-category"
                                                className="input-field"
                                                value={form.category}
                                                onChange={(e) => setForm({ ...form, category: e.target.value })}
                                            >
                                                {PROMPT_CATEGORIES.map((cat) => (
                                                    <option key={cat} value={cat}>
                                                        {cat}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Tags */}
                                        <div>
                                            <label htmlFor="prompt-tags" className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                Tags (comma-separated)
                                            </label>
                                            <Input
                                                id="prompt-tags"
                                                type="text"
                                                maxLength={MAX_TAGS_LENGTH}
                                                placeholder="e.g. seo, blog, marketing"
                                                value={form.tags}
                                                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                                            />
                                        </div>

                                        {/* Pricing Model */}
                                        <div>
                                            <p className="mb-2 text-xs font-black uppercase tracking-widest text-cream/65">
                                                Pricing Model
                                            </p>
                                            <div className="grid grid-cols-3 gap-3">
                                                {(
                                                    [
                                                        { key: "pay-per-unlock", label: "Pay-per-Unlock", icon: Unlock },
                                                        { key: "subscription", label: "Subscription", icon: CalendarClock },
                                                        { key: "api-pay-per-call", label: "API Pay-per-Call", icon: Zap },
                                                    ] as const
                                                ).map((model) => {
                                                    const Icon = model.icon;
                                                    const isActive = form.pricingModel === model.key;
                                                    return (
                                                        <button
                                                            key={model.key}
                                                            type="button"
                                                            aria-pressed={isActive}
                                                            onClick={() =>
                                                                setForm({ ...form, pricingModel: model.key })
                                                            }
                                                            className={`min-h-24 rounded-[7px] border-2 p-3 text-center text-xs font-black uppercase tracking-wide transition-all ${isActive
                                                                ? "border-ink bg-retro-cyan text-ink shadow-neo-sm"
                                                                : "border-cream/20 bg-cream/[0.05] text-cream/60 hover:border-cream/60 hover:text-cream"
                                                                }`}
                                                        >
                                                            <Icon className="mx-auto mb-2 h-5 w-5" />
                                                            {model.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Billing period — subscriptions only */}
                                        {form.pricingModel === "subscription" && (
                                            <div>
                                                <label htmlFor="subscription-period" className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                    Billing Period
                                                </label>
                                                <select
                                                    id="subscription-period"
                                                    className="input-field"
                                                    value={form.subscriptionPeriod}
                                                    onChange={(e) =>
                                                        setForm({
                                                            ...form,
                                                            subscriptionPeriod: e.target
                                                                .value as SubscriptionPeriodKey,
                                                        })
                                                    }
                                                >
                                                    {SUBSCRIPTION_PERIODS.map((period) => (
                                                        <option key={period.key} value={period.key}>
                                                            {period.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="mt-2 text-xs font-semibold text-cream/60">
                                                    The price below buys exactly one period. Buyers
                                                    choose how many periods to pay for — they cannot
                                                    set their own duration.
                                                </p>
                                            </div>
                                        )}

                                        {/* Price */}
                                        <div>
                                            <label htmlFor="prompt-price" className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                {form.pricingModel === "subscription"
                                                    ? "Price per Period (APT)"
                                                    : form.pricingModel === "api-pay-per-call"
                                                      ? "Price per API Call (APT)"
                                                      : "Price (APT)"}
                                            </label>
                                            <Input
                                                id="prompt-price"
                                                type="number"
                                                required
                                                min="0.001"
                                                step="0.001"
                                                inputMode="decimal"
                                                placeholder="0.1"
                                                value={form.price}
                                                onChange={(e) => setForm({ ...form, price: e.target.value })}
                                            />
                                        </div>
                                    </Card>

                                    {/* Prompt Content */}
                                    <Card className="p-8">
                                        <label htmlFor="prompt-content" className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                            Prompt Content
                                        </label>
                                        <Textarea
                                            id="prompt-content"
                                            required
                                            maxLength={MAX_CONTENT_LENGTH}
                                            rows={12}
                                            className="font-mono text-sm"
                                            placeholder="Paste your full prompt content here. This will be stored on Shelby and only visible to buyers."
                                            value={form.content}
                                            onChange={(e) => setForm({ ...form, content: e.target.value })}
                                        />
                                        <p className="mt-3 text-xs font-semibold text-cream/60">
                                            This content is stored on Shelby decentralized storage. It will only
                                            be accessible to users who pay to unlock it.
                                        </p>
                                    </Card>

                                    {/* Submit */}
                                    <Button
                                        type="submit"
                                        disabled={isBusy}
                                        className="relative flex w-full overflow-hidden py-4 text-base"
                                    >
                                        <Send className="h-4 w-4" />
                                        <span className="block">{submitLabel}</span>
                                    </Button>

                                    {isBusy && statusDetail && (
                                        <p role="status" aria-live="polite" className="text-center text-xs font-semibold text-cream/60">
                                            {statusDetail}
                                            {stepStartedAt !== null && elapsedSecs > 2 && (
                                                <span className="ml-1 font-mono text-cream/60">
                                                    ({elapsedSecs}s)
                                                </span>
                                            )}
                                        </p>
                                    )}

                                    {error && (
                                        <p role="alert" className="text-center text-sm font-semibold text-accent-red">
                                            {error}
                                        </p>
                                    )}

                                    {step === "error" && recovery && (
                                        <p className="text-center text-xs font-semibold text-cream/60">
                                            Your existing Shelby registration will be verified before the upload resumes. No new blob registration will be submitted.
                                        </p>
                                    )}
                                </form>
                            </div>
                        )}
                </div>

                {/* Right side Start - Live Preview */}
                <div className="hidden lg:block relative">
                    <div className="sticky top-24 ml-auto mr-12 max-w-md">
                        <h3 className="mb-6 flex items-center justify-center gap-2 text-center text-xs font-black uppercase tracking-widest text-cream/60">
                            <Eye className="h-4 w-4" />
                            Live Preview
                        </h3>
                        <Card className="w-full rotate-1 bg-cream/[0.1] p-0 transition-transform duration-200 hover:rotate-0">
                            <div className="border-b-2 border-ink bg-cream/[0.055] p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <Badge variant="default" className="max-w-[12rem] truncate">
                                        {form.category || "Category"}
                                    </Badge>
                                    <div className="shrink-0 text-right">
                                        <div className="whitespace-nowrap text-2xl font-black leading-none text-retro-yellow">
                                            {form.price || "0"} APT
                                        </div>
                                        <div className="mt-1 max-w-32 truncate text-xs font-black uppercase tracking-wide text-cream/60">
                                            {form.pricingModel.replace(/-/g, " ")}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 p-5">
                                <div>
                                    <h3 className="min-h-[48px] break-words font-display text-lg font-black leading-tight text-cream line-clamp-2">
                                        {form.title || "Your Prompt Title"}
                                    </h3>
                                    <p className="mt-2 min-h-[40px] break-words text-xs font-semibold leading-relaxed text-cream/55 line-clamp-2">
                                        {form.description || "A brief description of what this prompt does and how to use it..."}
                                    </p>
                                </div>

                                <div className="overflow-hidden rounded-[7px] border-2 border-ink bg-surface-0/85 shadow-neo-sm backdrop-blur-xl">
                                    <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-retro-yellow px-3 py-2 text-ink">
                                        <p className="text-[10px] font-black uppercase tracking-widest">
                                            Prompt Content
                                        </p>
                                        <span className="rounded-[4px] border border-ink/40 px-1.5 py-0.5 font-mono text-[9px] font-black uppercase">
                                            Preview
                                        </span>
                                    </div>
                                    <p className="min-h-[190px] whitespace-pre-wrap break-words p-4 font-mono text-[13px] font-semibold leading-6 text-cream/78 line-clamp-[10]">
                                        {form.content.trim() || "Write the actual prompt content here. This preview is the main buyer-facing material, so it should feel substantial and easy to scan."}
                                    </p>
                                </div>

                                <div className="flex items-center justify-between gap-3 border-t border-cream/15 pt-4">
                                    <span className="min-w-0 truncate font-mono text-xs text-cream/60">
                                        by {accountAddress
                                            ? `${accountAddress.substring(0, 6)}...${accountAddress.substring(accountAddress.length - 4)}`
                                            : "you"}
                                    </span>
                                    <span className="max-w-[9rem] shrink-0 truncate rounded-[5px] border border-cream/20 bg-cream/[0.08] px-2 py-1 text-xs font-black uppercase text-cream/55">
                                        {form.category}
                                    </span>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
