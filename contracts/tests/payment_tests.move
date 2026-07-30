// End-to-end tests for the money paths: fee split, pricing-model enforcement,
// subscription duration, and content immutability after first sale.
//
// Each test spins up APT for the buyer, initializes the registry at @exmarket,
// lists a prompt, links a blob, and then exercises one purchase path.
#[test_only]
module exmarket::payment_tests {
    use std::signer;
    use std::string;
    use std::vector;

    use aptos_framework::account;
    use aptos_framework::aptos_coin::{Self, AptosCoin};
    use aptos_framework::coin;
    use aptos_framework::timestamp;

    use exmarket::access_control;
    use exmarket::payment;
    use exmarket::prompt_registry;
    use exmarket::revenue_split;

    const TREASURY: address = @0xFEE;
    const ONE_APT: u64 = 100_000_000;
    const PRICE: u64 = 10_000_000; // 0.1 APT
    const DAY_SECS: u64 = 86_400;

    // ── Harness ─────────────────────────────────────

    // Boot the chain clock, mint APT into `funded`, and initialize ExMarket.
    fun setup(
        framework: &signer,
        exmarket: &signer,
        funded: &signer,
    ) {
        timestamp::set_time_has_started_for_testing(framework);

        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(framework);

        // Every address that receives APT needs an account to hold it.
        account::create_account_for_test(signer::address_of(exmarket));
        account::create_account_for_test(signer::address_of(funded));
        account::create_account_for_test(TREASURY);

        coin::register<AptosCoin>(funded);
        coin::deposit(
            signer::address_of(funded),
            coin::mint<AptosCoin>(100 * ONE_APT, &mint_cap),
        );

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);

