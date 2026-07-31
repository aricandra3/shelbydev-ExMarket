/// Smart contract interaction helpers

import { viewFunction, buildEntryPayload } from "./aptos";
import { MODULES, SHELBY_CONTRACT_ADDRESS } from "./constants";
import {
    findPromptInRegistry,
    getCreatorPromptIdsFromRegistry,
} from "./promptRegistry";
import type { PromptMetadata, PricingModel, PRICING_MODEL_MAP } from "@/types";

// ── Prompt Registry ─────────────────────────────

export async function getPromptMetadata(
    promptId: string,
    options: { fresh?: boolean } = {}
): Promise<PromptMetadata> {
    if (!options.fresh && typeof window !== "undefined") {
        const registryPrompt = await findPromptInRegistry(promptId).catch(() => null);
        if (registryPrompt) return registryPrompt;
    }

    const result = await viewFunction<any[]>(
        `${MODULES.PROMPT_REGISTRY}::get_prompt_metadata`,
        [promptId],
        [],
        { cache: !options.fresh }
    );

    const pricingMap: Record<number, PricingModel> = {
        1: "pay-per-unlock",
        2: "subscription",
        3: "api-pay-per-call",
    };

    const blobLinked = Boolean(result[12]);

    return {
        promptId,
        creator: result[0] as string,
        blobId: result[1] as string,
        title: result[2] as string,
        description: result[3] as string,
        category: result[4] as string,
        pricingModel: pricingMap[result[5] as number] || "pay-per-unlock",
        price: Number(result[6]),
        // A listing whose Shelby blob is not linked yet cannot be bought,
        // so surface it as inactive rather than as a live listing.
        status: (result[7] as number) === 1 && blobLinked ? "active" : "inactive",
        totalUnlocks: Number(result[8]),
        totalRevenue: Number(result[9]),
        subscriptionPeriodSecs: Number(result[10] ?? 0),
        contentHash: normalizeHash(result[11]),
        blobLinked,
        tags: [],
        createdAt: 0,
        updatedAt: 0,
    };
}

/// Move returns vector<u8> as a hex string ("0x..") over the REST API, but
/// tolerate a byte array in case a node serializes it that way.
function normalizeHash(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        return `0x${value
            .map((byte) => Number(byte).toString(16).padStart(2, "0"))
            .join("")}`;
    }
    return "";
}

export async function getPromptPrice(promptId: string): Promise<number> {
    const result = await viewFunction<[number]>(
        `${MODULES.PROMPT_REGISTRY}::get_prompt_price`,
        [promptId]
    );
    return Number(result[0]);
}

export async function getPromptBlobId(promptId: string): Promise<string> {
    const result = await viewFunction<[string]>(
        `${MODULES.PROMPT_REGISTRY}::get_prompt_blob_id`,
        [promptId]
    );
    return result[0];
}

export async function getCreatorPrompts(
    creatorAddr: string,
    options: { fresh?: boolean } = {}
): Promise<string[]> {
    if (!options.fresh && typeof window !== "undefined") {
        const registryPromptIds = await getCreatorPromptIdsFromRegistry(
            creatorAddr
        ).catch(() => null);
        if (registryPromptIds) return registryPromptIds;
    }

    const result = await viewFunction<[string[]]>(
        `${MODULES.PROMPT_REGISTRY}::get_creator_prompts`,
        [creatorAddr],
        [],
        { cache: !options.fresh }
    );
    return result[0];
}

export async function getCreatorRevenue(
    creatorAddr: string
): Promise<number> {
    const result = await viewFunction<[number]>(
        `${MODULES.PROMPT_REGISTRY}::get_creator_total_revenue`,
        [creatorAddr]
    );
    return Number(result[0]);
}

// ── Access Control ──────────────────────────────

export async function hasAccess(
    userAddr: string,
    promptId: string,
    options: { fresh?: boolean } = {}
): Promise<boolean> {
    const result = await viewFunction<[boolean]>(
        `${MODULES.ACCESS_CONTROL}::has_access`,
        [userAddr, promptId],
        [],
        { cache: !options.fresh }
    );
    return result[0];
}

export async function getApiCallsRemaining(
    userAddr: string,
    promptId: string,
    options: { fresh?: boolean } = {}
): Promise<number> {
    const result = await viewFunction<[number]>(
        `${MODULES.ACCESS_CONTROL}::get_api_calls_remaining`,
        [userAddr, promptId],
        [],
        { cache: !options.fresh }
    );
    return Number(result[0]);
}

export type AccessRecord = {
    accessType: "none" | "perpetual" | "subscription" | "api";
    grantedAt: number;
    /** Unix seconds. 0 means no expiry. */
    expiresAt: number;
    apiCallsRemaining: number;
};

const ACCESS_TYPES: Record<number, AccessRecord["accessType"]> = {
    0: "none",
    1: "perpetual",
    2: "subscription",
    3: "api",
};

/// The buyer's raw access record — what kind of access, and when it ends.
/// hasAccess() only answers yes/no, which is not enough to tell a subscriber
/// how long they have left.
export async function getAccessRecord(
    userAddr: string,
    promptId: string,
    options: { fresh?: boolean } = {}
): Promise<AccessRecord> {
    const result = await viewFunction<any[]>(
        `${MODULES.ACCESS_CONTROL}::get_access_record`,
        [userAddr, promptId],
        [],
        { cache: !options.fresh }
    );

    return {
        accessType: ACCESS_TYPES[Number(result[0])] ?? "none",
        grantedAt: Number(result[1]),
        expiresAt: Number(result[2]),
        apiCallsRemaining: Number(result[3]),
    };
}

