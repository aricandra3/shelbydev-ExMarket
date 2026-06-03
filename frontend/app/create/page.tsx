/// Create Page — Upload prompt to Shelby + register on-chain
/// ACE encryption applied before upload so only verified buyers can read content.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppWallet } from "@/components/wallet/walletContext";
import { invalidateViewCache, waitForTransaction } from "@/lib/aptos";
import {
    buildRegisterPromptPayload,
    buildUpdateBlobIdPayload,
    getCreatorPrompts,
    getPromptMetadata,
} from "@/lib/contracts";
import {
    invalidatePromptRegistryCache,
    rememberPromptInRegistry,
} from "@/lib/promptRegistry";
import { aptToOctas, PROMPT_CATEGORIES } from "@/lib/constants";
import { PRICING_MODEL_REVERSE } from "@/types";
import type { PricingModel } from "@/types";
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

type PublishStep =
    | "form"
    | "registering-prompt"
    | "encrypting"
    | "registering-blob"
    | "uploading-blob"
    | "finalizing-blob"
    | "updating-prompt"
    | "success"
    | "error";

type PublishRecovery = {
    promptId: string;
    blobName: string;
    ciphertextHex: string;
    domainHex: string;
    accountAddress: string;
};

const BUSY_STEPS = new Set<PublishStep>([
    "registering-prompt",
    "encrypting",
    "registering-blob",
    "uploading-blob",
    "finalizing-blob",
    "updating-prompt",
]);

const PUBLISH_STEP_LABELS: Record<PublishStep, string> = {
    form: "Publish Prompt",
    "registering-prompt": "Confirming listing tx...",
    encrypting: "Encrypting content...",
    "registering-blob": "Registering Shelby blob...",
    "uploading-blob": "Uploading to Shelby...",
    "finalizing-blob": "Finalizing Shelby upload...",
    "updating-prompt": "Linking content on-chain...",
    success: "Published",
    error: "Try Again",
};

