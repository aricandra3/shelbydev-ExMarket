/// Create Page — Upload prompt to Shelby + register on-chain
/// ACE encryption applied before upload so only verified buyers can read content.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { aptosClient } from "@/lib/aptos";
import { buildRegisterPromptPayload, buildUpdateBlobIdPayload, getCreatorPrompts } from "@/lib/contracts";
import { aptToOctas, PROMPT_CATEGORIES } from "@/lib/constants";
import { PRICING_MODEL_REVERSE } from "@/types";
import type { PricingModel } from "@/types";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import { motion, AnimatePresence } from "framer-motion";
import { aceEncrypt } from "@/lib/ace";

export default function CreatePage() {
    const router = useRouter();
    const { account, connected, signAndSubmitTransaction } = useWallet();

    const [form, setForm] = useState({
        title: "",
        description: "",
        category: "ChatGPT",
        tags: "",
        pricingModel: "pay-per-unlock" as PricingModel,
        price: "",
        content: "",
    });

    const [step, setStep] = useState<
        "form" | "uploading" | "registering" | "success" | "error"
    >("form");
    const [error, setError] = useState("");
    const [txHash, setTxHash] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!connected || !account) return;

        try {
            setStep("registering");

            const tags = form.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);

            const priceInOctas = aptToOctas(parseFloat(form.price));
            const pricingModelNum = PRICING_MODEL_REVERSE[form.pricingModel];

            // ─── PHASE 1: Register on-chain with placeholder blob_id ──────────
            // We need the real on-chain prompt_id (Aptos Object address) BEFORE
            // we can ACE-encrypt — ACE domain = SHA3(prompt_id hex), and
            // check_permission validates access_control::has_access(user, prompt_id).
            const placeholderBlobId = "pending";
            const payload = buildRegisterPromptPayload(
                placeholderBlobId,
                form.title,
                form.description,
                form.category,
                tags,
                pricingModelNum,
                priceInOctas
            );

            const registerResponse = await signAndSubmitTransaction({ data: payload });
            await aptosClient.waitForTransaction({
                transactionHash: registerResponse.hash,
                options: { checkSuccess: true } as any,
            });

            // Fetch the real prompt_id: it's the last address in creator's prompts list
            const creatorPrompts = await getCreatorPrompts(account.address.toString());
            if (!creatorPrompts || creatorPrompts.length === 0) {
                throw new Error("Could not retrieve prompt_id after on-chain registration");
            }
            const promptId = creatorPrompts[creatorPrompts.length - 1];

            // ─── PHASE 2: ACE-encrypt with the REAL on-chain prompt_id ────────
            // Now the domain encodes the actual Object address, so ACE workers
            // can call has_access(buyer_address, prompt_id) and get the correct result.
            setStep("uploading");

            const blobName = `prompt_${Date.now()}.txt`;
            const { ciphertextHex, domainHex } = await aceEncrypt(form.content, promptId);
            const encryptedPayload = JSON.stringify({ ciphertextHex, domainHex });
            const uploadBytes = new TextEncoder().encode(encryptedPayload);

            // ─── PHASE 3: Generate Shelby commitments from encrypted bytes ────
            const {
                createDefaultErasureCodingProvider,
                generateCommitments,
                ShelbyBlobClient,
                defaultErasureCodingConfig,
                expectedTotalChunksets,
                shelbyService,
            } = await import("@/lib/shelby");

            const erasureCodingConfig = defaultErasureCodingConfig();
            const provider = await createDefaultErasureCodingProvider();
            const commitments = await generateCommitments(provider, uploadBytes);

            const chunksetSize = erasureCodingConfig.chunkSizeBytes * erasureCodingConfig.erasure_k;
            const numChunksets = expectedTotalChunksets(uploadBytes.length, chunksetSize);

            // ─── PHASE 4: Register blob on Shelby L1 ─────────────────────────
            setStep("registering");

            const shelbyPayload = ShelbyBlobClient.createRegisterBlobPayload({
                account: AccountAddress.fromString(account.address.toString()),
                blobName,
                blobSize: uploadBytes.length,
                blobMerkleRoot: commitments.blob_merkle_root,
                expirationMicros: Date.now() * 1000 + 31536000000000,
                numChunksets,
                encoding: erasureCodingConfig.enumIndex,
            });

            const shelbyResponse = await signAndSubmitTransaction({ data: shelbyPayload });
            await aptosClient.waitForTransaction({
                transactionHash: shelbyResponse.hash,
                options: { checkSuccess: true, waitForIndexer: true } as any,
            });

            console.log("Waiting for Shelby indexer to sync...");
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // ─── PHASE 5: Upload encrypted blob via Shelby RPC ───────────────
            setStep("uploading");

            await shelbyService.putEncryptedBlob(
                ciphertextHex,
                domainHex,
                account.address.toString(),
                blobName
            );
            const blobId = `${account.address.toString()}/${blobName}`;
            if (!blobId) throw new Error("Failed to upload encrypted blob");

            // ─── PHASE 6: Update blob_id on-chain (replace "pending") ─────────
            setStep("registering");

            const updatePayload = buildUpdateBlobIdPayload(promptId, blobId);
            const updateResponse = await signAndSubmitTransaction({ data: updatePayload });
            await aptosClient.waitForTransaction({
                transactionHash: updateResponse.hash,
            });

            setTxHash(updateResponse.hash);
            setStep("success");
        } catch (err: any) {
            console.error(err);
            setError(err?.message || "Something went wrong");
            setStep("error");
        }
    };

    // Render early exit for disconnected wallet
    if (!connected) {
        return (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-card p-12 text-center"
                >
                    <h2 className="text-xl font-semibold text-white mb-4">
                        Connect Your Wallet
                    </h2>
                    <p className="text-white/40">
                        Connect your Aptos wallet to start creating prompts.
                    </p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="mb-8">
                <h1 className="text-4xl md:text-5xl font-display font-extrabold tracking-tight text-white mb-4">
                    Create Prompt
                </h1>
                <p className="text-lg text-white/50">
                    List your instructions on the decentralized marketplace
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Left side Start - Form */}
                <div className="space-y-8 relative">
                    <AnimatePresence mode="wait">
                        {step === "success" ? (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                className="glass-card p-12 text-center"
                            >
                                <div className="text-5xl mb-4">🎉</div>
                                <h2 className="text-2xl font-bold text-white mb-2">
                                    Prompt Published!
                                </h2>
                                <p className="text-white/50 mb-6">
                                    Your prompt is now live on the marketplace.
                                </p>
                                {txHash && (
                                    <p className="text-xs text-white/30 font-mono mb-6 break-all">
                                        tx: {txHash}
                                    </p>
                                )}
                                <button
                                    onClick={() => router.push("/dashboard")}
                                    className="btn-primary"
                                >
                                    Go to Dashboard
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="form"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="glass-card p-8 space-y-5">
                                        {/* Title */}
                                        <div>
                                            <label className="block text-sm font-medium text-white/60 mb-2">
                                                Title
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                className="input-field"
                                                placeholder="e.g. Ultimate SEO Blog Post Generator"
                                                value={form.title}
                                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                            />
                                        </div>

                                        {/* Description */}
                                        <div>
                                            <label className="block text-sm font-medium text-white/60 mb-2">
                                                Description
                                            </label>
                                            <textarea
                                                required
                                                rows={3}
                                                className="textarea-field"
                                                placeholder="Describe what your prompt does and who it's for..."
                                                value={form.description}
                                                onChange={(e) =>
                                                    setForm({ ...form, description: e.target.value })
                                                }
                                            />
                                        </div>

                                        {/* Category */}
                                        <div>
                                            <label className="block text-sm font-medium text-white/60 mb-2">
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
                                            <label className="block text-sm font-medium text-white/60 mb-2">
                                                Tags (comma-separated)
                                            </label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                placeholder="e.g. seo, blog, marketing"
                                                value={form.tags}
                                                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                                            />
                                        </div>

                                        {/* Pricing Model */}
                                        <div>
                                            <label className="block text-sm font-medium text-white/60 mb-2">
                                                Pricing Model
                                            </label>
                                            <div className="grid grid-cols-3 gap-3">
                                                {(
                                                    [
                                                        { key: "pay-per-unlock", label: "Pay-per-Unlock", icon: "🔓" },
                                                        { key: "subscription", label: "Subscription", icon: "📅" },
                                                        { key: "api-pay-per-call", label: "API Pay-per-Call", icon: "⚡" },
                                                    ] as const
                                                ).map((model) => (
                                                    <button
                                                        key={model.key}
                                                        type="button"
                                                        onClick={() =>
                                                            setForm({ ...form, pricingModel: model.key })
                                                        }
                                                        className={`p-3 rounded-xl border text-center transition-all text-xs font-medium ${form.pricingModel === model.key
                                                            ? "border-primary-500/50 bg-primary-500/10 text-primary-400"
                                                            : "border-white/[0.06] text-white/40 hover:border-white/[0.12]"
                                                            }`}
                                                    >
                                                        <div className="text-lg mb-1">{model.icon}</div>
                                                        {model.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Price */}
                                        <div>
                                            <label className="block text-sm font-medium text-white/60 mb-2">
                                                Price (APT)
                                            </label>
                                            <input
                                                type="number"
                                                required
                                                min="0.001"
                                                step="0.001"
                                                className="input-field"
                                                placeholder="0.1"
                                                value={form.price}
                                                onChange={(e) => setForm({ ...form, price: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    {/* Prompt Content */}
                                    <div className="glass-card p-8">
                                        <label className="block text-sm font-medium text-white/60 mb-2">
                                            Prompt Content
                                        </label>
                                        <textarea
                                            required
                                            rows={12}
                                            className="textarea-field font-mono text-sm"
                                            placeholder="Paste your full prompt content here. This will be stored on Shelby and only visible to buyers."
                                            value={form.content}
                                            onChange={(e) => setForm({ ...form, content: e.target.value })}
                                        />
                                        <p className="text-xs text-white/20 mt-2">
                                            This content is stored on Shelby decentralized storage. It will only
                                            be accessible to users who pay to unlock it.
                                        </p>
                                    </div>

                                    {/* Submit */}
                                    <button
                                        type="submit"
                                        disabled={step === "uploading" || step === "registering"}
                                        className="btn-primary w-full py-4 text-base relative overflow-hidden flex justify-center"
                                    >
                                        <AnimatePresence mode="popLayout">
                                            <motion.span
                                                key={step}
                                                initial={{ y: 20, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                exit={{ y: -20, opacity: 0 }}
                                                transition={{ duration: 0.3 }}
                                                className="block"
                                            >
                                                {step === "form" && "Publish Prompt"}
                                                {step === "uploading" && "Uploading to Shelby..."}
                                                {step === "registering" && "Registering on-chain..."}
                                                {step === "error" && "Try Again"}
                                            </motion.span>
                                        </AnimatePresence>
                                    </button>

                                    {error && (
                                        <motion.p
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            className="text-accent-red text-sm text-center"
                                        >
                                            {error}
                                        </motion.p>
                                    )}
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Right side Start - Live Preview */}
                <div className="hidden lg:block relative">
                    <div className="sticky top-24">
                        <h3 className="text-sm font-bold text-white/40 tracking-widest uppercase mb-6">
                            Live Preview
                        </h3>
                        <div className="glass-card p-6 rotate-1 hover:rotate-0 transition-transform duration-500 max-w-sm ml-auto mr-12 bg-surface-1/80 backdrop-blur-xl border-t border-l border-white/[0.1]">
                            <div className="flex items-start justify-between mb-4">
                                <div className="badge-primary">{form.category || "Category"}</div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-primary-400">
                                        {form.price || "0"} APT
                                    </div>
                                    <div className="text-xs text-white/50 capitalize">
                                        {form.pricingModel.replace(/-/g, " ")}
                                    </div>
                                </div>
                            </div>

                            <h3 className="text-xl font-bold text-white mb-2 line-clamp-2 min-h-[56px]">
                                {form.title || "Your Prompt Title"}
                            </h3>
                            <p className="text-sm text-white/60 mb-6 line-clamp-2 min-h-[40px]">
                                {form.description || "A brief description of what this prompt does and how to use it..."}
                            </p>

                            <div className="flex items-center justify-between pt-4 border-t border-white/[0.04]">
                                <span className="text-xs font-mono text-white/40">
                                    by {account?.address ? `${account.address.substring(0, 6)}...${account.address.substring(account.address.length - 4)}` : "you"}
                                </span>
                                <div className="flex gap-2">
                                    <span className="text-xs bg-surface-3 px-2 py-1 rounded-md text-white/50">{form.category}</span>
                                </div>
                            </div>
                        </div>
                        {/* Decorative glow behind preview */}
                        <div className="absolute top-20 right-12 w-64 h-64 bg-primary-500/20 blur-[100px] pointer-events-none -z-10" />
                    </div>
                </div>
            </div>
        </div>
    );
}
