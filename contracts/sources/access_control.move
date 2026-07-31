/// AccessControl — Manages who can read which prompts.
/// Access is granted after on-chain payment and checked before blob reads.
/// Supports perpetual unlocks, time-limited subscriptions, and API call quotas.
module exmarket::access_control {
    use std::signer;
    use std::vector;
    use aptos_framework::event;
    use aptos_framework::timestamp;

    // ── Friends ─────────────────────────────────────
    friend exmarket::payment;

    // ── Error Codes ─────────────────────────────────
    const E_NO_ACCESS: u64 = 100;
    const E_ALREADY_HAS_ACCESS: u64 = 101;
    const E_ACCESS_EXPIRED: u64 = 102;
    const E_NO_API_CALLS_REMAINING: u64 = 103;
    const E_RECORD_NOT_FOUND: u64 = 104;

    // ── Access Type Constants ───────────────────────
    const ACCESS_PERPETUAL: u8 = 1;
    const ACCESS_SUBSCRIPTION: u8 = 2;
    const ACCESS_API: u8 = 3;

    // ── Structs ─────────────────────────────────────

    /// Individual access record for a user-prompt pair.
    /// Stored under the user's address in a lookup table.
    struct AccessRecord has store, drop, copy {
        prompt_id: address,
        access_type: u8,
        granted_at: u64,
        expires_at: u64,           // 0 = no expiry (perpetual)
        api_calls_remaining: u64,  // only used for ACCESS_API
    }

    /// Per-user table of all their unlocked prompts
    struct UserAccessList has key {
        records: vector<AccessRecord>,
    }

    // ── Events ──────────────────────────────────────

    #[event]
    struct AccessGranted has drop, store {
        user: address,
        prompt_id: address,
        access_type: u8,
        expires_at: u64,
        api_calls: u64,
        timestamp: u64,
    }

    #[event]
    struct ApiCallConsumed has drop, store {
        user: address,
        prompt_id: address,
        calls_remaining: u64,
        timestamp: u64,
    }

    // ── View Functions ──────────────────────────────

    // Check if a user currently has valid access to a prompt
    #[view]
    public fun has_access(user: address, prompt_id: address): bool acquires UserAccessList {
        if (!exists<UserAccessList>(user)) {
            return false
        };

        let list = borrow_global<UserAccessList>(user);
        let len = vector::length(&list.records);
        let i = 0;

        while (i < len) {
            let record = vector::borrow(&list.records, i);
            if (record.prompt_id == prompt_id) {
                // Check access type validity
                if (record.access_type == ACCESS_PERPETUAL) {
                    return true
                };
                if (record.access_type == ACCESS_SUBSCRIPTION) {
                    let now = timestamp::now_seconds();
                    return record.expires_at == 0 || record.expires_at > now
                };
                if (record.access_type == ACCESS_API) {
                    return record.api_calls_remaining > 0
                };
            };
            i = i + 1;
        };

        false
    }

    // Get remaining API calls for a user-prompt pair
    #[view]
    public fun get_api_calls_remaining(
        user: address,
        prompt_id: address,
    ): u64 acquires UserAccessList {
        if (!exists<UserAccessList>(user)) {
            return 0
        };

        let list = borrow_global<UserAccessList>(user);
        let len = vector::length(&list.records);
        let i = 0;

        while (i < len) {
            let record = vector::borrow(&list.records, i);
            if (record.prompt_id == prompt_id && record.access_type == ACCESS_API) {
                return record.api_calls_remaining
            };
            i = i + 1;
        };

        0
    }

    // The user's raw access record for a prompt, as
    // (access_type, granted_at, expires_at, api_calls_remaining).
    //
    // has_access answers yes/no; a subscriber also needs to see *when* their
    // window closes, and there was no way to read that off-chain.
    // Returns all zeros when the user has no record for this prompt.
    #[view]
    public fun get_access_record(
        user: address,
        prompt_id: address,
    ): (u8, u64, u64, u64) acquires UserAccessList {
        if (!exists<UserAccessList>(user)) {
            return (0, 0, 0, 0)
        };

        let list = borrow_global<UserAccessList>(user);
        let len = vector::length(&list.records);
        let i = 0;

        while (i < len) {
            let record = vector::borrow(&list.records, i);
            if (record.prompt_id == prompt_id) {
                return (
                    record.access_type,
                    record.granted_at,
                    record.expires_at,
                    record.api_calls_remaining,
                )
            };
            i = i + 1;
        };

        (0, 0, 0, 0)
    }

    // Get all prompts a user has access to
    #[view]
    public fun get_user_unlocked_prompts(user: address): vector<address> acquires UserAccessList {
        let result = vector::empty<address>();
        if (!exists<UserAccessList>(user)) {
            return result
        };

        let list = borrow_global<UserAccessList>(user);
        let len = vector::length(&list.records);
        let i = 0;

        while (i < len) {
            let record = vector::borrow(&list.records, i);
            vector::push_back(&mut result, record.prompt_id);
            i = i + 1;
        };

        result
    }

