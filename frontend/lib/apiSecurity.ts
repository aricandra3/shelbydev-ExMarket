type RateLimitBucket = {
    count: number;
    resetAt: number;
};

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

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function cleanupExpiredBuckets(now: number) {
    if (rateLimitBuckets.size < 1_000) return;

    Array.from(rateLimitBuckets.entries()).forEach(([key, bucket]) => {
        if (bucket.resetAt <= now) {
            rateLimitBuckets.delete(key);
        }
    });
}

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

export function checkRateLimit(
    headers: Headers,
    { namespace, limit, windowMs }: RateLimitOptions
): RateLimitResult {
    const now = Date.now();
    cleanupExpiredBuckets(now);

    const key = `${namespace}:${getClientIdentifier(headers)}`;
    let bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        rateLimitBuckets.set(key, bucket);
    }

    if (bucket.count >= limit) {
        return {
            limited: true,
            limit,
            remaining: 0,
            resetAt: bucket.resetAt,
            retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        };
    }

    bucket.count += 1;

    return {
        limited: false,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        resetAt: bucket.resetAt,
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
