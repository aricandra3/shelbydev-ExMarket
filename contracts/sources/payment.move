/// Payment — Handles all payment flows for prompt unlocks, subscriptions, and API calls.
/// Enforces the platform revenue split at the contract level.
///
/// Invariants enforced here:
///   - The fee split always comes from the canonical registry at @exmarket.
///     Buyers cannot redirect the platform share by passing their own registry.
///   - Each entry point only accepts prompts listed under the matching pricing
///     model, so a per-call listing cannot be bought as a perpetual unlock.
///   - Subscription length is defined by the creator (`subscription_period_secs`)
///     and charged per period; the buyer picks how many periods, not the duration.
module exmarket::payment {
    use std::signer;
    use aptos_framework::aptos_account;
    use aptos_framework::event;
    use aptos_framework::timestamp;

    use exmarket::prompt_registry;
    use exmarket::access_control;
    use exmarket::unlock_history;
    use exmarket::revenue_split;

    // ── Error Codes ─────────────────────────────────
    const E_PROMPT_NOT_ACTIVE: u64 = 200;
    const E_ALREADY_UNLOCKED: u64 = 201;
    const E_INSUFFICIENT_BALANCE: u64 = 202;
    const E_INVALID_CALL_COUNT: u64 = 203;
    const E_WRONG_PRICING_MODEL: u64 = 204;
    const E_INVALID_PERIOD_COUNT: u64 = 205;

    // ── Pricing Model Constants (mirror from registry) ──
    const PRICING_PAY_PER_UNLOCK: u8 = 1;
    const PRICING_SUBSCRIPTION: u8 = 2;
    const PRICING_API_PAY_PER_CALL: u8 = 3;

    // ── Limits ──────────────────────────────────────
    /// Bounds on batch purchases. These keep `price * count` far below u64
    /// overflow and keep a fat-fingered input from draining a wallet.
    const MAX_API_CALLS_PER_PURCHASE: u64 = 1_000_000;
    const MAX_PERIODS_PER_PURCHASE: u64 = 120;

    // ── Events ──────────────────────────────────────

    #[event]
    struct PaymentProcessed has drop, store {
        buyer: address,
        prompt_id: address,
        amount: u64,
        creator_share: u64,
        platform_share: u64,
        payment_type: u8,
        timestamp: u64,
    }

    // ── Internal Helpers ────────────────────────────

    /// Split `total` between creator and platform treasury and move the funds.
    /// Returns (creator_share, platform_share).
    fun settle(buyer: &signer, prompt_id: address, total: u64): (u64, u64) {
        let creator = prompt_registry::get_prompt_creator(prompt_id);
        let (treasury, fee_bps) = prompt_registry::get_platform_config();

        let platform_share = (total * fee_bps) / 10000;
        let creator_share = total - platform_share;

        aptos_account::transfer(buyer, creator, creator_share);
        if (platform_share > 0) {
            aptos_account::transfer(buyer, treasury, platform_share);
            revenue_split::record_platform_fee(platform_share);
        };

        (creator_share, platform_share)
    }

    /// Every purchase path shares these two checks: the listing must be live
    /// (active AND its Shelby blob linked) and sold under the model the caller
    /// is paying for.
    fun assert_purchasable(prompt_id: address, expected_model: u8) {
        assert!(prompt_registry::is_prompt_active(prompt_id), E_PROMPT_NOT_ACTIVE);
        assert!(
            prompt_registry::get_prompt_pricing_model(prompt_id) == expected_model,
            E_WRONG_PRICING_MODEL,
        );
    }

    // ── Entry Functions ─────────────────────────────

