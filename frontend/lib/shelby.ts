/// Browser-side Shelby helpers.
/// Docs: https://docs.shelby.xyz/sdks/typescript
///
/// Neither uploads nor reads talk to Shelby directly from here: both go through
/// our API routes so the project's SHELBY_API_KEY stays server-side and the
/// storage and egress it pays for stay accounted for.
///
/// ACE integration pattern:
///   - Creator: aceEncrypt(content) → startEncryptedBlobUpload + finalizeUpload
///   - Buyer:   readEncryptedBlob(promptId) → aceDecrypt(ciphertext, domain, proof)
///
/// What is still imported from the SDK is the erasure-coding maths the create
/// flow needs to compute a blob's commitments before registering it on L1.

import {
    ShelbyBlobClient,
    SHELBY_DEPLOYER,
    generateCommitments,
    ClayErasureCodingProvider,
    createDefaultErasureCodingProvider,
    defaultErasureCodingConfig,
    expectedTotalChunksets,
} from "@shelby-protocol/sdk/browser";

import { SHELBY_CONTRACT_ADDRESS } from "./constants";

// The SDK decides where blobs are registered; our constant only mirrors it so
// server code can read blob metadata without importing a browser bundle. If a
// SDK upgrade moves the deployer, that mirror is silently wrong — and blobs
// would look like they do not exist. Fail loudly instead.
if (SHELBY_DEPLOYER.toString().toLowerCase() !== SHELBY_CONTRACT_ADDRESS.toLowerCase()) {
    console.error(
        `Shelby deployer mismatch: SDK registers blobs at ${SHELBY_DEPLOYER}, ` +
            `but SHELBY_CONTRACT_ADDRESS is ${SHELBY_CONTRACT_ADDRESS}. ` +
            "Update lib/constants.ts — blob metadata reads will return nothing until you do."
    );
}

const SHELBY_COMPLETE_TIMEOUT_MS = 180_000;

export {
    ShelbyBlobClient,
    generateCommitments,
    ClayErasureCodingProvider,
    createDefaultErasureCodingProvider,
    defaultErasureCodingConfig,
    expectedTotalChunksets,
};

/// Signs the proof the upload endpoint requires. The wallet returns the exact
/// string it signed (`fullMessage`, usually wrapped in its own preamble), so we
/// forward that rather than what we asked for.
export type UploadSigner = (message: string) => Promise<{
    fullMessage: string;
    signature: string;
    publicKey: string;
}>;

const UPLOAD_PROOF_ACTION = "ExMarket Shelby upload";

function randomNonce() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function createUploadProof(
    sign: UploadSigner,
    account: string,
    blobName: string
): Promise<Record<string, string>> {
    const timestamp = String(Date.now());
    const nonce = randomNonce();
    const message = [
        UPLOAD_PROOF_ACTION,
        `Account: ${account}`,
        `Blob: ${blobName}`,
        `Timestamp: ${timestamp}`,
        `Nonce: ${nonce}`,
    ].join("\n");

    const signed = await sign(message);

    // The signed message is multi-line; HTTP header values cannot hold newlines,
    // so it travels base64-encoded and the server verifies the decoded bytes.
    const messageBytes = new TextEncoder().encode(signed.fullMessage);
    let binary = "";
    messageBytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    const encodedMessage = btoa(binary);

    return {
        "X-Wallet-Public-Key": signed.publicKey,
        "X-Wallet-Signature": signed.signature,
        "X-Wallet-Message": encodedMessage,
        "X-Wallet-Timestamp": timestamp,
        "X-Wallet-Nonce": nonce,
    };
}

async function fetchWithTimeout(init: RequestInit, timeoutMs: number, label: string) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch("/api/v1/shelby/upload", {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(`${label} timed out. Shelby RPC did not respond in time.`);
        }

        throw error;
    } finally {
        globalThis.clearTimeout(timeout);
    }
}

async function readErrorBody(response: Response) {
    try {
        return await response.text();
    } catch {
        return "Could not read error body";
    }
}

const SHELBY_START_TIMEOUT_MS = 60_000;

