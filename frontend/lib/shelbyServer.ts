/// Server-side Shelby reads.
///
/// Downloads go through here rather than straight from the browser so that
/// egress is attributed to this project's SHELBY_API_KEY instead of an
/// anonymous client — which is both what the Shelby builder program scopes
/// quota against, and how we avoid anonymous rate limits.
///
/// It also keeps the browser Shelby SDK out of server bundles: `rpc.getBlob` is
/// a plain GET, so there is nothing to import here.

import { SHELBY_RPC_URL } from "./constants";

const SHELBY_API_KEY = process.env.SHELBY_API_KEY || "";
const SHELBY_READ_TIMEOUT_MS = 30_000;

export function parseBlobId(blobId: string) {
    const trimmed = blobId.trim();
    if (!trimmed || trimmed === "pending") {
        throw new Error(
            "Prompt content is not ready yet. The encrypted Shelby blob has not been linked on-chain."
        );
    }

    const [account, ...nameParts] = trimmed.split("/");
    const blobName = nameParts.join("/").trim();

    if (!account || !blobName) {
        throw new Error(
            "Prompt content is unavailable because its Shelby blob reference is incomplete."
        );
    }

    return { account, blobName };
}

function buildBlobUrl(account: string, blobName: string) {
    const base = SHELBY_RPC_URL.endsWith("/") ? SHELBY_RPC_URL : `${SHELBY_RPC_URL}/`;
    // Keep the slashes inside a blob name — they are path structure, not separators.
    const encodedName = blobName
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

    return new URL(`v1/blobs/${account}/${encodedName}`, base);
}

export type ShelbyBlobResult = {
    bytes: ArrayBuffer;
    contentType: string;
    /// For egress accounting: this is what the project's quota gets billed for.
    byteLength: number;
    elapsedMs: number;
};

export async function fetchShelbyBlob(blobId: string): Promise<ShelbyBlobResult> {
    const { account, blobName } = parseBlobId(blobId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SHELBY_READ_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
        const response = await fetch(buildBlobUrl(account, blobName), {
            headers: SHELBY_API_KEY
                ? { Authorization: `Bearer ${SHELBY_API_KEY}` }
                : undefined,
            cache: "no-store",
            signal: controller.signal,
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(
                `Shelby read failed. status: ${response.status}, body: ${body.slice(0, 200)}`
            );
        }

        const bytes = await response.arrayBuffer();
        const elapsedMs = Date.now() - startedAt;

        console.info(
            `Shelby egress: ${bytes.byteLength}B in ${elapsedMs}ms for ${account}/${blobName}` +
                `${SHELBY_API_KEY ? "" : " (WARNING: no SHELBY_API_KEY, egress is anonymous)"}`
        );

        return {
            bytes,
            contentType:
                response.headers.get("content-type") ?? "application/octet-stream",
            byteLength: bytes.byteLength,
            elapsedMs,
        };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("Shelby read timed out.");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

/// Read a blob and parse the ACE envelope stored by the create flow.
export async function readEncryptedBlobServer(blobId: string): Promise<{
    ciphertextHex: string;
    domainHex: string;
}> {
    const { bytes } = await fetchShelbyBlob(blobId);
    const text = new TextDecoder().decode(bytes);

    let parsed: { ciphertextHex?: string; domainHex?: string };
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(
            "This prompt was created before encryption was added — its content cannot be decrypted. " +
                "The creator must re-upload it."
        );
    }

    if (!parsed.ciphertextHex || !parsed.domainHex) {
        throw new Error("Blob is missing ciphertextHex or domainHex — data may be corrupt.");
    }

    return { ciphertextHex: parsed.ciphertextHex, domainHex: parsed.domainHex };
}