export async function getUserUnlockedPrompts(
    userAddr: string,
    options: { fresh?: boolean } = {}
): Promise<string[]> {
    const result = await viewFunction<[string[]]>(
        `${MODULES.ACCESS_CONTROL}::get_user_unlocked_prompts`,
        [userAddr],
        [],
        { cache: !options.fresh }
    );
    return result[0];
}

// ── Unlock History ──────────────────────────────

export async function getUserUnlockCount(userAddr: string): Promise<number> {
    const result = await viewFunction<[number]>(
        `${MODULES.UNLOCK_HISTORY}::get_unlock_count`,
        [userAddr]
    );
    return Number(result[0]);
}

export async function getUserTotalSpent(userAddr: string): Promise<number> {
    const result = await viewFunction<[number]>(
        `${MODULES.UNLOCK_HISTORY}::get_total_spent`,
        [userAddr]
    );
    return Number(result[0]);
}

// ── Transaction Payloads ────────────────────────

/// Publish a complete listing in one transaction.
///
/// The prompt lands at the named-object address derived from (creator, seed),
/// which the client computes up front with `createObjectAddress` — so the
/// content can be ACE-encrypted against the prompt id before anything is
/// signed. Call this only after the Shelby upload succeeded: the listing is
/// sellable the moment this transaction lands.
export function buildPublishPromptPayload(params: {
    seed: Uint8Array;
    title: string;
    description: string;
    category: string;
    tags: string[];
    pricingModel: number;
    price: number;
    subscriptionPeriodSecs: number;
    blobId: string;
    contentHash: Uint8Array;
}) {
    return buildEntryPayload(`${MODULES.PROMPT_REGISTRY}::publish_prompt`, [
        Array.from(params.seed),
        params.title,
        params.description,
        params.category,
        params.tags,
        params.pricingModel,
        params.price,
        params.subscriptionPeriodSecs,
        params.blobId,
        Array.from(params.contentHash),
    ]);
}

/// Legacy two-phase publishing. Superseded by buildPublishPromptPayload; kept
/// because the on-chain entry functions still exist for older listings.
/// Phase 1 of publishing: create the listing and get its prompt_id.
/// The Shelby blob is attached separately via buildLinkBlobPayload, because
/// the content has to be ACE-encrypted against the prompt_id first.
///
/// `subscriptionPeriodSecs` must be > 0 for subscription listings (it defines
/// what one `price` buys) and 0 for every other pricing model.
export function buildRegisterPromptPayload(
    title: string,
    description: string,
    category: string,
    tags: string[],
    pricingModel: number,
    price: number,
    subscriptionPeriodSecs: number
) {
    return buildEntryPayload(`${MODULES.PROMPT_REGISTRY}::register_prompt`, [
        title,
        description,
        category,
        tags,
        pricingModel,
        price,
        subscriptionPeriodSecs,
    ]);
}

export function buildUnlockPromptPayload(promptId: string) {
    return buildEntryPayload(`${MODULES.PAYMENT}::unlock_prompt`, [promptId]);
}

export function buildPurchaseApiCallsPayload(
    promptId: string,
    numCalls: number
) {
    return buildEntryPayload(`${MODULES.PAYMENT}::purchase_api_calls`, [
        promptId,
        numCalls,
    ]);
}

/// The period length lives on the listing; the buyer only chooses how many
/// periods to pay for.
export function buildSubscribePayload(promptId: string, numPeriods: number) {
    return buildEntryPayload(`${MODULES.PAYMENT}::subscribe_prompt`, [
        promptId,
        numPeriods,
    ]);
}

export function buildUpdatePricePayload(promptId: string, newPrice: number) {
    return buildEntryPayload(`${MODULES.PROMPT_REGISTRY}::update_price`, [
        promptId,
        newPrice,
    ]);
}

/// Phase 2 of publishing: attach the Shelby blob and pin its content hash.
/// Rejected once the listing has its first sale, so buyers can rely on the
/// content not changing after they pay.
export function buildLinkBlobPayload(
    promptId: string,
    blobId: string,
    contentHash: Uint8Array
) {
    return buildEntryPayload(`${MODULES.PROMPT_REGISTRY}::link_blob`, [
        promptId,
        blobId,
        Array.from(contentHash),
    ]);
}

/// Extend a blob's paid storage window on Shelby.
///
/// `newExpirationMicros` is an ABSOLUTE timestamp in microseconds, not a delta —
/// verified by simulating both readings against the live contract: an absolute
/// value executed, a delta aborted. Pass the current expiry plus the extension
/// so remaining paid time is not thrown away.
///
/// Signed by the blob owner (the creator) and paid in ShelbyUSD.
export function buildExtendBlobStoragePayload(
    blobName: string,
    newExpirationMicros: number
) {
    return buildEntryPayload(
        `${SHELBY_CONTRACT_ADDRESS}::blob_metadata::increase_expiration_time`,
        [blobName, newExpirationMicros]
    );
}

export function buildDeactivatePromptPayload(promptId: string) {
    return buildEntryPayload(
        `${MODULES.PROMPT_REGISTRY}::deactivate_prompt`,
        [promptId]
    );
}

export function buildReactivatePromptPayload(promptId: string) {
    return buildEntryPayload(
        `${MODULES.PROMPT_REGISTRY}::reactivate_prompt`,
        [promptId]
    );
}

export function buildConsumeApiCallPayload(promptId: string) {
    return buildEntryPayload(`${MODULES.ACCESS_CONTROL}::consume_api_call`, [
        promptId,
    ]);
}
