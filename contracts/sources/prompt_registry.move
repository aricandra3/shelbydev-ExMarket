/// PromptRegistry — Core metadata storage and registration for AI prompts.
/// Stores on-chain metadata (title, price, blob_id, category) while
/// actual prompt content lives in Shelby blob storage.
///
/// Trust guarantees enforced here:
///   - The platform Registry lives at a single fixed address (@exmarket).
///     Callers cannot point payment flows at a registry they control.
///   - A prompt is only purchasable after its Shelby blob has been linked.
///   - Content is immutable once the first buyer has paid: `link_blob` is
///     rejected after `total_unlocks > 0`, so a creator cannot swap the
///     content out from under buyers.
///   - `content_hash` pins the exact bytes stored on Shelby so any buyer can
///     verify what they downloaded matches what was sold.
module exmarket::prompt_registry {
    use std::string::String;
    use std::signer;
    use std::vector;
    use aptos_framework::event;
    use aptos_framework::object;
    use aptos_framework::timestamp;

    // ── Friends ─────────────────────────────────────
    friend exmarket::payment;

    // ── Error Codes ─────────────────────────────────
    const E_NOT_CREATOR: u64 = 1;
    const E_INVALID_PRICING_MODEL: u64 = 2;
    const E_INVALID_PRICE: u64 = 3;
    const E_PROMPT_INACTIVE: u64 = 4;
    const E_REGISTRY_NOT_INITIALIZED: u64 = 5;
    const E_ALREADY_INITIALIZED: u64 = 6;
    const E_NOT_ADMIN: u64 = 7;
    const E_INVALID_SUBSCRIPTION_PERIOD: u64 = 8;
    const E_INVALID_CONTENT_HASH: u64 = 9;
    const E_CONTENT_LOCKED: u64 = 10;
    const E_BLOB_NOT_LINKED: u64 = 11;
    const E_INVALID_FEE: u64 = 12;
    const E_EMPTY_BLOB_ID: u64 = 13;
    const E_INVALID_SEED: u64 = 14;

    // ── Pricing Model Constants ─────────────────────
    const PRICING_PAY_PER_UNLOCK: u8 = 1;
    const PRICING_SUBSCRIPTION: u8 = 2;
    const PRICING_API_PAY_PER_CALL: u8 = 3;

    // ── Status Constants ────────────────────────────
    const STATUS_ACTIVE: u8 = 1;
    const STATUS_INACTIVE: u8 = 0;

    // ── Limits ──────────────────────────────────────
    /// Platform fee can never exceed 20%, whatever the admin sets.
    const MAX_PLATFORM_FEE_BPS: u64 = 2000;
    const DEFAULT_PLATFORM_FEE_BPS: u64 = 1000; // 10%
    /// sha2-256 digest of the encrypted payload stored on Shelby.
    const CONTENT_HASH_LEN: u64 = 32;
    /// Upper bound on the client-supplied named-object seed.
    const MAX_SEED_LEN: u64 = 64;

    // ── Structs ─────────────────────────────────────

    /// Global registry configuration. Always stored at @exmarket.
    struct Registry has key {
        prompt_count: u64,
        platform_treasury: address,
        platform_fee_bps: u64, // basis points: 1000 = 10%
    }

    /// Core prompt metadata stored as an Aptos Object
    struct PromptMetadata has key {
        creator: address,
        blob_id: String,
        title: String,
        description: String,
        category: String,
        tags: vector<String>,
        pricing_model: u8,
        price: u64,             // in octas
        status: u8,
        created_at: u64,
        updated_at: u64,
        total_unlocks: u64,
        total_revenue: u64,
        /// Length of one billing period, in seconds. Only meaningful for
        /// PRICING_SUBSCRIPTION; `price` buys exactly one period.
        subscription_period_secs: u64,
        /// sha2-256 of the encrypted payload uploaded to Shelby. Empty until linked.
        content_hash: vector<u8>,
        /// False until the creator links the Shelby blob. Unlinked prompts
        /// are not purchasable.
        blob_linked: bool,
    }

    /// Creator-level index of their prompts
    struct CreatorProfile has key {
        prompts: vector<address>,
        total_revenue: u64,
    }

    // ── Events ──────────────────────────────────────

