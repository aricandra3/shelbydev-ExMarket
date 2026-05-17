/// API Route: Prompt content endpoint for API monetization
/// Verifies on-chain access before serving blob content

import { NextRequest, NextResponse } from "next/server";
import {
    AccountAddress,
    AuthenticationKey,
    Ed25519PublicKey,
    Ed25519Signature,
} from "@aptos-labs/ts-sdk";
import { hasAccess, getPromptBlobId } from "@/lib/contracts";
import { shelbyService } from "@/lib/shelby";
import { isRateLimitError } from "@/lib/utils";
import { checkRateLimit, rateLimitHeaders } from "@/lib/apiSecurity";

export const runtime = "edge";

const WALLET_PROOF_MAX_AGE_MS = 5 * 60 * 1000;
const WALLET_PROOF_CLOCK_SKEW_MS = 30 * 1000;
const seenWalletProofNonces = new Map<string, number>();

function getRequiredApiMessage(
    promptId: string,
    walletAddress: string,
    timestamp: string,
    nonce: string
) {
    return [
        "ExMarket API prompt access",
        `Prompt: ${promptId}`,
        `Wallet: ${walletAddress}`,
        `Timestamp: ${timestamp}`,
        `Nonce: ${nonce}`,
    ].join("\n");
}

function getRequiredApiMessageFormat(promptId: string, walletAddress: string) {
    return [
        "ExMarket API prompt access",
        `Prompt: ${promptId}`,
        `Wallet: ${walletAddress}`,
        "Timestamp: <unix_ms>",
        "Nonce: <random_16_to_128_chars>",
    ].join("\n");
}

function cleanupExpiredNonces(now: number) {
    if (seenWalletProofNonces.size < 1_000) return;

    Array.from(seenWalletProofNonces.entries()).forEach(([key, expiresAt]) => {
        if (expiresAt <= now) {
            seenWalletProofNonces.delete(key);
        }
    });
}

function consumeWalletProofNonce(
    walletAddress: string,
    promptId: string,
    nonce: string
) {
    const now = Date.now();
    cleanupExpiredNonces(now);

    const key = `${walletAddress}:${promptId}:${nonce}`;
    const existingExpiry = seenWalletProofNonces.get(key);

    if (existingExpiry && existingExpiry > now) {
        return false;
    }

    seenWalletProofNonces.set(
        key,
        now + WALLET_PROOF_MAX_AGE_MS + WALLET_PROOF_CLOCK_SKEW_MS
    );
    return true;
}

function validateWalletProofFreshness(
    timestampHeader: string | null,
    nonce: string | null
) {
    if (!timestampHeader || !nonce) {
        return "Missing wallet proof timestamp or nonce";
    }

    if (!/^\d{10,17}$/.test(timestampHeader)) {
        return "Invalid wallet proof timestamp";
    }

    if (nonce.length < 16 || nonce.length > 128 || /\s/.test(nonce)) {
        return "Invalid wallet proof nonce";
    }

    const timestampMs = Number(timestampHeader);
    const now = Date.now();

    if (!Number.isFinite(timestampMs)) {
        return "Invalid wallet proof timestamp";
    }

    if (timestampMs > now + WALLET_PROOF_CLOCK_SKEW_MS) {
        return "Wallet proof timestamp is too far in the future";
    }

    if (now - timestampMs > WALLET_PROOF_MAX_AGE_MS) {
        return "Wallet proof has expired";
    }

    return null;
}