    // ── Internal ────────────────────────────────────

    /// Write the access record for a user who already has a UserAccessList.
    /// Private on purpose: every caller must come through
    /// `grant_access_with_signer`, which is the only path that can create the
    /// list in the first place.
    ///
    /// Repeat purchases are additive rather than destructive:
    ///   - API   → remaining calls accumulate
    ///   - SUB   → renewing before expiry extends the existing window
    ///   - PERP  → record is replaced (idempotent)
    fun grant_access(
        user: address,
        prompt_id: address,
        access_type: u8,
        duration_secs: u64,
        api_calls: u64,
    ) acquires UserAccessList {
        let now = timestamp::now_seconds();
        assert!(exists<UserAccessList>(user), E_RECORD_NOT_FOUND);

        let expires_at = if (duration_secs == 0) { 0 } else { now + duration_secs };
        let list = borrow_global_mut<UserAccessList>(user);

        // Check for existing record and update or add
        let len = vector::length(&list.records);
        let i = 0;
        let found = false;

        while (i < len) {
            let existing = vector::borrow_mut(&mut list.records, i);
            if (existing.prompt_id == prompt_id) {
                if (access_type == ACCESS_API) {
                    // Top up the quota instead of resetting it
                    existing.api_calls_remaining =
                        existing.api_calls_remaining + api_calls;
                    existing.access_type = ACCESS_API;
                    existing.granted_at = now;
                } else if (access_type == ACCESS_SUBSCRIPTION) {
                    // Renewing early must not throw away time already paid for
                    let base = if (
                        existing.access_type == ACCESS_SUBSCRIPTION
                            && existing.expires_at > now
                    ) {
                        existing.expires_at
                    } else {
                        now
                    };
                    expires_at = if (duration_secs == 0) { 0 } else { base + duration_secs };
                    existing.access_type = ACCESS_SUBSCRIPTION;
                    existing.granted_at = now;
                    existing.expires_at = expires_at;
                } else {
                    existing.access_type = access_type;
                    existing.granted_at = now;
                    existing.expires_at = expires_at;
                    existing.api_calls_remaining = api_calls;
                };
                found = true;
                break
            };
            i = i + 1;
        };

        if (!found) {
            vector::push_back(&mut list.records, AccessRecord {
                prompt_id,
                access_type,
                granted_at: now,
                expires_at,
                api_calls_remaining: api_calls,
            });
        };

        event::emit(AccessGranted {
            user,
            prompt_id,
            access_type,
            expires_at,
            api_calls,
            timestamp: now,
        });
    }

    // ── Friend Functions ────────────────────────────

    /// Grant access with signer (creates UserAccessList if needed)
    public(friend) fun grant_access_with_signer(
        user_signer: &signer,
        prompt_id: address,
        access_type: u8,
        duration_secs: u64,
        api_calls: u64,
    ) acquires UserAccessList {
        let user = signer::address_of(user_signer);

        // Ensure UserAccessList exists
        if (!exists<UserAccessList>(user)) {
            move_to(user_signer, UserAccessList {
                records: vector::empty<AccessRecord>(),
            });
        };

        grant_access(user, prompt_id, access_type, duration_secs, api_calls);
    }

    // ── Entry Functions ─────────────────────────────

    /// Consume one API call (called by the user or API gateway)
    public entry fun consume_api_call(
        caller: &signer,
        prompt_id: address,
    ) acquires UserAccessList {
        let user = signer::address_of(caller);
        assert!(has_access(user, prompt_id), E_NO_ACCESS);

        let list = borrow_global_mut<UserAccessList>(user);
        let len = vector::length(&list.records);
        let i = 0;

        while (i < len) {
            let record = vector::borrow_mut(&mut list.records, i);
            if (record.prompt_id == prompt_id && record.access_type == ACCESS_API) {
                assert!(record.api_calls_remaining > 0, E_NO_API_CALLS_REMAINING);
                record.api_calls_remaining = record.api_calls_remaining - 1;

                event::emit(ApiCallConsumed {
                    user,
                    prompt_id,
                    calls_remaining: record.api_calls_remaining,
                    timestamp: timestamp::now_seconds(),
                });

                return
            };
            i = i + 1;
        };

        abort E_RECORD_NOT_FOUND
    }

    // ── Helpers ─────────────────────────────────────
    public fun access_type_perpetual(): u8 { ACCESS_PERPETUAL }
    public fun access_type_subscription(): u8 { ACCESS_SUBSCRIPTION }
    public fun access_type_api(): u8 { ACCESS_API }
}