    #[event]
    struct PromptRegistered has drop, store {
        prompt_id: address,
        creator: address,
        blob_id: String,
        title: String,
        category: String,
        price: u64,
        pricing_model: u8,
        subscription_period_secs: u64,
        timestamp: u64,
    }

    #[event]
    struct BlobLinked has drop, store {
        prompt_id: address,
        creator: address,
        blob_id: String,
        content_hash: vector<u8>,
        timestamp: u64,
    }

    #[event]
    struct PromptUpdated has drop, store {
        prompt_id: address,
        new_price: u64,
        timestamp: u64,
    }

    #[event]
    struct PromptDeactivated has drop, store {
        prompt_id: address,
        timestamp: u64,
    }

    #[event]
    struct PlatformConfigUpdated has drop, store {
        platform_treasury: address,
        platform_fee_bps: u64,
        timestamp: u64,
    }

    // ── Init ────────────────────────────────────────

    /// Initialize the registry. Callable once, by @exmarket only.
    public entry fun initialize(
        admin: &signer,
        platform_treasury: address,
    ) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @exmarket, E_NOT_ADMIN);
        assert!(!exists<Registry>(@exmarket), E_ALREADY_INITIALIZED);

        move_to(admin, Registry {
            prompt_count: 0,
            platform_treasury,
            platform_fee_bps: DEFAULT_PLATFORM_FEE_BPS,
        });
    }

    /// Admin updates treasury and fee. Fee is capped at MAX_PLATFORM_FEE_BPS
    /// so the split can never be changed to something abusive.
    public entry fun set_platform_config(
        admin: &signer,
        platform_treasury: address,
        platform_fee_bps: u64,
    ) acquires Registry {
        assert!(signer::address_of(admin) == @exmarket, E_NOT_ADMIN);
        assert!(exists<Registry>(@exmarket), E_REGISTRY_NOT_INITIALIZED);
        assert!(platform_fee_bps <= MAX_PLATFORM_FEE_BPS, E_INVALID_FEE);

        let registry = borrow_global_mut<Registry>(@exmarket);
        registry.platform_treasury = platform_treasury;
        registry.platform_fee_bps = platform_fee_bps;

        event::emit(PlatformConfigUpdated {
            platform_treasury,
            platform_fee_bps,
            timestamp: timestamp::now_seconds(),
        });
    }

    // ── Internal Validation ─────────────────────────

    /// Shared listing rules for both publishing paths.
    fun assert_valid_listing(
        pricing_model: u8,
        price: u64,
        subscription_period_secs: u64,
    ) {
        assert!(
            pricing_model == PRICING_PAY_PER_UNLOCK
                || pricing_model == PRICING_SUBSCRIPTION
                || pricing_model == PRICING_API_PAY_PER_CALL,
            E_INVALID_PRICING_MODEL,
        );
        assert!(price > 0, E_INVALID_PRICE);
        assert!(exists<Registry>(@exmarket), E_REGISTRY_NOT_INITIALIZED);

        if (pricing_model == PRICING_SUBSCRIPTION) {
            assert!(subscription_period_secs > 0, E_INVALID_SUBSCRIPTION_PERIOD);
        } else {
            assert!(subscription_period_secs == 0, E_INVALID_SUBSCRIPTION_PERIOD);
        };
    }

    /// Register the prompt under its creator and count it in the registry.
    /// Bumping `prompt_count` also puts @exmarket in the write set of every
    /// publish, which is what makes listings discoverable through the indexer.
    fun index_new_prompt(
        creator: &signer,
        creator_addr: address,
        prompt_id: address,
    ) acquires CreatorProfile, Registry {
        if (!exists<CreatorProfile>(creator_addr)) {
            move_to(creator, CreatorProfile {
                prompts: vector::empty<address>(),
                total_revenue: 0,
            });
        };
        let profile = borrow_global_mut<CreatorProfile>(creator_addr);
        vector::push_back(&mut profile.prompts, prompt_id);

        let registry = borrow_global_mut<Registry>(@exmarket);
        registry.prompt_count = registry.prompt_count + 1;
    }

    // ── Entry Functions ─────────────────────────────

    /// Publish a fully-formed listing in a single transaction.
    ///
    /// The prompt lives at a *named* object address derived from
    /// (creator, seed), which the client can compute before signing anything.
    /// That breaks the old chicken-and-egg problem: ACE encryption needs the
    /// prompt id, and the old flow could only learn it by registering first.
    ///
    /// Publishing therefore becomes: derive the id → encrypt → register the
    /// blob with Shelby → upload → publish here. The listing is born complete
    /// and sellable, and there is no window where a prompt exists on-chain
    /// without its content already stored on Shelby.
    ///
    /// Use `derive_prompt_id` to compute the address the same way off-chain.
    public entry fun publish_prompt(
        creator: &signer,
        seed: vector<u8>,
        title: String,
        description: String,
        category: String,
        tags: vector<String>,
        pricing_model: u8,
        price: u64,
        subscription_period_secs: u64,
        blob_id: String,
        content_hash: vector<u8>,
    ) acquires CreatorProfile, Registry {
        assert_valid_listing(pricing_model, price, subscription_period_secs);
        assert!(
            !vector::is_empty(&seed) && vector::length(&seed) <= MAX_SEED_LEN,
            E_INVALID_SEED,
        );
        assert!(!std::string::is_empty(&blob_id), E_EMPTY_BLOB_ID);
        assert!(
            vector::length(&content_hash) == CONTENT_HASH_LEN,
            E_INVALID_CONTENT_HASH,
        );

        let creator_addr = signer::address_of(creator);
        let now = timestamp::now_seconds();

        // Named object: address is a pure function of (creator, seed), so a
        // repeated seed aborts instead of silently creating a second listing.
        let constructor_ref = object::create_named_object(creator, seed);
        let object_signer = object::generate_signer(&constructor_ref);
        let prompt_id = object::address_from_constructor_ref(&constructor_ref);

        move_to(&object_signer, PromptMetadata {
            creator: creator_addr,
            blob_id,
            title,
            description,
            category,
            tags,
            pricing_model,
            price,
            status: STATUS_ACTIVE,
            created_at: now,
            updated_at: now,
            total_unlocks: 0,
            total_revenue: 0,
            subscription_period_secs,
            content_hash,
            blob_linked: true,
        });

        index_new_prompt(creator, creator_addr, prompt_id);

        event::emit(PromptRegistered {
            prompt_id,
            creator: creator_addr,
            blob_id,
            title,
            category,
            price,
            pricing_model,
            subscription_period_secs,
            timestamp: now,
        });

        event::emit(BlobLinked {
            prompt_id,
            creator: creator_addr,
            blob_id,
            content_hash,
            timestamp: now,
        });
    }

    /// Creator registers a new prompt listing.
    ///
    /// The listing starts unlinked (no Shelby blob yet) and is therefore not
    /// purchasable until `link_blob` is called. This is the first half of the
    /// two-phase create flow: the creator needs the returned prompt_id before
    /// they can ACE-encrypt the content against it.
    ///
    /// `subscription_period_secs` must be > 0 for subscription listings (it
    /// defines what one `price` buys) and 0 for every other pricing model.
    public entry fun register_prompt(
        creator: &signer,
        title: String,
        description: String,
        category: String,
        tags: vector<String>,
        pricing_model: u8,
        price: u64,
        subscription_period_secs: u64,
    ) acquires CreatorProfile, Registry {
        assert_valid_listing(pricing_model, price, subscription_period_secs);

        let creator_addr = signer::address_of(creator);
        let now = timestamp::now_seconds();

        // Create a new Object to hold PromptMetadata
        let constructor_ref = object::create_object(creator_addr);
        let object_signer = object::generate_signer(&constructor_ref);
        let prompt_id = object::address_from_constructor_ref(&constructor_ref);

        move_to(&object_signer, PromptMetadata {
            creator: creator_addr,
            blob_id: std::string::utf8(b""),
            title,
            description,
            category,
            tags,
            pricing_model,
            price,
            status: STATUS_ACTIVE,
            created_at: now,
            updated_at: now,
            total_unlocks: 0,
            total_revenue: 0,
            subscription_period_secs,
            content_hash: vector::empty<u8>(),
            blob_linked: false,
        });

        index_new_prompt(creator, creator_addr, prompt_id);

        // Emit event
        event::emit(PromptRegistered {
            prompt_id,
            creator: creator_addr,
            blob_id: std::string::utf8(b""),
            title,
            category,
            price,
            pricing_model,
            subscription_period_secs,
            timestamp: now,
        });
    }

    /// Creator updates the price of their prompt
    public entry fun update_price(
        creator: &signer,
        prompt_id: address,
        new_price: u64,
    ) acquires PromptMetadata {
        let creator_addr = signer::address_of(creator);
        let metadata = borrow_global_mut<PromptMetadata>(prompt_id);

        assert!(metadata.creator == creator_addr, E_NOT_CREATOR);
        assert!(new_price > 0, E_INVALID_PRICE);

        metadata.price = new_price;
        metadata.updated_at = timestamp::now_seconds();

        event::emit(PromptUpdated {
            prompt_id,
            new_price,
            timestamp: metadata.updated_at,
        });
    }

    /// Creator links the Shelby blob and pins its content hash.
    ///
    /// Second half of the two-phase create flow. Re-linking is allowed only
    /// while nobody has paid yet (`total_unlocks == 0`), so a creator can fix
    /// a failed upload but can never swap content buyers already paid for.
    public entry fun link_blob(
        creator: &signer,
        prompt_id: address,
        blob_id: String,
        content_hash: vector<u8>,
    ) acquires PromptMetadata {
        let creator_addr = signer::address_of(creator);
        let metadata = borrow_global_mut<PromptMetadata>(prompt_id);

        assert!(metadata.creator == creator_addr, E_NOT_CREATOR);
        assert!(metadata.total_unlocks == 0, E_CONTENT_LOCKED);
        assert!(!std::string::is_empty(&blob_id), E_EMPTY_BLOB_ID);
        assert!(
            vector::length(&content_hash) == CONTENT_HASH_LEN,
            E_INVALID_CONTENT_HASH,
        );

        metadata.blob_id = blob_id;
        metadata.content_hash = content_hash;
        metadata.blob_linked = true;
        metadata.updated_at = timestamp::now_seconds();

        event::emit(BlobLinked {
            prompt_id,
            creator: creator_addr,
            blob_id: metadata.blob_id,
            content_hash: metadata.content_hash,
            timestamp: metadata.updated_at,
        });
    }

    /// Creator deactivates their prompt (soft delete)
    public entry fun deactivate_prompt(
        creator: &signer,
        prompt_id: address,
    ) acquires PromptMetadata {
        let creator_addr = signer::address_of(creator);
        let metadata = borrow_global_mut<PromptMetadata>(prompt_id);

        assert!(metadata.creator == creator_addr, E_NOT_CREATOR);

        metadata.status = STATUS_INACTIVE;
        metadata.updated_at = timestamp::now_seconds();

        event::emit(PromptDeactivated {
            prompt_id,
            timestamp: metadata.updated_at,
        });
    }

    /// Creator reactivates a deactivated prompt
    public entry fun reactivate_prompt(
        creator: &signer,
        prompt_id: address,
    ) acquires PromptMetadata {
        let creator_addr = signer::address_of(creator);
        let metadata = borrow_global_mut<PromptMetadata>(prompt_id);

        assert!(metadata.creator == creator_addr, E_NOT_CREATOR);
        assert!(metadata.blob_linked, E_BLOB_NOT_LINKED);

        metadata.status = STATUS_ACTIVE;
        metadata.updated_at = timestamp::now_seconds();
    }

    // ── View Functions ──────────────────────────────

    #[view]
    public fun get_prompt_metadata(prompt_id: address): (
        address,      // creator
        String,       // blob_id
        String,       // title
        String,       // description
        String,       // category
        u8,           // pricing_model
        u64,          // price
        u8,           // status
        u64,          // total_unlocks
        u64,          // total_revenue
        u64,          // subscription_period_secs
        vector<u8>,   // content_hash
        bool,         // blob_linked
    ) acquires PromptMetadata {
        let m = borrow_global<PromptMetadata>(prompt_id);
        (
            m.creator,
            m.blob_id,
            m.title,
            m.description,
            m.category,
            m.pricing_model,
            m.price,
            m.status,
            m.total_unlocks,
            m.total_revenue,
            m.subscription_period_secs,
            m.content_hash,
            m.blob_linked,
        )
    }

    // Address a `publish_prompt(creator, seed, ...)` call will occupy. Lets the
    // client derive the prompt id — and therefore the ACE domain — before
    // signing anything, and verify its own derivation against the chain.
    #[view]
    public fun derive_prompt_id(creator: address, seed: vector<u8>): address {
        object::create_object_address(&creator, seed)
    }

    #[view]
    public fun get_prompt_price(prompt_id: address): u64 acquires PromptMetadata {
        borrow_global<PromptMetadata>(prompt_id).price
    }

    #[view]
    public fun get_prompt_blob_id(prompt_id: address): String acquires PromptMetadata {
        borrow_global<PromptMetadata>(prompt_id).blob_id
    }

    #[view]
    public fun get_prompt_pricing_model(prompt_id: address): u8 acquires PromptMetadata {
        borrow_global<PromptMetadata>(prompt_id).pricing_model
    }

    #[view]
    public fun get_subscription_period_secs(prompt_id: address): u64 acquires PromptMetadata {
        borrow_global<PromptMetadata>(prompt_id).subscription_period_secs
    }

    // sha2-256 of the encrypted payload stored on Shelby. Buyers can verify
    // the blob they downloaded against this before trusting the plaintext.
    #[view]
    public fun get_content_hash(prompt_id: address): vector<u8> acquires PromptMetadata {
        borrow_global<PromptMetadata>(prompt_id).content_hash
    }

    #[view]
    public fun is_blob_linked(prompt_id: address): bool acquires PromptMetadata {
        borrow_global<PromptMetadata>(prompt_id).blob_linked
    }

    // A prompt is purchasable only when the creator has it active AND the
    // Shelby blob is linked — never sell content that isn't stored yet.
    #[view]
    public fun is_prompt_active(prompt_id: address): bool acquires PromptMetadata {
        let m = borrow_global<PromptMetadata>(prompt_id);
        m.status == STATUS_ACTIVE && m.blob_linked
    }

    #[view]
    public fun get_prompt_creator(prompt_id: address): address acquires PromptMetadata {
        borrow_global<PromptMetadata>(prompt_id).creator
    }

    #[view]
    public fun get_creator_prompts(creator: address): vector<address> acquires CreatorProfile {
        if (!exists<CreatorProfile>(creator)) {
            return vector::empty<address>()
        };
        borrow_global<CreatorProfile>(creator).prompts
    }

    #[view]
    public fun get_creator_total_revenue(creator: address): u64 acquires CreatorProfile {
        if (!exists<CreatorProfile>(creator)) {
            return 0
        };
        borrow_global<CreatorProfile>(creator).total_revenue
    }

    // Public read of the fee split so the UI can show the real numbers
    // instead of hardcoded copy.
    #[view]
    public fun get_registry_config(): (address, u64, u64) acquires Registry {
        assert!(exists<Registry>(@exmarket), E_REGISTRY_NOT_INITIALIZED);
        let registry = borrow_global<Registry>(@exmarket);
        (registry.platform_treasury, registry.platform_fee_bps, registry.prompt_count)
    }

    // ── Friend Functions (called by payment module) ─

    /// Increment unlock count and revenue (called after successful payment)
    public(friend) fun record_unlock(
        prompt_id: address,
        amount: u64,
    ) acquires PromptMetadata, CreatorProfile {
        let metadata = borrow_global_mut<PromptMetadata>(prompt_id);
        metadata.total_unlocks = metadata.total_unlocks + 1;
        metadata.total_revenue = metadata.total_revenue + amount;

        // Also update creator profile
        let creator = metadata.creator;
        if (exists<CreatorProfile>(creator)) {
            let profile = borrow_global_mut<CreatorProfile>(creator);
            profile.total_revenue = profile.total_revenue + amount;
        };
    }

    /// Get registry config for fee calculation. Always reads the canonical
    /// registry at @exmarket — callers cannot substitute their own.
    public(friend) fun get_platform_config(): (address, u64) acquires Registry {
        assert!(exists<Registry>(@exmarket), E_REGISTRY_NOT_INITIALIZED);
        let registry = borrow_global<Registry>(@exmarket);
        (registry.platform_treasury, registry.platform_fee_bps)
    }

    // ── Inline Helpers ──────────────────────────────

    public fun get_status_active(): u8 { STATUS_ACTIVE }
    public fun get_status_inactive(): u8 { STATUS_INACTIVE }
    public fun pricing_pay_per_unlock(): u8 { PRICING_PAY_PER_UNLOCK }
    public fun pricing_subscription(): u8 { PRICING_SUBSCRIPTION }
    public fun pricing_api_pay_per_call(): u8 { PRICING_API_PAY_PER_CALL }
}
