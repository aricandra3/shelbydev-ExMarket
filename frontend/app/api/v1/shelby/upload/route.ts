/// API Route: Server-side Shelby encrypted blob upload
/// Keeps SHELBY_API_KEY private while avoiding anonymous RPC rate limits.

import { NextRequest, NextResponse } from "next/server";
import { SHELBY_RPC_URL } from "@/lib/constants";
import { checkRateLimit, rateLimitHeaders } from "@/lib/apiSecurity";
import { deleteDurableKey, getJson, setJson } from "@/lib/durableStore";
import { verifyWalletProof } from "@/lib/walletProof";

/// Every upload spends our Shelby storage quota under the caller's account, so
/// the caller has to prove they own that account. Without this, anyone who
/// knows the endpoint can write blobs on our key.
const UPLOAD_PROOF_ACTION = "ExMarket Shelby upload";

async function requireUploadProof(
    req: NextRequest,
    account: string,
    blobName: string,
    phase: UploadPhase
) {
    return verifyWalletProof({
        headers: req.headers,
        walletAddress: account,
        action: UPLOAD_PROOF_ACTION,
        bindings: [
            ["Account", account],
            ["Blob", blobName],
        ],
        // One signature covers the whole upload session. The scope is
        // per-phase so the single nonce can be spent once by "start" and once
        // by "complete", without letting either phase be replayed.
        scope: `shelby-upload:${phase}`,
    });
}

export const dynamic = "force-dynamic";

const SHELBY_API_KEY = process.env.SHELBY_API_KEY || "";
const SHELBY_START_TIMEOUT_MS = 20_000;
const SHELBY_PART_TIMEOUT_MS = 30_000;
const SHELBY_COMPLETE_TIMEOUT_MS = 60_000;
const MAX_ENCRYPTED_PAYLOAD_BYTES = 2_000_000;
const MIN_SHELBY_PART_SIZE_BYTES = 1_048_576;
// Retries here exist for the gap between the register_blob transaction landing
// and Shelby seeing it. In practice the first attempt succeeds (measured: 1
// attempt, 1.8s), so this ladder only shapes how fast a genuine failure
// surfaces — the old 2/4/8/12/16 ladder made a permanently unregistered blob
// take 47s to report. ~15s total is plenty of slack for indexer lag.
const SHELBY_START_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];
const SHELBY_COMPLETE_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 12_000, 16_000];

/// Uploading runs in two phases so the caller can start signing the publish
/// transaction while Shelby is still finalizing:
///
///   phase "start"    → begin the multipart upload and PUT the payload. Fast
///                      (~2.3s measured), and it is what actually transfers the
///                      bytes. Returns the uploadId.
///   phase "complete" → ask Shelby to finalize. This is the slow one (~10.6s
///                      measured for an 869-byte payload) and is server-side
///                      Shelby work — erasure coding and slice distribution —
///                      that no client-side tuning affects.
type UploadPhase = "start" | "complete";

type ShelbyUploadBody = {
    phase?: unknown;
    account?: unknown;
    blobName?: unknown;
    ciphertextHex?: unknown;
    domainHex?: unknown;
    uploadId?: unknown;
};

const PENDING_UPLOAD_TTL_MS = 10 * 60 * 1000;
type PendingUpload = { account: string; blobName: string };

function pendingUploadKey(uploadId: string) {
    return `exmarket:pending-upload:${uploadId}`;
}

async function rememberPendingUpload(uploadId: string, account: string, blobName: string) {
    await setJson<PendingUpload>(
        pendingUploadKey(uploadId),
        { account, blobName },
        Math.ceil(PENDING_UPLOAD_TTL_MS / 1_000)
    );
}

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

function logStartTimings(t: UploadTimings, payloadBytes: number, partSize: number) {
    console.info(
        `Shelby upload start: ${t.startMs + t.partMs}ms ` +
            `(start ${t.startMs}ms/${t.startAttempts} attempt(s), part ${t.partMs}ms) ` +
            `payload=${payloadBytes}B declaredPartSize=${partSize}B`
    );
}

