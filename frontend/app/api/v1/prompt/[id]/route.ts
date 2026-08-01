/// API Route: paid programmatic access to a prompt's stored content.
///
/// Flow for a caller (an agent, a backend, a builder's script):
///   1. Unlock the prompt on-chain (or hold a live subscription / API quota).
///   2. Sign the proof message this route returns in `required_message`.
///   3. For api-pay-per-call listings, submit one
///      access_control::consume_api_call transaction and pass its hash in
///      X-Consume-Tx — that is what makes per-call billing real rather than
///      decorative.
///
/// What comes back is the ACE-encrypted payload, not plaintext: the whole point
/// of the design is that only the buyer's wallet can unwrap it, and this server
/// has no way to do that on their behalf. Decrypt client-side with the ACE SDK
/// using `ciphertext_hex` and `domain_hex`, and check the bytes against
/// `content_hash` to confirm Shelby served what the listing committed to.

import { NextRequest, NextResponse } from "next/server";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import {
    getApiCallsRemainingServer,
    getPromptMetadataServer,
    hasAccessServer,
} from "@/lib/contractsServer";
import { aptosServerClient } from "@/lib/aptosServer";
import { MODULES } from "@/lib/constants";
import { readEncryptedBlobServer } from "@/lib/shelbyServer";
import { isRateLimitError } from "@/lib/utils";
import { checkRateLimit, rateLimitHeaders } from "@/lib/apiSecurity";
import {
    buildProofMessageFormat,
    consumeNonce,
    verifyWalletProof,
} from "@/lib/walletProof";

export const runtime = "nodejs";

const PROOF_ACTION = "ExMarket API prompt access";
const CONSUME_TX_MAX_AGE_MS = 10 * 60 * 1000;

type PromptRouteContext = {
    params: Promise<{ id: string }>;
};

/// Verify that `txHash` is a fresh, successful consume_api_call from this
/// wallet for this prompt, and that it has not been presented before.
///
/// Metering has to be the caller's own transaction: consume_api_call takes the
/// user's signer, so no server-side key can spend their quota for them. That
/// keeps billing trustless at the cost of one transaction per call.
async function verifyConsumeTx(
    txHash: string,
    walletAddress: string,
    promptId: string
): Promise<string | null> {
    if (!/^0x[a-fA-F0-9]{16,}$/.test(txHash)) {
        return "Invalid X-Consume-Tx transaction hash";
    }

    let transaction: any;
    try {
        transaction = await aptosServerClient.getTransactionByHash({
            transactionHash: txHash,
        });
    } catch {
        return "X-Consume-Tx transaction was not found";
    }

    if (transaction?.success !== true) {
        return "X-Consume-Tx transaction did not succeed";
    }

    const sender = String(transaction.sender ?? "");
    try {
        if (AccountAddress.fromString(sender).toString() !== walletAddress) {
            return "X-Consume-Tx was not sent by this wallet";
        }
    } catch {
        return "X-Consume-Tx has an unreadable sender";
    }

    const fn = String(transaction.payload?.function ?? "");
    if (fn !== `${MODULES.ACCESS_CONTROL}::consume_api_call`) {
        return "X-Consume-Tx is not a consume_api_call transaction";
    }

    const args = transaction.payload?.functionArguments ?? transaction.payload?.arguments;
    const txPromptId = Array.isArray(args) ? String(args[0] ?? "") : "";
    let normalizedTxPromptId: string;
    let normalizedPromptId: string;
    try {
        normalizedTxPromptId = AccountAddress.fromString(txPromptId).toString();
        normalizedPromptId = AccountAddress.fromString(promptId).toString();
    } catch {
        return "X-Consume-Tx does not reference a readable prompt id";
    }
    if (normalizedTxPromptId !== normalizedPromptId) {
        return "X-Consume-Tx consumed a call for a different prompt";
    }

    // timestamp is in microseconds
    const timestampMs = Number(transaction.timestamp ?? 0) / 1000;
    if (!Number.isFinite(timestampMs) || Date.now() - timestampMs > CONSUME_TX_MAX_AGE_MS) {
        return "X-Consume-Tx is too old — submit a fresh consume_api_call";
    }

    // One served response per consume transaction.
    if (!(await consumeNonce(`consume-tx:${walletAddress}:${promptId}`, txHash))) {
        return "X-Consume-Tx has already been used for a response";
    }

    return null;
}

