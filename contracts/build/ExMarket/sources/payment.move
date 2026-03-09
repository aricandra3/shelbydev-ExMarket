/// Payment — Handles all payment flows for prompt unlocks, subscriptions, and API calls.
/// Enforces 90/10 revenue split (creator/platform) at the contract level.
module exmarket::payment {
    use std::signer;
    use aptos_framework::aptos_account;
    use aptos_framework::event;
    use aptos_framework::timestamp;

    use exmarket::prompt_registry;
    use exmarket::access_control;
    use exmarket::unlock_history;

    // ── Error Codes ─────────────────────────────────
    const E_PROMPT_NOT_ACTIVE: u64 = 200;
    const E_ALREADY_UNLOCKED: u64 = 201;
    const E_INSUFFICIENT_BALANCE: u64 = 202;
    const E_INVALID_CALL_COUNT: u64 = 203;
    const E_WRONG_PRICING_MODEL: u64 = 204;

    // ── Pricing Model Constants (mirror from registry) ──
    const PRICING_PAY_PER_UNLOCK: u8 = 1;
    const PRICING_SUBSCRIPTION: u8 = 2;
    const PRICING_API_PAY_PER_CALL: u8 = 3;

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

    // ── Entry Functions ─────────────────────────────

    /// Unlock a prompt with a one-time payment (pay-per-unlock model)
    public entry fun unlock_prompt(
        buyer: &signer,
        prompt_id: address,
        registry_addr: address,
    ) {
        let buyer_addr = signer::address_of(buyer);

        // 1. Verify prompt is active
        assert!(prompt_registry::is_prompt_active(prompt_id), E_PROMPT_NOT_ACTIVE);

        // 2. Prevent double payment
        assert!(!access_control::has_access(buyer_addr, prompt_id), E_ALREADY_UNLOCKED);

        // 3. Get price and config
        let price = prompt_registry::get_prompt_price(prompt_id);
        let creator = prompt_registry::get_prompt_creator(prompt_id);
        let (treasury, fee_bps) = prompt_registry::get_platform_config(registry_addr);

        // 4. Calculate revenue split
        let platform_share = (price * fee_bps) / 10000;
        let creator_share = price - platform_share;

        // 5. Transfer payments
        aptos_account::transfer(buyer, creator, creator_share);
        aptos_account::transfer(buyer, treasury, platform_share);

        // 6. Grant perpetual access
        access_control::grant_access_with_signer(
            buyer,
            prompt_id,
            access_control::access_type_perpetual(),
            0, // no expiry
            0, // not API type
        );

        // 7. Record in history
        unlock_history::record_unlock_with_signer(
            buyer,
            prompt_id,
            price,
        );

        // 8. Update registry stats
        prompt_registry::record_unlock(prompt_id, price);

        // 9. Emit event
        let now = timestamp::now_seconds();
        event::emit(PaymentProcessed {
            buyer: buyer_addr,
            prompt_id,
            amount: price,
            creator_share,
            platform_share,
            payment_type: PRICING_PAY_PER_UNLOCK,
            timestamp: now,
        });
    }

    /// Purchase a batch of API calls for a prompt
    public entry fun purchase_api_calls(
        buyer: &signer,
        prompt_id: address,
        num_calls: u64,
        registry_addr: address,
    ) {
        let buyer_addr = signer::address_of(buyer);

        // 1. Verify prompt is active
        assert!(prompt_registry::is_prompt_active(prompt_id), E_PROMPT_NOT_ACTIVE);
        assert!(num_calls > 0, E_INVALID_CALL_COUNT);

        // 2. Calculate total cost (price = per-call price)
        let per_call_price = prompt_registry::get_prompt_price(prompt_id);
        let total_cost = per_call_price * num_calls;
        let creator = prompt_registry::get_prompt_creator(prompt_id);
        let (treasury, fee_bps) = prompt_registry::get_platform_config(registry_addr);

        // 3. Revenue split
        let platform_share = (total_cost * fee_bps) / 10000;
        let creator_share = total_cost - platform_share;

        // 4. Transfer
        aptos_account::transfer(buyer, creator, creator_share);
        aptos_account::transfer(buyer, treasury, platform_share);

        // 5. Grant API access (adds calls to existing or creates new record)
        access_control::grant_access_with_signer(
            buyer,
            prompt_id,
            access_control::access_type_api(),
            0,         // no time expiry for API calls
            num_calls, // number of calls purchased
        );

        // 6. Record & emit
        unlock_history::record_unlock_with_signer(buyer, prompt_id, total_cost);
        prompt_registry::record_unlock(prompt_id, total_cost);

        let now = timestamp::now_seconds();
        event::emit(PaymentProcessed {
            buyer: buyer_addr,
            prompt_id,
            amount: total_cost,
            creator_share,
            platform_share,
            payment_type: PRICING_API_PAY_PER_CALL,
            timestamp: now,
        });
    }

    /// Subscribe to a prompt for a given duration (in seconds)
    public entry fun subscribe_prompt(
        buyer: &signer,
        prompt_id: address,
        duration_secs: u64,
        registry_addr: address,
    ) {
        let buyer_addr = signer::address_of(buyer);

        // 1. Verify prompt is active
        assert!(prompt_registry::is_prompt_active(prompt_id), E_PROMPT_NOT_ACTIVE);

        // 2. Get price (subscription price = price per period)
        let price = prompt_registry::get_prompt_price(prompt_id);
        let creator = prompt_registry::get_prompt_creator(prompt_id);
        let (treasury, fee_bps) = prompt_registry::get_platform_config(registry_addr);

        // 3. Revenue split
        let platform_share = (price * fee_bps) / 10000;
        let creator_share = price - platform_share;

        // 4. Transfer
        aptos_account::transfer(buyer, creator, creator_share);
        aptos_account::transfer(buyer, treasury, platform_share);

        // 5. Grant subscription access with expiry
        access_control::grant_access_with_signer(
            buyer,
            prompt_id,
            access_control::access_type_subscription(),
            duration_secs,
            0,
        );

        // 6. Record & emit
        unlock_history::record_unlock_with_signer(buyer, prompt_id, price);
        prompt_registry::record_unlock(prompt_id, price);

        let now = timestamp::now_seconds();
        event::emit(PaymentProcessed {
            buyer: buyer_addr,
            prompt_id,
            amount: price,
            creator_share,
            platform_share,
            payment_type: PRICING_SUBSCRIPTION,
            timestamp: now,
        });
    }
}