function logCompleteTimings(t: UploadTimings, uploadId: string, ok: boolean) {
    console.info(
        `Shelby upload complete: ${t.completeMs}ms/${t.completeAttempts} attempt(s) ` +
            `uploadId=${uploadId} ok=${ok}`
    );
}

/// Finalize an upload started by a previous "start" call.
async function handleComplete(
    req: NextRequest,
    body: ShelbyUploadBody,
    rateLimit: Parameters<typeof rateLimitHeaders>[0]
) {
    if (
        typeof body.uploadId !== "string" ||
        !/^[A-Za-z0-9_.:-]{8,128}$/.test(body.uploadId)
    ) {
        return NextResponse.json(
            { error: "Invalid Shelby upload id." },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    if (
        typeof body.account !== "string" ||
        !/^0x[a-fA-F0-9]{1,64}$/.test(body.account) ||
        typeof body.blobName !== "string" ||
        !body.blobName.trim()
    ) {
        return NextResponse.json(
            { error: "Invalid Shelby finalize request." },
            { status: 400, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const proof = await requireUploadProof(req, body.account, body.blobName, "complete");
    if (!proof.ok) {
        return NextResponse.json(
            { error: proof.error, required_message: proof.requiredMessage },
            { status: 401, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const uploadId = body.uploadId;
    const pending = await getJson<PendingUpload>(pendingUploadKey(uploadId));

    // Missing entries are tolerated (cold start / another instance), but a
    // mismatch against a known entry is a hard no.
    if (
        pending &&
        (pending.account !== body.account || pending.blobName !== body.blobName)
    ) {
        return NextResponse.json(
            { error: "Shelby upload id does not match this blob." },
            { status: 403, headers: rateLimitHeaders(rateLimit) }
        );
    }

    const timings: UploadTimings = {
        startMs: 0,
        startAttempts: 0,
        partMs: 0,
        completeMs: 0,
        completeAttempts: 0,
    };

    try {
        const completeStartedAt = Date.now();
        const { response, errorBody } = await completeMultipartUpload(
            uploadId,
            timings
        );
        timings.completeMs = Date.now() - completeStartedAt;
        logCompleteTimings(timings, uploadId, response.ok);

        if (!response.ok) {
            return NextResponse.json(
                {
                    error: `Failed to finalize Shelby upload. uploadId: ${uploadId}, status: ${response.status}, body: ${errorBody}`,
                },
                { status: response.status, headers: rateLimitHeaders(rateLimit) }
            );
        }

        await deleteDurableKey(pendingUploadKey(uploadId));

        return NextResponse.json(
            { ok: true, completeMs: timings.completeMs },
            { headers: rateLimitHeaders(rateLimit) }
        );
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Shelby finalize failed.";
        return NextResponse.json(
            { error: message },
            { status: 502, headers: rateLimitHeaders(rateLimit) }
        );
    }
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
    const rateLimit = await checkRateLimit(req.headers, {
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

    const phase: UploadPhase = body.phase === "complete" ? "complete" : "start";

    if (phase === "complete") {
        return handleComplete(req, body, rateLimit);
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

    const proof = await requireUploadProof(req, account, blobName, "start");
    if (!proof.ok) {
        return NextResponse.json(
            { error: proof.error, required_message: proof.requiredMessage },
            { status: 401, headers: rateLimitHeaders(rateLimit) }
        );
    }

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

        // Bytes are transferred. Hand the uploadId back so the caller can
        // finalize separately and overlap that wait with its own work.
        await rememberPendingUpload(uploadId, account, blobName);
        logStartTimings(timings, payloadBytes.length, partSize);

        return NextResponse.json(
            { uploadId, startMs: timings.startMs, partMs: timings.partMs },
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
