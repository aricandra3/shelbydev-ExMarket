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
import { getErrorMessage, isRateLimitError } from "@/lib/utils";

export const runtime = "edge";

function getRequiredApiMessage(promptId: string, walletAddress: string) {
    return [
        "ExMarket API prompt access",
        `Prompt: ${promptId}`,
        `Wallet: ${walletAddress}`,
    ].join("\n");
}

function verifyWalletProof(req: NextRequest, promptId: string, walletAddress: string) {
    const publicKeyHex = req.headers.get("X-Wallet-Public-Key");
    const signatureHex = req.headers.get("X-Wallet-Signature");
    const signedMessage = req.headers.get("X-Wallet-Message");

    if (!publicKeyHex || !signatureHex || !signedMessage) {
        return {
            ok: false,
            error: "Missing wallet proof headers",
            requiredMessage: getRequiredApiMessage(promptId, walletAddress),
        };
    }

    const normalizedAddress = AccountAddress.fromString(walletAddress).toString();
    const requiredMessage = getRequiredApiMessage(promptId, normalizedAddress);
    if (signedMessage !== requiredMessage) {
        return {
            ok: false,
            error: "Wallet proof message does not match this prompt request",
            requiredMessage,
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
    };
}

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    const promptId = params.id;
    if (!promptId) {
        return NextResponse.json({ error: "Missing prompt id" }, { status: 400 });
    }

    // 1. Extract wallet address from header
    const walletAddress = req.headers.get("X-Wallet-Address");
    if (!walletAddress) {
        return NextResponse.json(
            { error: "Missing X-Wallet-Address header" },
            { status: 401 }
        );
    }
    let normalizedWalletAddress: string;
    try {
        normalizedWalletAddress = AccountAddress.fromString(walletAddress).toString();
    } catch {
        return NextResponse.json(
            { error: "Invalid wallet address" },
            { status: 400 }
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
                { status: 401 }
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
                { status: 402 }
            );
        }

        // 3. Get blob ID from on-chain metadata
        const blobId = await getPromptBlobId(promptId);
        if (!blobId) {
            return NextResponse.json(
                { error: "Prompt blob not found" },
                { status: 404 }
            );
        }

        // 4. Read blob from Shelby RPC
        const content = await shelbyService.readPrompt(blobId);

        // 5. Return content
        return NextResponse.json({
            prompt_id: promptId,
            content,
            timestamp: Date.now(),
        });
    } catch (error: unknown) {
        console.error("API error:", error);
        return NextResponse.json(
            {
                error: isRateLimitError(error)
                    ? "Aptos is rate limiting requests. Please retry in a few seconds."
                    : getErrorMessage(error, "Internal server error"),
            },
            { status: isRateLimitError(error) ? 429 : 500 }
        );
    }
}
