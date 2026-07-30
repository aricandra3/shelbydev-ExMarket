/// RevenueSplit — Platform fee accounting and admin ownership.
///
/// The split itself is executed inline in payment.move: the creator share and
/// the platform share are transferred straight to their destinations, so there
/// is no escrow balance to withdraw. This module owns two things:
///   - who the platform admin is (transferable), and
///   - a running total of fees that have settled to the treasury, so the
///     numbers shown in the UI come from chain state rather than guesswork.
///
/// State lives at @exmarket only, so `get_platform_stats` cannot be pointed at
/// a look-alike resource under someone else's address.
module exmarket::revenue_split {
    use std::signer;
    use aptos_framework::event;
    use aptos_framework::timestamp;

    // ── Friends ─────────────────────────────────────
    friend exmarket::payment;

    // ── Error Codes ─────────────────────────────────
    const E_NOT_ADMIN: u64 = 300;
    const E_NOT_INITIALIZED: u64 = 301;
    const E_ALREADY_INITIALIZED: u64 = 302;

    // ── Structs ─────────────────────────────────────

    /// Admin configuration for the platform. Always stored at @exmarket.
    struct PlatformAdmin has key {
        admin: address,
        /// Cumulative platform fees settled to the treasury, in octas.
        total_fees_collected: u64,
    }

    // ── Events ──────────────────────────────────────

    #[event]
    struct PlatformFeeCollected has drop, store {
        amount: u64,
        total_fees_collected: u64,
        timestamp: u64,
    }

    #[event]
    struct AdminTransferred has drop, store {
        old_admin: address,
        new_admin: address,
        timestamp: u64,
    }

    // ── Init ────────────────────────────────────────

    /// Initialize the platform admin. Callable once, by @exmarket only.
    public entry fun initialize(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @exmarket, E_NOT_ADMIN);
        assert!(!exists<PlatformAdmin>(@exmarket), E_ALREADY_INITIALIZED);

        move_to(admin, PlatformAdmin {
            admin: admin_addr,
            total_fees_collected: 0,
        });
    }

    // ── Entry Functions ─────────────────────────────

    /// Transfer the admin role. Only the current admin can do this.
    public entry fun transfer_admin(
        current_admin: &signer,
        new_admin: address,
    ) acquires PlatformAdmin {
        assert!(exists<PlatformAdmin>(@exmarket), E_NOT_INITIALIZED);

        let caller = signer::address_of(current_admin);
        let config = borrow_global_mut<PlatformAdmin>(@exmarket);
        assert!(config.admin == caller, E_NOT_ADMIN);

        let old_admin = config.admin;
        config.admin = new_admin;

        event::emit(AdminTransferred {
            old_admin,
            new_admin,
            timestamp: timestamp::now_seconds(),
        });
    }

    // ── Friend Functions ────────────────────────────

    /// Record a platform fee that has just settled to the treasury.
    /// No-op when the module was never initialized, so fee accounting can
    /// never block a purchase.
    public(friend) fun record_platform_fee(amount: u64) acquires PlatformAdmin {
        if (!exists<PlatformAdmin>(@exmarket)) {
            return
        };

        let config = borrow_global_mut<PlatformAdmin>(@exmarket);
        config.total_fees_collected = config.total_fees_collected + amount;

        event::emit(PlatformFeeCollected {
            amount,
            total_fees_collected: config.total_fees_collected,
            timestamp: timestamp::now_seconds(),
        });
    }

    // ── View Functions ──────────────────────────────

    #[view]
    public fun get_total_fees_collected(): u64 acquires PlatformAdmin {
        if (!exists<PlatformAdmin>(@exmarket)) {
            return 0
        };
        borrow_global<PlatformAdmin>(@exmarket).total_fees_collected
    }

    #[view]
    public fun get_admin(): address acquires PlatformAdmin {
        assert!(exists<PlatformAdmin>(@exmarket), E_NOT_INITIALIZED);
        borrow_global<PlatformAdmin>(@exmarket).admin
    }
}
