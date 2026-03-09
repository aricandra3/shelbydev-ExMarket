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
    price: number; // in octas
    status: "active" | "inactive";
    createdAt: number;
    updatedAt: number;
    totalUnlocks: number;
    totalRevenue: number;
}

export interface PromptInput {
    blobId: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    pricingModel: PricingModel;
    price: number;
}

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