function verifyWalletProof(req: NextRequest, promptId: string, walletAddress: string) {
    const publicKeyHex = req.headers.get("X-Wallet-Public-Key");
    const signatureHex = req.headers.get("X-Wallet-Signature");
    const signedMessage = req.headers.get("X-Wallet-Message");
    const timestamp = req.headers.get("X-Wallet-Timestamp");
    const nonce = req.headers.get("X-Wallet-Nonce");

    if (!publicKeyHex || !signatureHex || !signedMessage || !timestamp || !nonce) {
        return {
            ok: false,
            error: "Missing wallet proof headers",
            requiredMessage: getRequiredApiMessageFormat(promptId, walletAddress),
            nonce: null,
        };
    }

    const normalizedAddress = AccountAddress.fromString(walletAddress).toString();
    const freshnessError = validateWalletProofFreshness(timestamp, nonce);
    const requiredMessage = getRequiredApiMessage(
        promptId,
        normalizedAddress,
        timestamp,
        nonce
    );

    if (freshnessError) {
        return {
            ok: false,
            error: freshnessError,
            requiredMessage,
            nonce: null,
        };
    }

    if (signedMessage !== requiredMessage) {
        return {
            ok: false,
            error: "Wallet proof message does not match this prompt request",
            requiredMessage,
            nonce: null,
        };
    }

    const publicKey = new Ed25519PublicKey(publicKeyHex);
    const signature = new Ed25519Signature(signatureHex);
    const derivedAddress = AuthenticationKey.fromPublicKey({ publicKey })
        .derivedAddress()
        .toString();

    if (derivedAddress !== normalizedAddress) {
        return {
            ok: false,
            error: "Wallet proof public key does not match wallet address",
            requiredMessage,
            nonce: null,
        };
    }

    const valid = publicKey.verifySignature({
        message: new TextEncoder().encode(requiredMessage),
        signature,
    });

    return {
        ok: valid,
        error: valid ? null : "Invalid wallet proof signature",
        requiredMessage,
        nonce,
    };
}

type PromptRouteContext = {
    params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, { params }: PromptRouteContext) {
    const rateLimit = checkRateLimit(req.headers, {
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

    // 1. Extract wallet address from header
    const walletAddress = req.headers.get("X-Wallet-Address");
    if (!walletAddress) {
        return NextResponse.json(
            { error: "Missing X-Wallet-Address header" },
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
        const proof = verifyWalletProof(req, promptId, normalizedWalletAddress);
        if (!proof.ok) {
            return NextResponse.json(
                {
                    error: proof.error,
                    required_message: proof.requiredMessage,
                },
                { status: 401, headers: rateLimitHeaders(rateLimit) }
            );
        }

        if (
            proof.nonce &&
            !consumeWalletProofNonce(normalizedWalletAddress, promptId, proof.nonce)
        ) {
            return NextResponse.json(
                { error: "Wallet proof nonce has already been used" },
                { status: 401, headers: rateLimitHeaders(rateLimit) }
            );
        }

        // 2. Check on-chain access
        const accessGranted = await hasAccess(normalizedWalletAddress, promptId);
        if (!accessGranted) {
            return NextResponse.json(
                {
                    error: "Payment required. Unlock this prompt first.",
                    unlock_url: `/prompt/${promptId}`,
                    prompt_id: promptId,
                },
                { status: 402, headers: rateLimitHeaders(rateLimit) }
            );
        }

        // 3. Get blob ID from on-chain metadata
        const blobId = await getPromptBlobId(promptId);
        if (!blobId) {
            return NextResponse.json(
                { error: "Prompt blob not found" },
                { status: 404, headers: rateLimitHeaders(rateLimit) }
            );
        }

        // 4. Read blob from Shelby RPC
        const content = await shelbyService.readPrompt(blobId);

        // 5. Return content
        return NextResponse.json(
            {
                prompt_id: promptId,
                content,
                timestamp: Date.now(),
            },
            { headers: rateLimitHeaders(rateLimit) }
        );
    } catch (error: unknown) {
        console.error("API error:", error);
        return NextResponse.json(
            {
                error: isRateLimitError(error)
                    ? "Aptos is rate limiting requests. Please retry in a few seconds."
                    : "Unable to load prompt content right now.",
            },
            {
                status: isRateLimitError(error) ? 429 : 500,
                headers: rateLimitHeaders(rateLimit),
            }
        );
    }
}
