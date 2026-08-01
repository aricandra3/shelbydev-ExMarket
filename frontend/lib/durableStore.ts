/// Durable state for serverless API protections.
///
/// Production uses Upstash Redis when its standard REST credentials are set.
/// Local development intentionally falls back to memory so contributors can run
/// the app without provisioning infrastructure. The fallback is never a
/// substitute for Redis in a multi-instance deployment.

import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const memory = new Map<string, { value: string; expiresAt: number }>();
let warnedAboutFallback = false;

function cleanupMemory(now: number) {
    if (memory.size < 1_000) return;

    for (const [key, entry] of Array.from(memory.entries())) {
        if (entry.expiresAt <= now) memory.delete(key);
    }
}

function warnAboutFallback() {
    if (warnedAboutFallback || process.env.NODE_ENV === "test") return;
    warnedAboutFallback = true;
    console.warn(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set. " +
            "Using process-local API protection state; configure Upstash Redis before production."
    );
}

export function usingDurableStore() {
    return redis !== null;
}

export async function incrementWithExpiry(key: string, ttlSeconds: number) {
    if (redis) {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, ttlSeconds);
        const remainingTtl = await redis.ttl(key);
        return {
            count,
            ttlSeconds: remainingTtl > 0 ? remainingTtl : ttlSeconds,
        };
    }

    warnAboutFallback();
    const now = Date.now();
    cleanupMemory(now);
    const existing = memory.get(key);
    const count = existing && existing.expiresAt > now ? Number(existing.value) + 1 : 1;
    const expiresAt = existing && existing.expiresAt > now ? existing.expiresAt : now + ttlSeconds * 1_000;
    memory.set(key, {
        value: String(count),
        expiresAt,
    });
    return {
        count,
        ttlSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1_000)),
    };
}

/// Atomically reserve a key once for its TTL. Used for signed proof nonces and
/// one-response-per-transaction enforcement.
export async function reserveOnce(key: string, ttlSeconds: number) {
    if (redis) {
        const result = await redis.set(key, "1", { nx: true, ex: ttlSeconds });
        return result === "OK";
    }

    warnAboutFallback();
    const now = Date.now();
    cleanupMemory(now);
    const existing = memory.get(key);
    if (existing && existing.expiresAt > now) return false;
    memory.set(key, { value: "1", expiresAt: now + ttlSeconds * 1_000 });
    return true;
}

export async function getJson<T>(key: string): Promise<T | null> {
    if (redis) return (await redis.get<T>(key)) ?? null;

    warnAboutFallback();
    const entry = memory.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
        memory.delete(key);
        return null;
    }

    try {
        return JSON.parse(entry.value) as T;
    } catch {
        memory.delete(key);
        return null;
    }
}

export async function setJson<T>(key: string, value: T, ttlSeconds: number) {
    if (redis) {
        await redis.set(key, value, { ex: ttlSeconds });
        return;
    }

    warnAboutFallback();
    const now = Date.now();
    cleanupMemory(now);
    memory.set(key, { value: JSON.stringify(value), expiresAt: now + ttlSeconds * 1_000 });
}

export async function deleteDurableKey(key: string) {
    if (redis) {
        await redis.del(key);
        return;
    }

    memory.delete(key);
}
