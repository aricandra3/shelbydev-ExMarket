/// API Route: Server-side transaction confirmation
/// Lets client pages avoid bundling the Aptos SDK just to wait for a tx.

import { NextRequest, NextResponse } from "next/server";
import { waitForTransactionServer } from "@/lib/aptosServer";
import { MODULES } from "@/lib/constants";
import { isRateLimitError } from "@/lib/utils";
import { checkRateLimit, rateLimitHeaders } from "@/lib/apiSecurity";

export const dynamic = "force-dynamic";

/// Pull the prompt_id straight out of the PromptRegistered event so the
/// creator flow never has to guess which listing it just created.
function extractRegisteredPromptId(transaction: unknown): string | null {
    const events = (transaction as { events?: unknown }).events;
    if (!Array.isArray(events)) return null;

    const registered = events.find(
        (event) =>
            (event as { type?: unknown }).type ===
            `${MODULES.PROMPT_REGISTRY}::PromptRegistered`
    );
    const promptId = (registered as { data?: { prompt_id?: unknown } } | undefined)
        ?.data?.prompt_id;

    return typeof promptId === "string" ? promptId : null;
}

type TransactionWaitBody = {
    transactionHash?: unknown;
    options?: unknown;
};

function isTransactionHash(value: unknown): value is string {
    return typeof value === "string" && /^0x[a-fA-F0-9]{16,}$/.test(value);
}

function parseOptions(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return {
        checkSuccess:
            typeof (value as { checkSuccess?: unknown }).checkSuccess === "boolean"
                ? (value as { checkSuccess: boolean }).checkSuccess
                : undefined,
        waitForIndexer:
            typeof (value as { waitForIndexer?: unknown }).waitForIndexer === "boolean"
                ? (value as { waitForIndexer: boolean }).waitForIndexer
                : undefined,
    };
}

export async function POST(req: NextRequest) {
    const rateLimit = await checkRateLimit(req.headers, {
        namespace: "api-transaction",
        limit: 90,
        windowMs: 60_000,
    });

    if (rateLimit.limited) {
        return NextResponse.json(
            { error: "Too many transaction confirmation requests. Please retry shortly." },
            { status: 429, headers: rateLimitHeaders(rateLimit) }
        );
    }

    let body: TransactionWaitBody;
    try {
        body = (await req.json()) as TransactionWaitBody;
    } catch {
        return NextResponse.json(
            { error: "Invalid transaction request." },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    if (!isTransactionHash(body.transactionHash)) {
        return NextResponse.json(
            { error: "Invalid transaction hash." },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    try {
        const transaction = await waitForTransactionServer(
            body.transactionHash,
            parseOptions(body.options)
        );

        return NextResponse.json(
            {
                transactionHash: body.transactionHash,
                promptId: extractRegisteredPromptId(transaction),
            },
            { headers: rateLimitHeaders(rateLimit) }
        );
    } catch (error: unknown) {
        console.error("Transaction confirmation failed:", error);
        return NextResponse.json(
            {
                error: isRateLimitError(error)
                    ? "Aptos is rate limiting transaction confirmation. Please retry in a moment."
                    : "Transaction confirmation failed.",
            },
            {
                status: isRateLimitError(error) ? 429 : 502,
                headers: rateLimitHeaders(rateLimit),
            }
        );
    }
}
