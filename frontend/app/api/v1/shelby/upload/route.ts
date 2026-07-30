/// API Route: Server-side Shelby encrypted blob upload
/// Keeps SHELBY_API_KEY private while avoiding anonymous RPC rate limits.

import { NextRequest, NextResponse } from "next/server";
import { SHELBY_RPC_URL } from "@/lib/constants";
import { checkRateLimit, rateLimitHeaders } from "@/lib/apiSecurity";

export const dynamic = "force-dynamic";

const SHELBY_API_KEY = process.env.SHELBY_API_KEY || "";
const SHELBY_START_TIMEOUT_MS = 20_000;
const SHELBY_PART_TIMEOUT_MS = 30_000;
const SHELBY_COMPLETE_TIMEOUT_MS = 60_000;
const MAX_ENCRYPTED_PAYLOAD_BYTES = 2_000_000;
const MIN_SHELBY_PART_SIZE_BYTES = 1_048_576;
const SHELBY_START_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 12_000, 16_000];
const SHELBY_COMPLETE_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 12_000, 16_000];

type ShelbyUploadBody = {
    account?: unknown;
    blobName?: unknown;
    ciphertextHex?: unknown;
    domainHex?: unknown;
};

function buildRpcUrl(path: string) {
    const normalizedBase = SHELBY_RPC_URL.endsWith("/")
        ? SHELBY_RPC_URL
        : `${SHELBY_RPC_URL}/`;
    return new URL(path.replace(/^\//, ""), normalizedBase);
}

function getRpcHeaders(contentType: string): HeadersInit {
    return {
        "Content-Type": contentType,
        ...(SHELBY_API_KEY ? { Authorization: `Bearer ${SHELBY_API_KEY}` } : {}),
    };
}

async function fetchWithTimeout(
    url: URL,
    init: RequestInit,
    timeoutMs: number,
    label: string
) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(`${label} timed out. Shelby RPC did not respond in time.`);
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function readErrorBody(response: Response) {
    try {
        return await response.text();
    } catch {
        return "Could not read error body";
    }
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecoverableStartError(status: number, body: string) {
    return (
        status === 429 ||
        status >= 500 ||
        /not been registered|rate limit|temporarily|try again/i.test(body)
    );
}

function isRecoverableCompleteError(status: number, body: string) {
    return (
        status === 429 ||
        status >= 500 ||
        /internal server error|temporarily|try again|timeout|rate limit/i.test(body)
    );
}

/// Per-phase timings for one upload, logged on completion. The wall-clock cost
/// of publishing sits almost entirely in here, so it should never be a guess.
type UploadTimings = {
    startMs: number;
    startAttempts: number;
    partMs: number;
    completeMs: number;
    completeAttempts: number;
};

function logUploadTimings(t: UploadTimings, payloadBytes: number, partSize: number) {
    const total = t.startMs + t.partMs + t.completeMs;
    console.info(
        `Shelby upload: total ${total}ms ` +
            `(start ${t.startMs}ms/${t.startAttempts} attempt(s), ` +
            `part ${t.partMs}ms, complete ${t.completeMs}ms/${t.completeAttempts} attempt(s)) ` +
            `payload=${payloadBytes}B declaredPartSize=${partSize}B`
    );
}

async function startMultipartUpload(
    account: string,
    blobName: string,
    partSize: number,
    timings: UploadTimings
) {
    for (let attempt = 0; attempt <= SHELBY_START_RETRY_DELAYS_MS.length; attempt += 1) {
        timings.startAttempts = attempt + 1;
        const response = await fetchWithTimeout(
            buildRpcUrl("/v1/multipart-uploads"),
            {
                method: "POST",
                headers: getRpcHeaders("application/json"),
                body: JSON.stringify({
                    rawAccount: account,
                    rawBlobName: blobName,
                    rawPartSize: partSize,
                }),
            },
            SHELBY_START_TIMEOUT_MS,
            "Starting Shelby upload"
        );

        if (response.ok) return { response, errorBody: "" };

        const errorBody = await readErrorBody(response);
        const shouldRetry =
            attempt < SHELBY_START_RETRY_DELAYS_MS.length &&
            isRecoverableStartError(response.status, errorBody);

        if (!shouldRetry) return { response, errorBody };

        await sleep(SHELBY_START_RETRY_DELAYS_MS[attempt]);
    }

    throw new Error("Failed to start Shelby upload after retry.");
}

async function completeMultipartUpload(uploadId: string, timings: UploadTimings) {
    for (let attempt = 0; attempt <= SHELBY_COMPLETE_RETRY_DELAYS_MS.length; attempt += 1) {
        timings.completeAttempts = attempt + 1;
        const response = await fetchWithTimeout(
            buildRpcUrl(`/v1/multipart-uploads/${uploadId}/complete`),
            {
                method: "POST",
                headers: getRpcHeaders("application/json"),
            },
            SHELBY_COMPLETE_TIMEOUT_MS,
            "Finalizing Shelby upload"
        );

        if (response.ok) return { response, errorBody: "" };

        const errorBody = await readErrorBody(response);
        const shouldRetry =
            attempt < SHELBY_COMPLETE_RETRY_DELAYS_MS.length &&
            isRecoverableCompleteError(response.status, errorBody);

        if (!shouldRetry) return { response, errorBody };

        await sleep(SHELBY_COMPLETE_RETRY_DELAYS_MS[attempt]);
    }

    throw new Error("Failed to finalize Shelby upload after retry.");
}

function isHex(value: string) {
    return /^[a-fA-F0-9]+$/.test(value);
}

function validateUploadBody(body: ShelbyUploadBody) {
    if (
        typeof body.account !== "string" ||
        typeof body.blobName !== "string" ||
        typeof body.ciphertextHex !== "string" ||
        typeof body.domainHex !== "string"
    ) {
        return "Invalid Shelby upload request.";
    }

    if (!/^0x[a-fA-F0-9]{1,64}$/.test(body.account)) {
        return "Invalid Shelby account address.";
    }

    if (!body.blobName.trim() || body.blobName.length > 180) {
        return "Invalid Shelby blob name.";
    }

    if (!isHex(body.ciphertextHex) || !isHex(body.domainHex)) {
        return "Encrypted Shelby payload must be hex encoded.";
    }

    const payloadBytes = new TextEncoder().encode(
        JSON.stringify({
            ciphertextHex: body.ciphertextHex,
            domainHex: body.domainHex,
        })
    );

    if (payloadBytes.length > MAX_ENCRYPTED_PAYLOAD_BYTES) {
        return "Encrypted Shelby payload is too large.";
    }

    return null;
}

export async function POST(req: NextRequest) {
    const rateLimit = checkRateLimit(req.headers, {
        namespace: "api-shelby-upload",
        limit: 30,
        windowMs: 60_000,
    });

    if (rateLimit.limited) {
        return NextResponse.json(
            { error: "Too many Shelby upload requests. Please retry shortly." },
            { status: 429, headers: rateLimitHeaders(rateLimit) }
        );
    }

    let body: ShelbyUploadBody;
    try {
        body = (await req.json()) as ShelbyUploadBody;
    } catch {
        return NextResponse.json(
            { error: "Invalid Shelby upload request." },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const validationError = validateUploadBody(body);
    if (validationError) {
        return NextResponse.json(
            { error: validationError },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const account = body.account as string;
    const blobName = body.blobName as string;
    const payloadBytes = new TextEncoder().encode(
        JSON.stringify({
            ciphertextHex: body.ciphertextHex,
            domainHex: body.domainHex,
        })
    );

    const timings: UploadTimings = {
        startMs: 0,
        startAttempts: 0,
        partMs: 0,
        completeMs: 0,
        completeAttempts: 0,
    };

    try {
        const partSize = Math.max(
            payloadBytes.length,
            MIN_SHELBY_PART_SIZE_BYTES
        );
        const startedAt = Date.now();
        const { response: startResponse, errorBody: startErrorBody } =
            await startMultipartUpload(account, blobName, partSize, timings);
        timings.startMs = Date.now() - startedAt;

        if (!startResponse.ok) {
            return NextResponse.json(
                {
                    error: `Failed to start Shelby upload. partSize: ${partSize}, status: ${startResponse.status}, body: ${startErrorBody}`,
                },
                { status: startResponse.status, headers: rateLimitHeaders(rateLimit) }
            );
        }

        const { uploadId } = (await startResponse.json()) as { uploadId?: string };
        if (!uploadId) throw new Error("Shelby upload did not return an upload id.");

        const partStartedAt = Date.now();
        const partResponse = await fetchWithTimeout(
            buildRpcUrl(`/v1/multipart-uploads/${uploadId}/parts/0`),
            {
                method: "PUT",
                headers: getRpcHeaders("application/octet-stream"),
                body: payloadBytes,
            },
            SHELBY_PART_TIMEOUT_MS,
            "Uploading encrypted content to Shelby"
        );
        timings.partMs = Date.now() - partStartedAt;

        if (!partResponse.ok) {
            return NextResponse.json(
                {
                    error: `Failed to upload Shelby part. status: ${partResponse.status}, body: ${await readErrorBody(partResponse)}`,
                },
                { status: partResponse.status, headers: rateLimitHeaders(rateLimit) }
            );
        }

        const completeStartedAt = Date.now();
        const { response: completeResponse, errorBody: completeErrorBody } =
            await completeMultipartUpload(uploadId, timings);
        timings.completeMs = Date.now() - completeStartedAt;
        logUploadTimings(timings, payloadBytes.length, partSize);

        if (!completeResponse.ok) {
            return NextResponse.json(
                {
                    error: `Failed to finalize Shelby upload. uploadId: ${uploadId}, status: ${completeResponse.status}, body: ${completeErrorBody}`,
                },
                { status: completeResponse.status, headers: rateLimitHeaders(rateLimit) }
            );
        }

        return NextResponse.json(
            { ok: true },
            { headers: rateLimitHeaders(rateLimit) }
        );
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Shelby upload failed.";
        return NextResponse.json(
            { error: message },
            { status: 502, headers: rateLimitHeaders(rateLimit) }
        );
    }
}
