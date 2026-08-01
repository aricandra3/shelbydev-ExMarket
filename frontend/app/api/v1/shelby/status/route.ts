/// API Route: storage lifetime for listings.
///
/// A prompt sells perpetual access, but its Shelby storage is only paid up to a
/// fixed expiry. Without surfacing that date, a listing quietly stops being
/// readable a year after publishing and buyers are the ones who find out.
///
/// Accepts up to 25 prompt ids so the creator dashboard can show the whole
/// shelf in one request.

import { NextRequest, NextResponse } from "next/server";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import { getPromptBlobIdServer } from "@/lib/contractsServer";
import { getBlobStatusServer, type ShelbyBlobStatus } from "@/lib/shelbyServer";
import { isRateLimitError } from "@/lib/utils";
import { checkRateLimit, rateLimitHeaders } from "@/lib/apiSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROMPTS_PER_REQUEST = 25;
const LOOKUP_CONCURRENCY = 3;

type StatusEntry =
    | ({ promptId: string; ok: true } & ShelbyBlobStatus)
    | { promptId: string; ok: false; error: string };

async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;

    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) {
                const index = next;
                next += 1;
                results[index] = await worker(items[index]);
            }
        })
    );

    return results;
}

async function statusFor(promptId: string): Promise<StatusEntry> {
    try {
        const blobId = await getPromptBlobIdServer(promptId);
        if (!blobId || blobId === "pending") {
            return { promptId, ok: false, error: "No Shelby blob linked yet." };
        }

        const status = await getBlobStatusServer(blobId);
        if (!status) {
            // Registered on our side but absent from Shelby: either expired and
            // reaped, or the upload never finalized.
            return {
                promptId,
                ok: false,
                error: "Shelby has no metadata for this blob — it may have expired or never finished uploading.",
            };
        }

        return { promptId, ok: true, ...status };
    } catch (error: unknown) {
        console.warn(`Shelby status lookup failed for ${promptId}`, error);
        return {
            promptId,
            ok: false,
            error: isRateLimitError(error)
                ? "Rate limited while reading storage status."
                : "Could not read storage status.",
        };
    }
}

export async function GET(req: NextRequest) {
    const rateLimit = await checkRateLimit(req.headers, {
        namespace: "api-shelby-status",
        limit: 60,
        windowMs: 60_000,
    });

    if (rateLimit.limited) {
        return NextResponse.json(
            { error: "Too many storage status requests. Please retry shortly." },
            { status: 429, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const raw = req.nextUrl.searchParams.get("promptIds");
    if (!raw) {
        return NextResponse.json(
            { error: "Missing promptIds" },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const requested = raw.split(",").map((id) => id.trim()).filter(Boolean);
    if (requested.length === 0 || requested.length > MAX_PROMPTS_PER_REQUEST) {
        return NextResponse.json(
            { error: `Pass 1 to ${MAX_PROMPTS_PER_REQUEST} prompt ids.` },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    let promptIds: string[];
    try {
        promptIds = requested.map((id) => AccountAddress.fromString(id).toString());
    } catch {
        return NextResponse.json(
            { error: "One of the prompt ids is not a valid address." },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const statuses = await mapWithConcurrency(
        promptIds,
        LOOKUP_CONCURRENCY,
        statusFor
    );

    return NextResponse.json(
        { statuses },
        {
            headers: {
                ...rateLimitHeaders(rateLimit),
                "Cache-Control": "private, max-age=60",
            },
        }
    );
}