    /// Unlock a prompt with a one-time payment (pay-per-unlock model)
    public entry fun unlock_prompt(
        buyer: &signer,
        prompt_id: address,
    ) {
        let buyer_addr = signer::address_of(buyer);

        // 1. Verify the prompt is live and sold per unlock
        assert_purchasable(prompt_id, PRICING_PAY_PER_UNLOCK);

        // 2. Prevent double payment
        assert!(!access_control::has_access(buyer_addr, prompt_id), E_ALREADY_UNLOCKED);

        // 3. Pay creator + platform
        let price = prompt_registry::get_prompt_price(prompt_id);
        let (creator_share, platform_share) = settle(buyer, prompt_id, price);

        // 4. Grant perpetual access
        access_control::grant_access_with_signer(
            buyer,
            prompt_id,
            access_control::access_type_perpetual(),
            0, // no expiry
            0, // not API type
        );

        // 5. Record in history
        unlock_history::record_unlock_with_signer(
            buyer,
            prompt_id,
            price,
        );

        // 6. Update registry stats
        prompt_registry::record_unlock(prompt_id, price);

        // 7. Emit event
        event::emit(PaymentProcessed {
            buyer: buyer_addr,
            prompt_id,
            amount: price,
            creator_share,
            platform_share,
            payment_type: PRICING_PAY_PER_UNLOCK,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Purchase a batch of API calls for a prompt.
    /// `price` on the listing is the per-call price.
    public entry fun purchase_api_calls(
        buyer: &signer,
        prompt_id: address,
        num_calls: u64,
    ) {
        let buyer_addr = signer::address_of(buyer);

        // 1. Verify the prompt is live and sold per call
        assert_purchasable(prompt_id, PRICING_API_PAY_PER_CALL);
        assert!(
            num_calls > 0 && num_calls <= MAX_API_CALLS_PER_PURCHASE,
            E_INVALID_CALL_COUNT,
        );

        // 2. Pay for the batch
        let per_call_price = prompt_registry::get_prompt_price(prompt_id);
        let total_cost = per_call_price * num_calls;
        let (creator_share, platform_share) = settle(buyer, prompt_id, total_cost);

        // 3. Grant API access (adds calls to any existing quota)
        access_control::grant_access_with_signer(
            buyer,
            prompt_id,
            access_control::access_type_api(),
            0,         // no time expiry for API calls
            num_calls,
        );

        // 4. Record & emit
        unlock_history::record_unlock_with_signer(buyer, prompt_id, total_cost);
        prompt_registry::record_unlock(prompt_id, total_cost);

        event::emit(PaymentProcessed {
            buyer: buyer_addr,
            prompt_id,
            amount: total_cost,
            creator_share,
            platform_share,
            payment_type: PRICING_API_PAY_PER_CALL,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Subscribe to a prompt for `num_periods` billing periods.
    ///
    /// The period length is set by the creator on the listing, and `price`
    /// buys exactly one period — the buyer chooses how many periods to pay
    /// for, never the duration itself. Renewing before expiry extends the
    /// existing window instead of resetting it.
    public entry fun subscribe_prompt(
        buyer: &signer,
        prompt_id: address,
        num_periods: u64,
    ) {
        let buyer_addr = signer::address_of(buyer);

        // 1. Verify the prompt is live and sold as a subscription
        assert_purchasable(prompt_id, PRICING_SUBSCRIPTION);
        assert!(
            num_periods > 0 && num_periods <= MAX_PERIODS_PER_PURCHASE,
            E_INVALID_PERIOD_COUNT,
        );

        // 2. Duration and cost both come from the listing
        let period_secs = prompt_registry::get_subscription_period_secs(prompt_id);
        assert!(period_secs > 0, E_WRONG_PRICING_MODEL);
        let duration_secs = period_secs * num_periods;

        let price = prompt_registry::get_prompt_price(prompt_id);
        let total_cost = price * num_periods;
        let (creator_share, platform_share) = settle(buyer, prompt_id, total_cost);

        // 3. Grant (or extend) subscription access
        access_control::grant_access_with_signer(
            buyer,
            prompt_id,
            access_control::access_type_subscription(),
            duration_secs,
            0,
        );

        // 4. Record & emit
        unlock_history::record_unlock_with_signer(buyer, prompt_id, total_cost);
        prompt_registry::record_unlock(prompt_id, total_cost);

        event::emit(PaymentProcessed {
            buyer: buyer_addr,
            prompt_id,
            amount: total_cost,
            creator_share,
            platform_share,
            payment_type: PRICING_SUBSCRIPTION,
            timestamp: timestamp::now_seconds(),
        });
    }
}
