/// Shelby SDK integration — blob upload and read operations
/// Docs: https://docs.shelby.xyz/sdks/typescript
/// Networks: https://docs.shelby.xyz/protocol/architecture/networks

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

import { SHELBY_RPC_URL, NETWORK, SHELBY_API_KEY } from "./constants";

// ─────────────────────────────────────────────────
// Shelby Client
// ─────────────────────────────────────────────────

const shelbyClient = new ShelbyClient({
    network: NETWORK === "shelbynet" ? ("shelbynet" as any) : Network.TESTNET,
    apiKey: SHELBY_API_KEY || undefined,
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

            const [account, ...nameParts] = blobId.split("/");
            const blobName = nameParts.join("/");

            const result = await shelbyClient.download({ account, blobName });
            return await new Response(result.readable).text();
        } catch (e) {
            console.error("Failed to read blob", e);
            return "Failed to load content from Shelby.";
        }
    },
};
