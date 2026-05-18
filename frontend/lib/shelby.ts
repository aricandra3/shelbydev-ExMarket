/// Shelby SDK integration — blob upload and read operations
/// Docs: https://docs.shelby.xyz/sdks/typescript
/// Networks: https://docs.shelby.xyz/protocol/architecture/networks
///
/// ACE integration pattern:
///   - Creator: aceEncrypt(content) → putEncryptedBlob({ ciphertext, domain })
///   - Buyer:   readEncryptedBlob(blobId) → aceDecrypt(ciphertext, domain, proof)

import {
    ShelbyClient,
    ShelbyBlobClient,
    generateCommitments,
    ClayErasureCodingProvider,
    createDefaultErasureCodingProvider,
    defaultErasureCodingConfig,
    expectedTotalChunksets,
} from "@shelby-protocol/sdk/browser";

import { NETWORK } from "./constants";

type PutBlobProgress = {
    phase: "starting" | "uploading" | "finalizing" | "complete";
    uploadedBytes: number;
    totalBytes: number;
};

const SHELBY_COMPLETE_TIMEOUT_MS = 60_000;

// ─────────────────────────────────────────────────
// Shelby Client
// ─────────────────────────────────────────────────

const shelbyClient = new ShelbyClient({
    network: NETWORK === "shelbynet" ? ("shelbynet" as any) : ("testnet" as any),
});

export {
    shelbyClient,
    ShelbyBlobClient,
    generateCommitments,
    ClayErasureCodingProvider,
    createDefaultErasureCodingProvider,
    defaultErasureCodingConfig,
    expectedTotalChunksets,
};

function parseBlobId(blobId: string) {
    const trimmedBlobId = blobId.trim();
    if (!trimmedBlobId || trimmedBlobId === "pending") {
        throw new Error(
            "Prompt content is not ready yet. The encrypted Shelby blob has not been linked on-chain."
        );
    }

    const [account, ...nameParts] = trimmedBlobId.split("/");
    const blobName = nameParts.join("/").trim();

    if (!account || !blobName) {
        throw new Error(
            "Prompt content is unavailable because its Shelby blob reference is incomplete."
        );
    }

    return { account, blobName };
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

async function uploadEncryptedBlobWithServerKey(
    address: string,
    blobName: string,
    ciphertextHex: string,
    domainHex: string,
    onProgress?: (progress: PutBlobProgress) => void
) {
    const totalBytes = new TextEncoder().encode(
        JSON.stringify({ ciphertextHex, domainHex })
    ).length;

    onProgress?.({
        phase: "starting",
        uploadedBytes: 0,
        totalBytes,
    });

    onProgress?.({
        phase: "uploading",
        uploadedBytes: 0,
        totalBytes,
    });

    onProgress?.({
        phase: "finalizing",
        uploadedBytes: totalBytes,
        totalBytes,
    });

    const response = await fetchWithTimeout(
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                account: address,
                blobName,
                ciphertextHex,
                domainHex,
            }),
        },
        SHELBY_COMPLETE_TIMEOUT_MS,
        "Uploading encrypted content to Shelby"
    );

    if (!response.ok) {
        throw new Error(
            `Shelby upload failed. status: ${response.status}, body: ${await readErrorBody(response)}`
        );
    }

    onProgress?.({
        phase: "complete",
        uploadedBytes: totalBytes,
        totalBytes,
    });
}

// ─────────────────────────────────────────────────
// Shelby Service
// ─────────────────────────────────────────────────

export const shelbyService = {
    /**
     * Upload a prompt string as a blob to Shelby storage.
     * Uses rpc.putBlob to avoid needing a raw private key —
     * L1 registration is handled via wallet on the client side.
     */
    async putBlobDirectly(content: string, address: string, blobName: string): Promise<void> {
        const blobData = new TextEncoder().encode(content);

        await shelbyClient.rpc.putBlob({
            account: address,
            blobName,
            blobData,
        });
    },

    /**
     * Read a prompt blob from Shelby storage.
     * blobId format: "<account>/<blobName>"
     */
    async readPrompt(blobId: string): Promise<string> {
        try {
            if (blobId.startsWith("dummy_blob")) {
                return "This is a dummy prompt content (upload failed or bypassed for testing).";
            }

            const { account, blobName } = parseBlobId(blobId);

            const result = await shelbyClient.download({ account, blobName });
            return await new Response(result.readable).text();
        } catch (e) {
            console.error("Failed to read blob", e);
            return "Failed to load content from Shelby.";
        }
    },
    /**
     * Upload an ACE-encrypted prompt blob to Shelby.
     * Stores a JSON payload: { ciphertextHex, domainHex }
     *
     * - ciphertextHex: hex-serialized ACE Ciphertext
     * - domainHex:     hex-serialized ACE FullDecryptionDomain (contractId + domain)
     *
     * Call aceEncrypt() first to produce these values.
     */
    async putEncryptedBlob(
        ciphertextHex: string,
        domainHex: string,
        address: string,
        blobName: string,
        onProgress?: (progress: PutBlobProgress) => void
    ): Promise<void> {
        await uploadEncryptedBlobWithServerKey(
            address,
            blobName,
            ciphertextHex,
            domainHex,
            onProgress
        );
    },

    /**
     * Read an ACE-encrypted prompt blob from Shelby.
     * blobId format: "<account>/<blobName>"
     *
     * Returns { ciphertextHex, domainHex } ready to pass to aceDecrypt().
     */
    async readEncryptedBlob(blobId: string): Promise<{
        ciphertextHex: string;
        domainHex: string;
    }> {
        const { account, blobName } = parseBlobId(blobId);

        const result = await shelbyClient.download({ account, blobName });
        const text = await new Response(result.readable).text();

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
