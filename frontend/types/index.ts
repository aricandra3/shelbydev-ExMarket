/// ExMarket shared TypeScript types

// ── Pricing Models ──────────────────────────────
export type PricingModel = "pay-per-unlock" | "subscription" | "api-pay-per-call";

export const PRICING_MODEL_MAP: Record<number, PricingModel> = {
    1: "pay-per-unlock",
    2: "subscription",
    3: "api-pay-per-call",
};

export const PRICING_MODEL_REVERSE: Record<PricingModel, number> = {
    "pay-per-unlock": 1,
    subscription: 2,
    "api-pay-per-call": 3,
};

// ── Prompt ──────────────────────────────────────
export interface PromptMetadata {
    promptId: string;
    creator: string;
    blobId: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    pricingModel: PricingModel;
    price: number; // in octas — for subscriptions this buys one period
    status: "active" | "inactive";
    createdAt: number;
    updatedAt: number;
    totalUnlocks: number;
    totalRevenue: number;
    /** Length of one billing period in seconds. 0 unless pricingModel is "subscription". */
    subscriptionPeriodSecs?: number;
    /** Hex sha-256 of the encrypted payload pinned on-chain. Empty until the blob is linked. */
    contentHash?: string;
    /** False while the listing has no Shelby blob yet — such listings are not purchasable. */
    blobLinked?: boolean;
}

export interface PromptInput {
    title: string;
    description: string;
    category: string;
    tags: string[];
    pricingModel: PricingModel;
    price: number;
    subscriptionPeriodSecs: number;
}

// ── Subscription period presets ─────────────────
export const SUBSCRIPTION_PERIODS = [
    { key: "weekly", label: "Weekly", seconds: 604_800 },
    { key: "monthly", label: "Monthly (30d)", seconds: 2_592_000 },
    { key: "yearly", label: "Yearly (365d)", seconds: 31_536_000 },
] as const;

export type SubscriptionPeriodKey = (typeof SUBSCRIPTION_PERIODS)[number]["key"];

// ── Categories ──────────────────────────────────
export const PROMPT_CATEGORIES = [
    "ChatGPT",
    "Midjourney",
    "Stable Diffusion",
    "Claude",
    "Gemini",
    "Agent Workflow",
    "Automation",
    "Code Generation",
    "Writing",
    "Marketing",
    "SEO",
    "Data Analysis",
    "Other",
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

// ── Access ──────────────────────────────────────
export interface AccessRecord {
    promptId: string;
    accessType: "perpetual" | "subscription" | "api";
    grantedAt: number;
    expiresAt: number;
    apiCallsRemaining: number;
}

// ── Unlock History ──────────────────────────────
export interface UnlockRecord {
    promptId: string;
    amountPaid: number;
    timestamp: number;
}

// ── Creator ─────────────────────────────────────
export interface CreatorProfile {
    address: string;
    prompts: string[];
    totalRevenue: number;
}

// ── API Response ────────────────────────────────
export interface ApiPromptResponse {
    prompt_id: string;
    content: string;
    calls_remaining?: number;
    timestamp: number;
}

export interface ApiErrorResponse {
    error: string;
    unlock_url?: string;
}

// ── UI State ────────────────────────────────────
export type TransactionStatus =
    | "idle"
    | "signing"
    | "submitting"
    | "confirming"
    | "success"
    | "error";

export interface TransactionState {
    status: TransactionStatus;
    hash?: string;
    error?: string;
}
