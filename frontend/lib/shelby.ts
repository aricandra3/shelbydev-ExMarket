/// Shelby SDK integration — blob upload and read operations
/// Docs: https://docs.shelby.xyz/sdks/typescript
/// Networks: https://docs.shelby.xyz/protocol/architecture/networks
///
/// ACE integration pattern:
///   - Creator: aceEncrypt(content) → putEncryptedBlob({ ciphertext, domain })
///   - Buyer:   readEncryptedBlob(blobId) → aceDecrypt(ciphertext, domain, proof)

import { Network } from "@aptos-labs/ts-sdk";
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

// ─────────────────────────────────────────────────
// Shelby Client
// ─────────────────────────────────────────────────

const shelbyClient = new ShelbyClient({
    network: NETWORK === "shelbynet" ? ("shelbynet" as any) : Network.TESTNET,
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
        blobName: string
    ): Promise<void> {
        const payload = JSON.stringify({ ciphertextHex, domainHex });
        const blobData = new TextEncoder().encode(payload);

        await shelbyClient.rpc.putBlob({
            account: address,
            blobName,
            blobData,
        });
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
