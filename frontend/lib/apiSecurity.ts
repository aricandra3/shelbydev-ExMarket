import { incrementWithExpiry } from "./durableStore";

type RateLimitOptions = {
    namespace: string;
    limit: number;
    windowMs: number;
};

type RateLimitResult = {
    limited: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfterSeconds: number;
};

export function getClientIdentifier(headers: Headers) {
    const forwardedFor = headers.get("x-forwarded-for");
    const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

    return (
        firstForwardedIp ||
        headers.get("x-real-ip") ||
        headers.get("cf-connecting-ip") ||
        "unknown"
    );
}

export async function checkRateLimit(
    headers: Headers,
    { namespace, limit, windowMs }: RateLimitOptions
): Promise<RateLimitResult> {
    const now = Date.now();
    const key = `${namespace}:${getClientIdentifier(headers)}`;
    const { count, ttlSeconds } = await incrementWithExpiry(
        key,
        Math.ceil(windowMs / 1_000)
    );
    const resetAt = now + ttlSeconds * 1_000;

    if (count > limit) {
        return {
            limited: true,
            limit,
            remaining: 0,
            resetAt,
            retryAfterSeconds: ttlSeconds,
        };
    }

    return {
        limited: false,
        limit,
        remaining: Math.max(0, limit - count),
        resetAt,
        retryAfterSeconds: 0,
    };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        ...(result.limited
            ? { "Retry-After": String(result.retryAfterSeconds) }
            : {}),
    };
}
