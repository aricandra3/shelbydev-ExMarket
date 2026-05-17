/// Smart contract interaction helpers

import { viewFunction, buildEntryPayload } from "./aptos";
import { MODULES, REGISTRY_ADDRESS } from "./constants";
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

    return {
        promptId,
        creator: result[0] as string,
        blobId: result[1] as string,
        title: result[2] as string,
        description: result[3] as string,
        category: result[4] as string,
        pricingModel: pricingMap[result[5] as number] || "pay-per-unlock",
        price: Number(result[6]),
        status: (result[7] as number) === 1 ? "active" : "inactive",
        totalUnlocks: Number(result[8]),
        totalRevenue: Number(result[9]),
        tags: [],
        createdAt: 0,
        updatedAt: 0,
    };
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
    promptId: string
): Promise<boolean> {
    const result = await viewFunction<[boolean]>(
        `${MODULES.ACCESS_CONTROL}::has_access`,
        [userAddr, promptId]
    );
    return result[0];
}

export async function getApiCallsRemaining(
    userAddr: string,
    promptId: string
): Promise<number> {
    const result = await viewFunction<[number]>(
        `${MODULES.ACCESS_CONTROL}::get_api_calls_remaining`,
        [userAddr, promptId]
    );
    return Number(result[0]);
}

export async function getUserUnlockedPrompts(
    userAddr: string
): Promise<string[]> {
    const result = await viewFunction<[string[]]>(
        `${MODULES.ACCESS_CONTROL}::get_user_unlocked_prompts`,
        [userAddr]
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

export function buildRegisterPromptPayload(
    blobId: string,
    title: string,
    description: string,
    category: string,
    tags: string[],
    pricingModel: number,
    price: number
) {
    return buildEntryPayload(
        `${MODULES.PROMPT_REGISTRY}::register_prompt`,
        [blobId, title, description, category, tags, pricingModel, price]
    );
}

export function buildUnlockPromptPayload(promptId: string) {
    return buildEntryPayload(`${MODULES.PAYMENT}::unlock_prompt`, [
        promptId,
        REGISTRY_ADDRESS,
    ]);
}

export function buildPurchaseApiCallsPayload(
    promptId: string,
    numCalls: number
) {
    return buildEntryPayload(`${MODULES.PAYMENT}::purchase_api_calls`, [
        promptId,
        numCalls,
        REGISTRY_ADDRESS,
    ]);
}

export function buildSubscribePayload(
    promptId: string,
    durationSecs: number
) {
    return buildEntryPayload(`${MODULES.PAYMENT}::subscribe_prompt`, [
        promptId,
        durationSecs,
        REGISTRY_ADDRESS,
    ]);
}

export function buildUpdatePricePayload(promptId: string, newPrice: number) {
    return buildEntryPayload(`${MODULES.PROMPT_REGISTRY}::update_price`, [
        promptId,
        newPrice,
    ]);
}

export function buildUpdateBlobIdPayload(promptId: string, newBlobId: string) {
    return buildEntryPayload(`${MODULES.PROMPT_REGISTRY}::update_blob_id`, [
        promptId,
        newBlobId,
    ]);
}

export function buildConsumeApiCallPayload(promptId: string) {
    return buildEntryPayload(`${MODULES.ACCESS_CONTROL}::consume_api_call`, [
        promptId,
    ]);
}
