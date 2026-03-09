/// UnlockHistory — Audit trail for all prompt unlock events.
/// Stores a per-user history of unlocks for transparency and analytics.
module exmarket::unlock_history {
    use std::signer;
    use std::vector;
    use aptos_framework::event;
    use aptos_framework::timestamp;

    // ── Friends ─────────────────────────────────────
    friend exmarket::payment;

    // ── Error Codes ─────────────────────────────────
    const E_NOT_FOUND: u64 = 400;

    // ── Structs ─────────────────────────────────────

    /// A single unlock event record
    struct UnlockRecord has store, drop, copy {
        prompt_id: address,
        amount_paid: u64,
        timestamp: u64,
    }

    /// Per-user history of all unlocks
    struct UserHistory has key {
        unlocks: vector<UnlockRecord>,
        total_spent: u64,
    }

    // ── Events ──────────────────────────────────────

    #[event]
    struct UnlockRecorded has drop, store {
        user: address,
        prompt_id: address,
        amount_paid: u64,
        timestamp: u64,
    }

    // ── Friend Functions ────────────────────────────

    /// Record an unlock (called by payment module with signer)
    public(friend) fun record_unlock_with_signer(
        user_signer: &signer,
        prompt_id: address,
        amount_paid: u64,
    ) acquires UserHistory {
        let user = signer::address_of(user_signer);
        let now = timestamp::now_seconds();

        // Ensure UserHistory exists
        if (!exists<UserHistory>(user)) {
            move_to(user_signer, UserHistory {
                unlocks: vector::empty<UnlockRecord>(),
                total_spent: 0,
            });
        };

        let history = borrow_global_mut<UserHistory>(user);
        vector::push_back(&mut history.unlocks, UnlockRecord {
            prompt_id,
            amount_paid,
            timestamp: now,
        });
        history.total_spent = history.total_spent + amount_paid;

        event::emit(UnlockRecorded {
            user,
            prompt_id,
            amount_paid,
            timestamp: now,
        });
    }

    // ── View Functions ──────────────────────────────

    // Get total number of unlocks for a user
    #[view]
    public fun get_unlock_count(user: address): u64 acquires UserHistory {
        if (!exists<UserHistory>(user)) {
            return 0
        };
        vector::length(&borrow_global<UserHistory>(user).unlocks)
    }

    // Get total amount spent by a user
    #[view]
    public fun get_total_spent(user: address): u64 acquires UserHistory {
        if (!exists<UserHistory>(user)) {
            return 0
        };
        borrow_global<UserHistory>(user).total_spent
    }

    // Get all unlock records for a user
    #[view]
    public fun get_user_history(user: address): vector<UnlockRecord> acquires UserHistory {
        if (!exists<UserHistory>(user)) {
            return vector::empty<UnlockRecord>()
        };
        borrow_global<UserHistory>(user).unlocks
    }
}
