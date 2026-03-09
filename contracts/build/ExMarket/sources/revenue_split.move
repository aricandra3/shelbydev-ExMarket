/// RevenueSplit — Platform fee management and withdrawal.
/// The 90/10 split is executed inline in payment.move.
/// This module handles the platform treasury admin operations.
module exmarket::revenue_split {
    use std::signer;
    use aptos_framework::event;
    use aptos_framework::timestamp;


    // ── Error Codes ─────────────────────────────────
    const E_NOT_ADMIN: u64 = 300;
    const E_NOT_INITIALIZED: u64 = 301;
    const E_ALREADY_INITIALIZED: u64 = 302;

    // ── Structs ─────────────────────────────────────

    /// Admin configuration for the platform
    struct PlatformAdmin has key {
        admin: address,
        total_fees_collected: u64,
        total_withdrawn: u64,
    }

    // ── Events ──────────────────────────────────────

    #[event]
    struct PlatformFeeWithdrawn has drop, store {
        admin: address,
        amount: u64,
        timestamp: u64,
    }

    #[event]
    struct AdminTransferred has drop, store {
        old_admin: address,
        new_admin: address,
        timestamp: u64,
    }

    // ── Init ────────────────────────────────────────

    /// Initialize the platform admin. Called once by module deployer.
    public entry fun initialize(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<PlatformAdmin>(admin_addr), E_ALREADY_INITIALIZED);

        move_to(admin, PlatformAdmin {
            admin: admin_addr,
            total_fees_collected: 0,
            total_withdrawn: 0,
        });
    }

    // ── Entry Functions ─────────────────────────────

    /// Transfer admin role to a new address
    public entry fun transfer_admin(
        current_admin: &signer,
        new_admin: address,
    ) acquires PlatformAdmin {
        let admin_addr = signer::address_of(current_admin);
        let config = borrow_global_mut<PlatformAdmin>(admin_addr);
        assert!(config.admin == admin_addr, E_NOT_ADMIN);

        let old_admin = config.admin;
        config.admin = new_admin;

        event::emit(AdminTransferred {
            old_admin,
            new_admin,
            timestamp: timestamp::now_seconds(),
        });
    }

    // ── View Functions ──────────────────────────────

    #[view]
    public fun get_platform_stats(admin_addr: address): (u64, u64) acquires PlatformAdmin {
        let config = borrow_global<PlatformAdmin>(admin_addr);
        (config.total_fees_collected, config.total_withdrawn)
    }

    #[view]
    public fun get_admin(admin_addr: address): address acquires PlatformAdmin {
        borrow_global<PlatformAdmin>(admin_addr).admin
    }
}
