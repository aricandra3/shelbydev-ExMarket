/// API Route: Shelby read proxy.
///
/// Buyers used to download blobs straight from the browser, anonymously. That
/// left the project's egress quota unattributed and exposed reads to anonymous
/// rate limits. Reads now go through here with SHELBY_API_KEY.
///
/// Callers name a prompt, not a blob: the blob path is resolved from on-chain
/// metadata, so this cannot be used as a general-purpose Shelby CDN for
/// arbitrary accounts.
///
/// No wallet proof is required, on purpose. What is served is ACE ciphertext,
/// which is useless without a decryption key that only the buyer's wallet can
/// obtain — gating it again here would cost a second signature and protect
/// nothing. Abuse is bounded by the rate limit and the on-chain lookup.

import { NextRequest, NextResponse } from "next/server";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import { getPromptBlobIdServer } from "@/lib/contractsServer";
import { fetchShelbyBlob } from "@/lib/shelbyServer";
import { isRateLimitError } from "@/lib/utils";
import { checkRateLimit, rateLimitHeaders } from "@/lib/apiSecurity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const rateLimit = await checkRateLimit(req.headers, {
        namespace: "api-shelby-blob",
        limit: 60,
        windowMs: 60_000,
    });

    if (rateLimit.limited) {
        return NextResponse.json(
            { error: "Too many Shelby read requests. Please retry shortly." },
            { status: 429, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const promptIdParam = req.nextUrl.searchParams.get("promptId");
    if (!promptIdParam) {
        return NextResponse.json(
            { error: "Missing promptId" },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    let promptId: string;
    try {
        promptId = AccountAddress.fromString(promptIdParam).toString();
    } catch {
        return NextResponse.json(
            { error: "Invalid promptId" },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    let blobId: string;
    try {
        blobId = await getPromptBlobIdServer(promptId);
    } catch (error: unknown) {
        // A missing prompt surfaces as a Move "failed to borrow global
        // resource" error. Report it as a 404 instead of forwarding the raw
        // fullnode message, which names our node URL.
        console.warn(`Shelby read proxy: no metadata for ${promptId}`, error);
        return NextResponse.json(
            { error: "Prompt not found." },
            {
                status: isRateLimitError(error) ? 429 : 404,
                headers: rateLimitHeaders(rateLimit),
            }
        );
    }

    if (!blobId || blobId === "pending") {
        return NextResponse.json(
            { error: "This prompt has no Shelby blob linked yet." },
            { status: 404, headers: rateLimitHeaders(rateLimit) }
        );
    }

    try {
        const blob = await fetchShelbyBlob(blobId);

        // Content is immutable once a listing has sold, so a short cache is safe
        // and keeps repeat reads off the egress budget. Private: it is paid
        // material, even though encrypted.
        return new NextResponse(blob.bytes, {
            headers: {
                ...rateLimitHeaders(rateLimit),
                "Content-Type": blob.contentType,
                "Cache-Control": "private, max-age=300",
                "X-Shelby-Bytes": String(blob.byteLength),
                "X-Shelby-Elapsed-Ms": String(blob.elapsedMs),
            },
        });
    } catch (error: unknown) {
        // Upstream detail stays in our logs. Clients get the reason without the
        // node URLs and status bodies that came with it.
        console.error(`Shelby read proxy failed for ${blobId}:`, error);

        return NextResponse.json(
            {
                error: isRateLimitError(error)
                    ? "Shelby is rate limiting reads. Please retry in a moment."
                    : "Could not read this prompt's content from Shelby right now.",
            },
            {
                status: isRateLimitError(error) ? 429 : 502,
                headers: rateLimitHeaders(rateLimit),
            }
        );
    }
}
