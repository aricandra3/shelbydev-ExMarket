/// PromptRegistry — Core metadata storage and registration for AI prompts.
/// Stores on-chain metadata (title, price, blob_id, category) while
/// actual prompt content lives in Shelby blob storage.
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

    // ── Pricing Model Constants ─────────────────────
    const PRICING_PAY_PER_UNLOCK: u8 = 1;
    const PRICING_SUBSCRIPTION: u8 = 2;
    const PRICING_API_PAY_PER_CALL: u8 = 3;

    // ── Status Constants ────────────────────────────
    const STATUS_ACTIVE: u8 = 1;
    const STATUS_INACTIVE: u8 = 0;

    // ── Structs ─────────────────────────────────────

    /// Global registry configuration stored under the module deployer
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

    // ── Init ────────────────────────────────────────

    /// Initialize the registry. Called once by the module deployer.
    public entry fun initialize(
        admin: &signer,
        platform_treasury: address,
    ) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<Registry>(admin_addr), E_ALREADY_INITIALIZED);

        move_to(admin, Registry {
            prompt_count: 0,
            platform_treasury,
            platform_fee_bps: 1000, // 10%
        });
    }

    // ── Entry Functions ─────────────────────────────

    /// Creator registers a new prompt after uploading blob to Shelby
    public entry fun register_prompt(
        creator: &signer,
        blob_id: String,
        title: String,
        description: String,
        category: String,
        tags: vector<String>,
        pricing_model: u8,
        price: u64,
    ) acquires CreatorProfile, PromptMetadata {
        // Validate inputs
        assert!(
            pricing_model == PRICING_PAY_PER_UNLOCK
                || pricing_model == PRICING_SUBSCRIPTION
                || pricing_model == PRICING_API_PAY_PER_CALL,
            E_INVALID_PRICING_MODEL,
        );
        assert!(price > 0, E_INVALID_PRICE);

        let creator_addr = signer::address_of(creator);
        let now = timestamp::now_seconds();

        // Create a new Object to hold PromptMetadata
        let constructor_ref = object::create_object(creator_addr);
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
        });

        // Update creator profile
        if (!exists<CreatorProfile>(creator_addr)) {
            move_to(creator, CreatorProfile {
                prompts: vector::empty<address>(),
                total_revenue: 0,
            });
        };
        let profile = borrow_global_mut<CreatorProfile>(creator_addr);
        vector::push_back(&mut profile.prompts, prompt_id);

        // Emit event
        event::emit(PromptRegistered {
            prompt_id,
            creator: creator_addr,
            blob_id: *&borrow_global<PromptMetadata>(prompt_id).blob_id,
            title: *&borrow_global<PromptMetadata>(prompt_id).title,
            category: *&borrow_global<PromptMetadata>(prompt_id).category,
            price,
            pricing_model,
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

    /// Creator updates the blob_id after uploading encrypted content to Shelby.
    /// Used in the two-phase create flow: register first (get prompt_id),
    /// then ACE-encrypt with the real prompt_id, upload blob, then update here.
    public entry fun update_blob_id(
        creator: &signer,
        prompt_id: address,
        new_blob_id: String,
    ) acquires PromptMetadata {
        let creator_addr = signer::address_of(creator);
        let metadata = borrow_global_mut<PromptMetadata>(prompt_id);

        assert!(metadata.creator == creator_addr, E_NOT_CREATOR);

        metadata.blob_id = new_blob_id;
        metadata.updated_at = timestamp::now_seconds();
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

        metadata.status = STATUS_ACTIVE;
        metadata.updated_at = timestamp::now_seconds();
    }

    // ── View Functions ──────────────────────────────

    #[view]
    public fun get_prompt_metadata(prompt_id: address): (
        address, // creator
        String,  // blob_id
        String,  // title
        String,  // description
        String,  // category
        u8,      // pricing_model
        u64,     // price
        u8,      // status
        u64,     // total_unlocks
        u64,     // total_revenue
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
        )
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
    public fun is_prompt_active(prompt_id: address): bool acquires PromptMetadata {
        borrow_global<PromptMetadata>(prompt_id).status == STATUS_ACTIVE
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

    /// Get registry config (called by payment module for fee calculation)
    public(friend) fun get_platform_config(registry_addr: address): (address, u64) acquires Registry {
        let registry = borrow_global<Registry>(registry_addr);
        (registry.platform_treasury, registry.platform_fee_bps)
    }

    // ── Inline Helpers ──────────────────────────────

    public fun get_status_active(): u8 { STATUS_ACTIVE }
    public fun get_status_inactive(): u8 { STATUS_INACTIVE }
}
