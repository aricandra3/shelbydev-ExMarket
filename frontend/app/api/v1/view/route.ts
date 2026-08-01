/// API Route: Server-side Aptos view proxy
/// Keeps read-only contract calls off anonymous browser fullnode limits.

import { NextRequest, NextResponse } from "next/server";
import { MODULES } from "@/lib/constants";
import { viewFunctionServer } from "@/lib/aptosServer";
import { isRateLimitError } from "@/lib/utils";
import { checkRateLimit, rateLimitHeaders } from "@/lib/apiSecurity";

export const dynamic = "force-dynamic";

const ALLOWED_VIEW_FUNCTIONS = new Set([
    `${MODULES.PROMPT_REGISTRY}::get_prompt_metadata`,
    `${MODULES.PROMPT_REGISTRY}::get_prompt_price`,
    `${MODULES.PROMPT_REGISTRY}::get_prompt_blob_id`,
    `${MODULES.PROMPT_REGISTRY}::get_prompt_pricing_model`,
    `${MODULES.PROMPT_REGISTRY}::get_subscription_period_secs`,
    `${MODULES.PROMPT_REGISTRY}::get_content_hash`,
    `${MODULES.PROMPT_REGISTRY}::is_blob_linked`,
    `${MODULES.PROMPT_REGISTRY}::is_prompt_active`,
    `${MODULES.PROMPT_REGISTRY}::get_registry_config`,
    `${MODULES.PROMPT_REGISTRY}::get_creator_prompts`,
    `${MODULES.PROMPT_REGISTRY}::get_creator_total_revenue`,
    `${MODULES.REVENUE_SPLIT}::get_total_fees_collected`,
    `${MODULES.ACCESS_CONTROL}::has_access`,
    `${MODULES.ACCESS_CONTROL}::get_api_calls_remaining`,
    `${MODULES.ACCESS_CONTROL}::get_access_record`,
    `${MODULES.ACCESS_CONTROL}::get_user_unlocked_prompts`,
    `${MODULES.UNLOCK_HISTORY}::get_unlock_count`,
    `${MODULES.UNLOCK_HISTORY}::get_total_spent`,
]);

type ViewRequestBody = {
    functionName?: unknown;
    args?: unknown;
    typeArgs?: unknown;
    cache?: unknown;
};

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export async function POST(req: NextRequest) {
    const rateLimit = await checkRateLimit(req.headers, {
        namespace: "api-view",
        limit: 240,
        windowMs: 60_000,
    });

    if (rateLimit.limited) {
        return NextResponse.json(
            { error: "Too many Aptos read requests. Please retry shortly." },
            { status: 429, headers: rateLimitHeaders(rateLimit) }
        );
    }

    let body: ViewRequestBody;
    try {
        body = (await req.json()) as ViewRequestBody;
    } catch {
        return NextResponse.json(
            { error: "Invalid view request." },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    if (
        typeof body.functionName !== "string" ||
        !ALLOWED_VIEW_FUNCTIONS.has(body.functionName) ||
        !Array.isArray(body.args) ||
        (body.typeArgs !== undefined && !isStringArray(body.typeArgs)) ||
        (body.cache !== undefined && typeof body.cache !== "boolean")
    ) {
        return NextResponse.json(
            { error: "View function is not allowed." },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    try {
        const result = await viewFunctionServer(
            body.functionName,
            body.args,
            body.typeArgs ?? [],
            { cache: body.cache !== false }
        );

        return NextResponse.json(
            { result },
            { headers: rateLimitHeaders(rateLimit) }
        );
    } catch (error: unknown) {
        console.error("Aptos view proxy failed:", error);
        return NextResponse.json(
            {
                error: isRateLimitError(error)
                    ? "Aptos is rate limiting read requests. Please retry in a moment."
                    : "Aptos read request failed.",
            },
            {
                status: isRateLimitError(error) ? 429 : 502,
                headers: rateLimitHeaders(rateLimit),
            }
        );
    }
}