export async function GET(req: NextRequest, { params }: PromptRouteContext) {
    const rateLimit = await checkRateLimit(req.headers, {
        namespace: "api-prompt",
        limit: 30,
        windowMs: 60_000,
    });

    if (rateLimit.limited) {
        return NextResponse.json(
            { error: "Too many prompt API requests. Please retry shortly." },
            { status: 429, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const { id: promptId } = await params;
    if (!promptId) {
        return NextResponse.json(
            { error: "Missing prompt id" },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const walletAddress = req.headers.get("X-Wallet-Address");
    if (!walletAddress) {
        return NextResponse.json(
            {
                error: "Missing X-Wallet-Address header",
                required_message: buildProofMessageFormat({
                    action: PROOF_ACTION,
                    bindings: [
                        ["Prompt", promptId],
                        ["Wallet", "<your_wallet_address>"],
                    ],
                }),
            },
            { status: 401, headers: rateLimitHeaders(rateLimit) }
        );
    }

    let normalizedWalletAddress: string;
    try {
        normalizedWalletAddress = AccountAddress.fromString(walletAddress).toString();
    } catch {
        return NextResponse.json(
            { error: "Invalid wallet address" },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    try {
        const proof = await verifyWalletProof({
            headers: req.headers,
            walletAddress: normalizedWalletAddress,
            action: PROOF_ACTION,
            bindings: [
                ["Prompt", promptId],
                ["Wallet", normalizedWalletAddress],
            ],
            scope: `api-prompt:${promptId}`,
        });

        if (!proof.ok) {
            return NextResponse.json(
                { error: proof.error, required_message: proof.requiredMessage },
                { status: 401, headers: rateLimitHeaders(rateLimit) }
            );
        }

        const metadata = await getPromptMetadataServer(promptId, { fresh: true });

        if (metadata.status !== "active") {
            return NextResponse.json(
                {
                    error: "This prompt is not available. It is deactivated, or its content is not stored yet.",
                    prompt_id: promptId,
                },
                { status: 409, headers: rateLimitHeaders(rateLimit) }
            );
        }

        const accessGranted = await hasAccessServer(
            normalizedWalletAddress,
            promptId,
            { fresh: true }
        );
        if (!accessGranted) {
            return NextResponse.json(
                {
                    error: "Payment required. Unlock this prompt first.",
                    unlock_url: `/prompt/${promptId}`,
                    prompt_id: promptId,
                    pricing_model: metadata.pricingModel,
                    price_octas: metadata.price,
                },
                { status: 402, headers: rateLimitHeaders(rateLimit) }
            );
        }

        // Per-call listings bill per response, proven by the caller's own
        // consume_api_call transaction.
        let callsRemaining: number | null = null;
        if (metadata.pricingModel === "api-pay-per-call") {
            const consumeTx = req.headers.get("X-Consume-Tx");
            if (!consumeTx) {
                return NextResponse.json(
                    {
                        error: "This listing bills per call. Submit an access_control::consume_api_call transaction and pass its hash in X-Consume-Tx.",
                        prompt_id: promptId,
                        consume_function: `${MODULES.ACCESS_CONTROL}::consume_api_call`,
                        calls_remaining: await getApiCallsRemainingServer(
                            normalizedWalletAddress,
                            promptId
                        ),
                    },
                    { status: 402, headers: rateLimitHeaders(rateLimit) }
                );
            }

            const consumeError = await verifyConsumeTx(
                consumeTx,
                normalizedWalletAddress,
                promptId
            );
            if (consumeError) {
                return NextResponse.json(
                    { error: consumeError, prompt_id: promptId },
                    { status: 402, headers: rateLimitHeaders(rateLimit) }
                );
            }

            callsRemaining = await getApiCallsRemainingServer(
                normalizedWalletAddress,
                promptId
            );
        }

        if (!metadata.blobId) {
            return NextResponse.json(
                { error: "Prompt blob not found" },
                { status: 404, headers: rateLimitHeaders(rateLimit) }
            );
        }

        // Reads go through the server-side helper so egress is billed to this
        // project's Shelby key, and it throws on failure — unlike the old
        // readPrompt, which returned its error as if it were content.
        const { ciphertextHex, domainHex } = await readEncryptedBlobServer(
            metadata.blobId
        );

        return NextResponse.json(
            {
                prompt_id: promptId,
                encryption: "ace",
                ciphertext_hex: ciphertextHex,
                domain_hex: domainHex,
                content_hash: metadata.contentHash ?? "",
                blob_id: metadata.blobId,
                pricing_model: metadata.pricingModel,
                ...(callsRemaining !== null ? { calls_remaining: callsRemaining } : {}),
                decrypt: {
                    sdk: "@aptos-labs/ace-sdk",
                    steps: [
                        "ace.Ciphertext.fromHex(ciphertext_hex)",
                        "ace.FullDecryptionDomain.fromHex(domain_hex)",
                        "sign the domain's pretty message with this wallet to build a ProofOfPermission",
                        "ace.DecryptionKey.fetch({ committee, contractId, domain, proof }) then ace.decrypt",
                    ],
                    note: "Hash the blob payload with sha-256 and compare against content_hash before trusting it.",
                },
                timestamp: Date.now(),
            },
            { headers: rateLimitHeaders(rateLimit) }
        );
    } catch (error: unknown) {
        console.error("Prompt API error:", error);
        return NextResponse.json(
            {
                error: isRateLimitError(error)
                    ? "Aptos is rate limiting requests. Please retry in a few seconds."
                    : "Unable to load prompt content right now.",
            },
            {
                status: isRateLimitError(error) ? 429 : 502,
                headers: rateLimitHeaders(rateLimit),
            }
        );
    }
}