        prompt_registry::initialize(exmarket, TREASURY);
        revenue_split::initialize(exmarket);
    }

    fun tags(): vector<string::String> {
        let t = vector::empty<string::String>();
        vector::push_back(&mut t, string::utf8(b"test"));
        t
    }

    fun content_hash(): vector<u8> {
        let h = vector::empty<u8>();
        let i = 0;
        while (i < 32) {
            vector::push_back(&mut h, 7);
            i = i + 1;
        };
        h
    }

    // List a prompt under `model` and return its prompt_id (unlinked).
    fun list_prompt(
        creator: &signer,
        model: u8,
        price: u64,
        period_secs: u64,
    ): address {
        prompt_registry::register_prompt(
            creator,
            string::utf8(b"Test Prompt"),
            string::utf8(b"A prompt used in tests"),
            string::utf8(b"Claude"),
            tags(),
            model,
            price,
            period_secs,
        );

        let prompts = prompt_registry::get_creator_prompts(signer::address_of(creator));
        *vector::borrow(&prompts, vector::length(&prompts) - 1)
    }

    // List a prompt and link its Shelby blob so it becomes purchasable.
    fun list_live_prompt(
        creator: &signer,
        model: u8,
        price: u64,
        period_secs: u64,
    ): address {
        let prompt_id = list_prompt(creator, model, price, period_secs);
        prompt_registry::link_blob(
            creator,
            prompt_id,
            string::utf8(b"0xcreator/prompt_1.txt"),
            content_hash(),
        );
        prompt_id
    }

    fun apt(addr: address): u64 {
        coin::balance<AptosCoin>(addr)
    }

    // ── Fee split ───────────────────────────────────

    // The 90/10 split lands on the creator and the canonical treasury.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    fun test_unlock_splits_revenue(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
        );

        let buyer_before = apt(signer::address_of(buyer));
        payment::unlock_prompt(buyer, prompt_id);

        assert!(apt(signer::address_of(creator)) == PRICE * 9000 / 10000, 1);
        assert!(apt(TREASURY) == PRICE * 1000 / 10000, 2);
        assert!(apt(signer::address_of(buyer)) == buyer_before - PRICE, 3);

        // Access, history, and stats all move together
        assert!(access_control::has_access(signer::address_of(buyer), prompt_id), 4);
        assert!(revenue_split::get_total_fees_collected() == PRICE / 10, 5);
        assert!(prompt_registry::get_creator_total_revenue(signer::address_of(creator)) == PRICE, 6);
    }

    // A buyer cannot redirect the platform share: there is no registry
    // parameter to substitute, and a second Registry cannot even be created
    // outside @exmarket.
    #[test(framework = @aptos_framework, exmarket = @exmarket, attacker = @0xB)]
    #[expected_failure(abort_code = 7, location = exmarket::prompt_registry)]
    fun test_outsider_cannot_create_registry(
        framework: &signer,
        exmarket: &signer,
        attacker: &signer,
    ) {
        setup(framework, exmarket, attacker);
        // E_NOT_ADMIN — only @exmarket may hold the Registry that sets the fee
        // destination for every purchase.
        prompt_registry::initialize(attacker, signer::address_of(attacker));
    }

    // ── Pricing-model enforcement ───────────────────

    // A per-call listing cannot be bought as a one-off perpetual unlock.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    #[expected_failure(abort_code = 204, location = exmarket::payment)]
    fun test_cannot_unlock_api_listing(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_api_pay_per_call(),
            PRICE,
            0,
        );
        payment::unlock_prompt(buyer, prompt_id); // E_WRONG_PRICING_MODEL
    }

    // A pay-per-unlock listing cannot be bought through the subscription path.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    #[expected_failure(abort_code = 204, location = exmarket::payment)]
    fun test_cannot_subscribe_to_unlock_listing(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
        );
        payment::subscribe_prompt(buyer, prompt_id, 1); // E_WRONG_PRICING_MODEL
    }

    // ── Subscription duration & pricing ─────────────

    // Duration comes from the listing and is charged per period: 3 periods
    // cost 3x and grant 3x the time. The buyer cannot ask for more time at
    // the one-period price.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    fun test_subscription_charges_per_period(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_subscription(),
            PRICE,
            DAY_SECS,
        );

        let buyer_before = apt(signer::address_of(buyer));
        payment::subscribe_prompt(buyer, prompt_id, 3);

        // Charged for three periods, not one
        assert!(apt(signer::address_of(buyer)) == buyer_before - (PRICE * 3), 1);
        assert!(access_control::has_access(signer::address_of(buyer), prompt_id), 2);

        // Still valid just before the third day closes
        timestamp::fast_forward_seconds(DAY_SECS * 3 - 1);
        assert!(access_control::has_access(signer::address_of(buyer), prompt_id), 3);

        // ...and expired once it passes
        timestamp::fast_forward_seconds(2);
        assert!(!access_control::has_access(signer::address_of(buyer), prompt_id), 4);
    }

    // A subscriber can read when their window closes, not just whether it is
    // open — the dashboard and prompt page both need the date.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    fun test_access_record_exposes_expiry(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));
        let buyer_addr = signer::address_of(buyer);

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_subscription(),
            PRICE,
            DAY_SECS,
        );

        // No record yet
        let (kind, _, expires, calls) =
            access_control::get_access_record(buyer_addr, prompt_id);
        assert!(kind == 0 && expires == 0 && calls == 0, 1);

        payment::subscribe_prompt(buyer, prompt_id, 2);

        let (kind2, granted, expires2, calls2) =
            access_control::get_access_record(buyer_addr, prompt_id);
        assert!(kind2 == access_control::access_type_subscription(), 2);
        assert!(expires2 == granted + (DAY_SECS * 2), 3);
        assert!(calls2 == 0, 4);
    }

    // Renewing before expiry extends the existing window instead of
    // discarding the time already paid for.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    fun test_subscription_renewal_extends(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_subscription(),
            PRICE,
            DAY_SECS,
        );

        payment::subscribe_prompt(buyer, prompt_id, 1);
        // Renew on day 0 — the two days must stack
        payment::subscribe_prompt(buyer, prompt_id, 1);

        timestamp::fast_forward_seconds(DAY_SECS * 2 - 1);
        assert!(access_control::has_access(signer::address_of(buyer), prompt_id), 1);

        timestamp::fast_forward_seconds(2);
        assert!(!access_control::has_access(signer::address_of(buyer), prompt_id), 2);
    }

    // A subscription listing must declare its period length.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC)]
    #[expected_failure(abort_code = 8, location = exmarket::prompt_registry)]
    fun test_subscription_requires_period(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
    ) {
        setup(framework, exmarket, creator);
        // E_INVALID_SUBSCRIPTION_PERIOD
        list_prompt(creator, prompt_registry::pricing_subscription(), PRICE, 0);
    }

    // ── API quota ───────────────────────────────────

    // API calls are priced per call, accumulate across purchases, and access
    // ends when the quota runs out.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    fun test_api_calls_accumulate_and_deplete(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_api_pay_per_call(),
            PRICE,
            0,
        );
        let buyer_addr = signer::address_of(buyer);

        let buyer_before = apt(buyer_addr);
        payment::purchase_api_calls(buyer, prompt_id, 2);
        assert!(apt(buyer_addr) == buyer_before - (PRICE * 2), 1);
        assert!(access_control::get_api_calls_remaining(buyer_addr, prompt_id) == 2, 2);

        // A second batch tops up rather than replaces
        payment::purchase_api_calls(buyer, prompt_id, 1);
        assert!(access_control::get_api_calls_remaining(buyer_addr, prompt_id) == 3, 3);

        access_control::consume_api_call(buyer, prompt_id);
        access_control::consume_api_call(buyer, prompt_id);
        assert!(access_control::has_access(buyer_addr, prompt_id), 4);

        access_control::consume_api_call(buyer, prompt_id);
        assert!(access_control::get_api_calls_remaining(buyer_addr, prompt_id) == 0, 5);
        assert!(!access_control::has_access(buyer_addr, prompt_id), 6);
    }

    // ── Listing lifecycle & content immutability ────

    // An unlinked listing has no content on Shelby yet, so it cannot be sold.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    #[expected_failure(abort_code = 200, location = exmarket::payment)]
    fun test_cannot_buy_unlinked_prompt(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_prompt(
            creator,
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
        );
        assert!(!prompt_registry::is_prompt_active(prompt_id), 1);
        payment::unlock_prompt(buyer, prompt_id); // E_PROMPT_NOT_ACTIVE
    }

    // Before the first sale a creator can re-link (e.g. a failed upload).
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC)]
    fun test_relink_allowed_before_first_sale(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
    ) {
        setup(framework, exmarket, creator);

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
        );
        prompt_registry::link_blob(
            creator,
            prompt_id,
            string::utf8(b"0xcreator/prompt_2.txt"),
            content_hash(),
        );

        assert!(
            prompt_registry::get_prompt_blob_id(prompt_id)
                == string::utf8(b"0xcreator/prompt_2.txt"),
            1,
        );
        assert!(vector::length(&prompt_registry::get_content_hash(prompt_id)) == 32, 2);
    }

    // After someone has paid, the content is frozen — the creator cannot swap
    // the blob out from under buyers.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    #[expected_failure(abort_code = 10, location = exmarket::prompt_registry)]
    fun test_cannot_swap_content_after_sale(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
        );
        payment::unlock_prompt(buyer, prompt_id);

        // E_CONTENT_LOCKED
        prompt_registry::link_blob(
            creator,
            prompt_id,
            string::utf8(b"0xcreator/rugged.txt"),
            content_hash(),
        );
    }

    // Only the creator may link a blob to their listing.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, attacker = @0xB)]
    #[expected_failure(abort_code = 1, location = exmarket::prompt_registry)]
    fun test_only_creator_can_link_blob(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        attacker: &signer,
    ) {
        setup(framework, exmarket, attacker);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_prompt(
            creator,
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
        );
        // E_NOT_CREATOR
        prompt_registry::link_blob(
            attacker,
            prompt_id,
            string::utf8(b"0xattacker/evil.txt"),
            content_hash(),
        );
    }

    // Paying twice for the same perpetual unlock is rejected.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    #[expected_failure(abort_code = 201, location = exmarket::payment)]
    fun test_cannot_double_unlock(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
        );
        payment::unlock_prompt(buyer, prompt_id);
        payment::unlock_prompt(buyer, prompt_id); // E_ALREADY_UNLOCKED
    }

    // A deactivated listing stops selling.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    #[expected_failure(abort_code = 200, location = exmarket::payment)]
    fun test_deactivated_prompt_cannot_be_bought(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
        );
        prompt_registry::deactivate_prompt(creator, prompt_id);
        payment::unlock_prompt(buyer, prompt_id); // E_PROMPT_NOT_ACTIVE
    }

    // ── Single-transaction publishing ───────────────

    // publish_prompt lands at the address the client derived from (creator,
    // seed), so ACE can encrypt against the prompt id before any signing.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC)]
    fun test_publish_prompt_lands_on_derived_address(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
    ) {
        setup(framework, exmarket, creator);
        let creator_addr = signer::address_of(creator);
        let seed = b"exmarket/prompt/abc123";

        let expected = prompt_registry::derive_prompt_id(creator_addr, seed);

        prompt_registry::publish_prompt(
            creator,
            seed,
            string::utf8(b"One-shot prompt"),
            string::utf8(b"Published in a single transaction"),
            string::utf8(b"Claude"),
            tags(),
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
            string::utf8(b"0xcreator/one_shot.txt"),
            content_hash(),
        );

        let prompts = prompt_registry::get_creator_prompts(creator_addr);
        assert!(vector::length(&prompts) == 1, 1);
        assert!(*vector::borrow(&prompts, 0) == expected, 2);

        // Born complete: linked, hashed, and immediately sellable
        assert!(prompt_registry::is_blob_linked(expected), 3);
        assert!(prompt_registry::is_prompt_active(expected), 4);
        assert!(vector::length(&prompt_registry::get_content_hash(expected)) == 32, 5);
    }

    // A listing published this way is buyable straight away — no second
    // transaction to link content, and no unsellable in-between state.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    fun test_published_prompt_is_immediately_buyable(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        let seed = b"exmarket/prompt/buyme";
        let prompt_id = prompt_registry::derive_prompt_id(
            signer::address_of(creator),
            seed,
        );

        prompt_registry::publish_prompt(
            creator,
            seed,
            string::utf8(b"Buyable now"),
            string::utf8(b"No linking step"),
            string::utf8(b"Claude"),
            tags(),
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
            string::utf8(b"0xcreator/buyme.txt"),
            content_hash(),
        );

        payment::unlock_prompt(buyer, prompt_id);

        assert!(access_control::has_access(signer::address_of(buyer), prompt_id), 1);
        assert!(apt(signer::address_of(creator)) == PRICE * 9000 / 10000, 2);
        assert!(apt(TREASURY) == PRICE * 1000 / 10000, 3);
    }

    // Reusing a seed must abort rather than quietly produce a second listing
    // at the same address.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC)]
    #[expected_failure(abort_code = 0x80001, location = aptos_framework::object)]
    fun test_duplicate_seed_is_rejected(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
    ) {
        setup(framework, exmarket, creator);
        let seed = b"exmarket/prompt/same";

        prompt_registry::publish_prompt(
            creator, seed,
            string::utf8(b"First"), string::utf8(b"First"), string::utf8(b"Other"),
            tags(), prompt_registry::pricing_pay_per_unlock(), PRICE, 0,
            string::utf8(b"0xcreator/a.txt"), content_hash(),
        );
        prompt_registry::publish_prompt(
            creator, seed,
            string::utf8(b"Second"), string::utf8(b"Second"), string::utf8(b"Other"),
            tags(), prompt_registry::pricing_pay_per_unlock(), PRICE, 0,
            string::utf8(b"0xcreator/b.txt"), content_hash(),
        );
    }

    // The one-shot path enforces the same content-hash rule as link_blob.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC)]
    #[expected_failure(abort_code = 9, location = exmarket::prompt_registry)]
    fun test_publish_requires_valid_content_hash(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
    ) {
        setup(framework, exmarket, creator);
        // E_INVALID_CONTENT_HASH — 4 bytes instead of 32
        prompt_registry::publish_prompt(
            creator, b"exmarket/prompt/badhash",
            string::utf8(b"Bad"), string::utf8(b"Bad"), string::utf8(b"Other"),
            tags(), prompt_registry::pricing_pay_per_unlock(), PRICE, 0,
            string::utf8(b"0xcreator/c.txt"), x"11223344",
        );
    }

    // ── Platform config ─────────────────────────────

    // The admin can move the treasury and fee, but never above the 20% cap.
    #[test(framework = @aptos_framework, exmarket = @exmarket, creator = @0xC, buyer = @0xB)]
    fun test_admin_can_retarget_fee_within_cap(
        framework: &signer,
        exmarket: &signer,
        creator: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        account::create_account_for_test(signer::address_of(creator));

        // 5% to the module address instead of the original treasury
        prompt_registry::set_platform_config(exmarket, @exmarket, 500);

        let prompt_id = list_live_prompt(
            creator,
            prompt_registry::pricing_pay_per_unlock(),
            PRICE,
            0,
        );
        payment::unlock_prompt(buyer, prompt_id);

        assert!(apt(@exmarket) == PRICE * 500 / 10000, 1);
        assert!(apt(signer::address_of(creator)) == PRICE - (PRICE * 500 / 10000), 2);
        assert!(apt(TREASURY) == 0, 3);
    }

    #[test(framework = @aptos_framework, exmarket = @exmarket, buyer = @0xB)]
    #[expected_failure(abort_code = 12, location = exmarket::prompt_registry)]
    fun test_fee_cap_enforced(
        framework: &signer,
        exmarket: &signer,
        buyer: &signer,
    ) {
        setup(framework, exmarket, buyer);
        // E_INVALID_FEE — 50% is above MAX_PLATFORM_FEE_BPS
        prompt_registry::set_platform_config(exmarket, TREASURY, 5000);
    }

    #[test(framework = @aptos_framework, exmarket = @exmarket, attacker = @0xB)]
    #[expected_failure(abort_code = 7, location = exmarket::prompt_registry)]
    fun test_outsider_cannot_change_fee(
        framework: &signer,
        exmarket: &signer,
        attacker: &signer,
    ) {
        setup(framework, exmarket, attacker);
        // E_NOT_ADMIN
        prompt_registry::set_platform_config(attacker, signer::address_of(attacker), 0);
    }
}
