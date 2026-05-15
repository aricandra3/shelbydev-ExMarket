/// API Route: Prompt content endpoint for API monetization
/// Verifies on-chain access before serving blob content

import { NextRequest, NextResponse } from "next/server";
import { hasAccess, getPromptBlobId } from "@/lib/contracts";
import { shelbyService } from "@/lib/shelby";
import { getErrorMessage, isRateLimitError } from "@/lib/utils";

export const runtime = "edge";

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
    if (!walletAddress.startsWith("0x")) {
        return NextResponse.json(
            { error: "Invalid wallet address" },
            { status: 400 }
        );
    }

    try {
        // 2. Check on-chain access
        const accessGranted = await hasAccess(walletAddress, promptId);
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
