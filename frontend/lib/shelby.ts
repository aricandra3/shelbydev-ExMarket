/// Shelby SDK integration — blob upload and read operations
/// SDK: @shelby/sdk (https://docs.shelby.xyz/sdks/typescript)
/// Networks: https://docs.shelby.xyz/protocol/architecture/networks

import { SHELBY_RPC_URL, NETWORK, SHELBY_API_KEY } from "./constants";

// ─────────────────────────────────────────────────
// Option A: Using @shelby-protocol/sdk (recommended)
// Uncomment once you have SDK access and API key
// ─────────────────────────────────────────────────
//
// import { Network } from "@aptos-labs/ts-sdk";
// import { ShelbyClient } from "@shelby-protocol/sdk/browser";
//
// const shelbyClient = new ShelbyClient({
//   network: NETWORK === "shelbynet" ? ("shelbynet" as any) : Network.TESTNET,
//   apiKey: SHELBY_API_KEY || undefined,
// });
//
// export const shelbyService = {
//   async uploadPrompt(content: string): Promise<string> {
//     const blob = new TextEncoder().encode(content);
//     const result = await shelbyClient.uploadBlob({
//       data: blob,
//       metadata: { contentType: "text/plain" },
//     });
//     return result.blobId;
//   },
//
//   async readPrompt(blobId: string): Promise<string> {
//     const result = await shelbyClient.getBlob(blobId);
//     return new TextDecoder().decode(result.data);
//   },
// };

// ─────────────────────────────────────────────────
// Option B: Direct REST API (fallback while SDK bootstrapping)
// Uses Shelby RPC endpoint directly
// ─────────────────────────────────────────────────

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

const shelbyClient = new ShelbyClient({
    network: NETWORK === "shelbynet" ? ("shelbynet" as any) : Network.TESTNET,
    apiKey: SHELBY_API_KEY || undefined,
});

export { shelbyClient, ShelbyBlobClient, generateCommitments, ClayErasureCodingProvider, createDefaultErasureCodingProvider, defaultErasureCodingConfig, expectedTotalChunksets };

export const shelbyService = {
    async putBlobDirectly(content: string, address: string, blobName: string): Promise<void> {
        const blobData = new TextEncoder().encode(content);

        // Use the rpc client directly to circumvent needing a raw Account private key
        // after L1 registration is done via wallet
        await shelbyClient.rpc.putBlob({
            account: address,
            blobName,
            blobData,
        });
    },

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
