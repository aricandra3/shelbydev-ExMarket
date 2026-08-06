/// Network and contract configuration constants
/// Values sourced from: https://docs.shelby.xyz/protocol/architecture/networks

// ── Network ─────────────────────────────────────
// "testnet" → Aptos testnet + Shelby testnet
// "shelbynet" → Shelby's own dev prototype (wiped weekly)
export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "testnet") as
    | "testnet"
    | "shelbynet";

// ── Aptos Node & Indexer ────────────────────────
export const APTOS_NODE_URL =
    process.env.NEXT_PUBLIC_APTOS_NODE_URL ||
    (NETWORK === "shelbynet"
        ? "https://api.shelbynet.shelby.xyz/v1"
        : "https://api.testnet.aptoslabs.com/v1");

export const APTOS_INDEXER_URL =
    process.env.NEXT_PUBLIC_APTOS_INDEXER_URL ||
    (NETWORK === "shelbynet"
        ? "https://api.shelbynet.shelby.xyz/v1/graphql"
        : "https://api.testnet.aptoslabs.com/v1/graphql");

// ── Shelby RPC ──────────────────────────────────
export const SHELBY_RPC_URL =
    process.env.NEXT_PUBLIC_SHELBY_RPC_URL ||
    (NETWORK === "shelbynet"
        ? "https://api.shelbynet.shelby.xyz/shelby"
        : "https://api.testnet.shelby.xyz/shelby");

// ── Shelby Protocol Contract Address ────────────
//
// Deliberately not configurable. The Shelby SDK hardcodes the deployer it
// registers blobs against (`SHELBY_DEPLOYER`), and `createRegisterBlobPayload`
// uses it unless a deployer is passed explicitly — which we do not do. An env
// var here would therefore describe a different contract than the one our blobs
// actually live in.
//
// That drift already happened: this used to read 0xc63d6a5e… for testnet from
// NEXT_PUBLIC_SHELBY_CONTRACT_ADDRESS, while every blob was registered at
// 0x85fdb9a1… (verified with get_blob_metadata — the old address returns an
// empty Option for blobs that exist).
//
// Kept as a literal rather than re-exported from the SDK because this module is
// imported by server code, and the SDK entry points are environment-specific.
// lib/shelby.ts asserts it still matches SHELBY_DEPLOYER at runtime.
export const SHELBY_CONTRACT_ADDRESS =
    "0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a";

// ── Aptos chain id ──────────────────────────────
// Part of the ACE contract id: workers use it to know which chain to run
// check_permission on. Wrong value = workers query the wrong chain and every
// decryption fails.
export const APTOS_CHAIN_ID = Number(
    process.env.NEXT_PUBLIC_APTOS_CHAIN_ID ||
        (NETWORK === "shelbynet" ? 118 : 2)
);

// ── ExMarket Smart Contract ─────────────────────
export const MODULE_ADDRESS =
    process.env.NEXT_PUBLIC_MODULE_ADDRESS || "0x0"; // Set after deployment

// The platform Registry always lives at the module address — payment flows read
// it from @exmarket on-chain, so there is nothing to configure per environment.

// ── Module names ────────────────────────────────
export const MODULES = {
    PROMPT_REGISTRY: `${MODULE_ADDRESS}::prompt_registry`,
    PAYMENT: `${MODULE_ADDRESS}::payment`,
    ACCESS_CONTROL: `${MODULE_ADDRESS}::access_control`,
    REVENUE_SPLIT: `${MODULE_ADDRESS}::revenue_split`,
    UNLOCK_HISTORY: `${MODULE_ADDRESS}::unlock_history`,
} as const;

// ── Platform ────────────────────────────────────
export const PLATFORM_NAME = "ExMarket";
export const PLATFORM_FEE_PERCENT = 10;
export const CREATOR_SHARE_PERCENT = 90;

// ── APT Helpers ─────────────────────────────────
export const OCTAS_PER_APT = 100_000_000;

export function aptToOctas(apt: number): number {
    return Math.floor(apt * OCTAS_PER_APT);
}

export function octasToApt(octas: number): number {
    return octas / OCTAS_PER_APT;
}

export function formatApt(octas: number): string {
    const apt = octasToApt(octas);
    if (apt < 0.001) return "<0.001 APT";
    return `${apt.toFixed(4)} APT`;
}

// Re-export categories for convenience
export { PROMPT_CATEGORIES } from "@/types";
