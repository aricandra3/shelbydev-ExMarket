/// Aptos client setup and transaction helpers
/// Configured per: https://docs.shelby.xyz/sdks/typescript/acquire-api-keys

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { NETWORK, APTOS_NODE_URL, APTOS_INDEXER_URL, APTOS_API_KEY } from "./constants";

// ── Network Mapping ─────────────────────────────
// "shelbynet" is a custom Aptos network, so we use CUSTOM and provide URLs
const isCustomNetwork = NETWORK === "shelbynet";

const config = new AptosConfig({
    network: isCustomNetwork ? Network.CUSTOM : Network.TESTNET,
    fullnode: APTOS_NODE_URL,
    indexer: APTOS_INDEXER_URL,
    ...(APTOS_API_KEY
        ? {
            clientConfig: {
                API_KEY: APTOS_API_KEY,
            },
        }
        : {}),
});

export const aptosClient = new Aptos(config);

// ── View Function Helper ────────────────────────
export async function viewFunction<T>(
    functionName: string,
    args: any[] = [],
    typeArgs: string[] = []
): Promise<T> {
    const result = await aptosClient.view({
        payload: {
            function: functionName as `${string}::${string}::${string}`,
            functionArguments: args,
            typeArguments: typeArgs,
        },
    });
    return result as T;
}

// ── Transaction Builder ─────────────────────────
export function buildEntryPayload(
    functionName: string,
    args: any[],
    typeArgs: string[] = []
) {
    return {
        function: functionName as `${string}::${string}::${string}`,
        functionArguments: args,
        typeArguments: typeArgs,
    };
}
