/// Server-side smart contract read helpers

import { MODULES } from "./constants";
import { viewFunctionServer } from "./aptosServer";
import type { PromptMetadata, PricingModel } from "@/types";

export async function getPromptMetadataServer(
    promptId: string,
    options: { fresh?: boolean } = {}
): Promise<PromptMetadata> {
    const result = await viewFunctionServer<any[]>(
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
        status: (result[7] as number) === 1 && blobLinked ? "active" : "inactive",
        totalUnlocks: Number(result[8]),
        totalRevenue: Number(result[9]),
        subscriptionPeriodSecs: Number(result[10] ?? 0),
        contentHash: typeof result[11] === "string" ? result[11] : "",
        blobLinked,
        tags: [],
        createdAt: 0,
        updatedAt: 0,
    };
}

export async function getApiCallsRemainingServer(
    userAddr: string,
    promptId: string
): Promise<number> {
    const result = await viewFunctionServer<[string | number]>(
        `${MODULES.ACCESS_CONTROL}::get_api_calls_remaining`,
        [userAddr, promptId],
        [],
        { cache: false }
    );
    return Number(result[0]);
}

export async function getPromptBlobIdServer(promptId: string): Promise<string> {
    const result = await viewFunctionServer<[string]>(
        `${MODULES.PROMPT_REGISTRY}::get_prompt_blob_id`,
        [promptId]
    );
    return result[0];
}

export async function hasAccessServer(
    userAddr: string,
    promptId: string,
    options: { fresh?: boolean } = {}
): Promise<boolean> {
    const result = await viewFunctionServer<[boolean]>(
        `${MODULES.ACCESS_CONTROL}::has_access`,
        [userAddr, promptId],
        [],
        { cache: !options.fresh }
    );
    return result[0];
}