// ─────────────────────────────────────────────────
// Shelby Service
// ─────────────────────────────────────────────────

export const shelbyService = {
    /**
     * Transfer an ACE-encrypted prompt blob to Shelby, without finalizing it.
     * Stores a JSON payload: { ciphertextHex, domainHex }
     *
     * - ciphertextHex: hex-serialized ACE Ciphertext
     * - domainHex:     hex-serialized ACE FullDecryptionDomain (contractId + domain)
     *
     * Call aceEncrypt() first to produce these values, then finalizeUpload()
     * with the returned uploadId. The split exists because finalizing takes
     * ~10s of Shelby-side work, and the caller can spend that time collecting
     * the publish signature instead of watching a spinner.
     */
    async startEncryptedBlobUpload(
        ciphertextHex: string,
        domainHex: string,
        address: string,
        blobName: string,
        proofHeaders: Record<string, string>
    ): Promise<{ uploadId: string }> {
        const response = await fetchWithTimeout(
            {
                method: "POST",
                headers: { "Content-Type": "application/json", ...proofHeaders },
                body: JSON.stringify({
                    phase: "start",
                    account: address,
                    blobName,
                    ciphertextHex,
                    domainHex,
                }),
            },
            SHELBY_START_TIMEOUT_MS,
            "Uploading encrypted content to Shelby"
        );

        if (!response.ok) {
            throw new Error(
                `Shelby upload failed. status: ${response.status}, body: ${await readErrorBody(response)}`
            );
        }

        const { uploadId } = (await response.json()) as { uploadId?: string };
        if (!uploadId) {
            throw new Error("Shelby upload did not return an upload id.");
        }

        return { uploadId };
    },

    /**
     * Finalize a transferred blob. This is the slow phase — Shelby erasure-codes
     * the payload and distributes it to storage providers.
     */
    async finalizeUpload(
        uploadId: string,
        address: string,
        blobName: string,
        proofHeaders: Record<string, string>
    ): Promise<void> {
        const response = await fetchWithTimeout(
            {
                method: "POST",
                headers: { "Content-Type": "application/json", ...proofHeaders },
                body: JSON.stringify({
                    phase: "complete",
                    uploadId,
                    account: address,
                    blobName,
                }),
            },
            SHELBY_COMPLETE_TIMEOUT_MS,
            "Finalizing Shelby upload"
        );

        if (!response.ok) {
            throw new Error(
                `Shelby finalize failed. status: ${response.status}, body: ${await readErrorBody(response)}`
            );
        }
    },

    /**
     * Read an ACE-encrypted prompt blob for a listing.
     *
     * Goes through /api/v1/shelby/blob rather than hitting Shelby directly, so
     * the read is billed to this project's Shelby API key instead of being
     * anonymous. The proxy resolves the blob path from on-chain metadata, which
     * is why this takes a promptId and not a blob path.
     *
     * Returns { ciphertextHex, domainHex } ready to pass to aceDecrypt().
     */
    async readEncryptedBlob(promptId: string): Promise<{
        ciphertextHex: string;
        domainHex: string;
    }> {
        const response = await fetch(
            `/api/v1/shelby/blob?promptId=${encodeURIComponent(promptId)}`,
            { cache: "no-store" }
        );

        if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new Error(
                body && typeof body.error === "string"
                    ? body.error
                    : `Shelby read failed with status ${response.status}.`
            );
        }

        const text = await response.text();

        let parsed: { ciphertextHex: string; domainHex: string };
        try {
            parsed = JSON.parse(text) as { ciphertextHex: string; domainHex: string };
        } catch {
            // Blob is plain text (uploaded before ACE encryption was added)
            throw new Error(
                "This prompt was created before encryption was added — its content cannot be decrypted. " +
                "The creator must re-upload it."
            );
        }

        if (!parsed.ciphertextHex || !parsed.domainHex) {
            throw new Error("Blob is missing ciphertextHex or domainHex — data may be corrupt.");
        }

        return { ciphertextHex: parsed.ciphertextHex, domainHex: parsed.domainHex };

    },
};