export default function CreatePage() {
    const router = useRouter();
    const { account, connected, signAndSubmitTransaction } = useAppWallet();
    const accountAddress = account?.address?.toString();

    const [form, setForm] = useState({
        title: "",
        description: "",
        category: "ChatGPT",
        tags: "",
        pricingModel: "pay-per-unlock" as PricingModel,
        price: "",
        content: "",
    });

    const [step, setStep] = useState<PublishStep>("form");
    const [error, setError] = useState("");
    const [statusDetail, setStatusDetail] = useState("");
    const [txHash, setTxHash] = useState("");
    const [recovery, setRecovery] = useState<PublishRecovery | null>(null);
    const isBusy = BUSY_STEPS.has(step);
    const submitLabel =
        step === "error" && recovery
            ? "Retry Finalize Upload"
            : PUBLISH_STEP_LABELS[step];

    const finalizePublish = async (publish: PublishRecovery) => {
        if (!accountAddress || publish.accountAddress !== accountAddress) {
            throw new Error("Reconnect the same wallet to finish this publish.");
        }

        const { shelbyService } = await import("@/lib/shelby");

        setStep("uploading-blob");
        setStatusDetail("Uploading encrypted content to Shelby RPC...");

        try {
            await shelbyService.putEncryptedBlob(
                publish.ciphertextHex,
                publish.domainHex,
                publish.accountAddress,
                publish.blobName,
                (progress) => {
                    if (progress.phase === "finalizing") {
                        setStep("finalizing-blob");
                        setStatusDetail(
                            "Finalizing Shelby multipart upload. If Shelby RPC is slow, this is the step that used to hang."
                        );
                        return;
                    }

                    if (progress.phase === "complete") {
                        setStatusDetail("Shelby upload complete. Preparing final on-chain link...");
                        return;
                    }

                    setStep("uploading-blob");
                    setStatusDetail("Uploading encrypted content to Shelby RPC...");
                }
            );
        } catch (err: unknown) {
            const message = getErrorMessage(err, "");
            if (!/(already|exists|duplicate|409)/i.test(message)) throw err;
            setStatusDetail("Shelby blob is already uploaded. Continuing to final on-chain link...");
        }

        const blobId = `${publish.accountAddress}/${publish.blobName}`;
        setStep("updating-prompt");
        setStatusDetail("Waiting for wallet signature for tx 3: link blob_id to prompt...");

        const updatePayload = buildUpdateBlobIdPayload(publish.promptId, blobId);
        const updateResponse = await signAndSubmitTransaction({ data: updatePayload });

        setStatusDetail("Confirming tx 3 on-chain...");
        await waitForTransaction(updateResponse.hash, { checkSuccess: true });

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
            setStep("registering-prompt");
            setRecovery(null);
            setStatusDetail("Waiting for wallet signature for tx 1: create prompt listing...");

            const tags = form.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);

            const priceInOctas = aptToOctas(price);
            const pricingModelNum = PRICING_MODEL_REVERSE[form.pricingModel];

            // ─── PHASE 1: Register on-chain with placeholder blob_id ──────────
            // We need the real on-chain prompt_id (Aptos Object address) BEFORE
            // we can ACE-encrypt — ACE domain = SHA3(prompt_id hex), and
            // check_permission validates access_control::has_access(user, prompt_id).
            const placeholderBlobId = "pending";
            const payload = buildRegisterPromptPayload(
                placeholderBlobId,
                title,
                description,
                form.category,
                tags,
                pricingModelNum,
                priceInOctas
            );

            const registerResponse = await signAndSubmitTransaction({ data: payload });
            setStatusDetail("Confirming tx 1 on-chain...");
            await waitForTransaction(registerResponse.hash, { checkSuccess: true });

            // Fetch the real prompt_id: it's the last address in creator's prompts list
            setStatusDetail("Reading the new prompt id from Aptos...");
            const creatorPrompts = await getCreatorPrompts(accountAddress, {
                fresh: true,
            });
            if (!creatorPrompts || creatorPrompts.length === 0) {
                throw new Error("Could not retrieve prompt_id after on-chain registration");
            }
            const promptId = creatorPrompts[creatorPrompts.length - 1];

            // ─── PHASE 2: ACE-encrypt with the REAL on-chain prompt_id ────────
            // Now the domain encodes the actual Object address, so ACE workers
            // can call has_access(buyer_address, prompt_id) and get the correct result.
            setStep("encrypting");
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
            const { AccountAddress } = await import("@aptos-labs/ts-sdk");

            const erasureCodingConfig = defaultErasureCodingConfig();
            const provider = await createDefaultErasureCodingProvider();
            const commitments = await generateCommitments(provider, uploadBytes);

            const chunksetSize = erasureCodingConfig.chunkSizeBytes * erasureCodingConfig.erasure_k;
            const numChunksets = expectedTotalChunksets(uploadBytes.length, chunksetSize);

            // ─── PHASE 4: Register blob on Shelby L1 ─────────────────────────
            setStep("registering-blob");
            setStatusDetail("Waiting for wallet signature for tx 2: register Shelby blob...");

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
            setStatusDetail("Confirming tx 2 and waiting for Shelby indexer...");
            await waitForTransaction(shelbyResponse.hash, {
                checkSuccess: true,
                waitForIndexer: true,
            });

            setStatusDetail("Preparing Shelby RPC upload...");
            await new Promise((resolve) => setTimeout(resolve, 3000));

            const recoveryData: PublishRecovery = {
                promptId,
                blobName,
                ciphertextHex,
                domainHex,
                accountAddress,
            };
            setRecovery(recoveryData);
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
                                        <p className="mb-6 break-all font-mono text-xs text-cream/35">
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
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <Card className="space-y-5 p-8">
                                        {/* Title */}
                                        <div>
                                            <label className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                Title
                                            </label>
                                            <Input
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
                                            <label className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                Description
                                            </label>
                                            <Textarea
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
                                            <label className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                Category
                                            </label>
                                            <select
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
                                            <label className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                Tags (comma-separated)
                                            </label>
                                            <Input
                                                type="text"
                                                maxLength={MAX_TAGS_LENGTH}
                                                placeholder="e.g. seo, blog, marketing"
                                                value={form.tags}
                                                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                                            />
                                        </div>

                                        {/* Pricing Model */}
                                        <div>
                                            <label className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                Pricing Model
                                            </label>
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
                                                                : "border-cream/20 bg-cream/[0.05] text-cream/45 hover:border-cream/60 hover:text-cream"
                                                                }`}
                                                        >
                                                            <Icon className="mx-auto mb-2 h-5 w-5" />
                                                            {model.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Price */}
                                        <div>
                                            <label className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                                Price (APT)
                                            </label>
                                            <Input
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
                                        <label className="mb-2 block text-xs font-black uppercase tracking-widest text-cream/65">
                                            Prompt Content
                                        </label>
                                        <Textarea
                                            required
                                            maxLength={MAX_CONTENT_LENGTH}
                                            rows={12}
                                            className="font-mono text-sm"
                                            placeholder="Paste your full prompt content here. This will be stored on Shelby and only visible to buyers."
                                            value={form.content}
                                            onChange={(e) => setForm({ ...form, content: e.target.value })}
                                        />
                                        <p className="mt-3 text-xs font-semibold text-cream/35">
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
                                        <p className="text-center text-xs font-semibold text-cream/45">
                                            {statusDetail}
                                        </p>
                                    )}

                                    {error && (
                                        <p className="text-center text-sm font-semibold text-accent-red">
                                            {error}
                                        </p>
                                    )}

                                    {step === "error" && recovery && (
                                        <p className="text-center text-xs font-semibold text-cream/40">
                                            Tx 1 and tx 2 already completed. Retry will continue from Shelby upload/final tx only.
                                        </p>
                                    )}
                                </form>
                            </div>
                        )}
                </div>

                {/* Right side Start - Live Preview */}
                <div className="hidden lg:block relative">
                    <div className="sticky top-24 ml-auto mr-12 max-w-md">
                        <h3 className="mb-6 flex items-center justify-center gap-2 text-center text-xs font-black uppercase tracking-widest text-cream/45">
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
                                        <div className="mt-1 max-w-32 truncate text-xs font-black uppercase tracking-wide text-cream/45">
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
                                    <span className="min-w-0 truncate font-mono text-xs text-cream/45">
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
