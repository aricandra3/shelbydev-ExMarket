/// ACE Access Control Bridge
///
/// Exposes a #[view] check_permission(user, domain) function that ACE workers
/// query to decide whether to release decryption key shares.
///
/// The `domain` encodes the prompt ID in the format:
///   "prompts/<hex_prompt_id>"
/// where hex_prompt_id is the 64-char hex representation of the prompt address.
///
/// ACE workers call this on-chain after receiving a buyer's proof-of-permission:
///   - Returns true  → workers release key shares → buyer can decrypt
///   - Returns false → workers reject the request → ciphertext stays locked
///
/// This module only delegates to exmarket::access_control::has_access —
/// no existing contract logic needs to change.
module exmarket::ace_access_control {
    use std::vector;
    use aptos_std::from_bcs;
    use exmarket::access_control;

    // ── Constants ─────────────────────────────────────────────────────────────
    const DOMAIN_PREFIX: vector<u8> = b"prompts/";

    // ── View Function ─────────────────────────────────────────────────────────

    // Called by ACE workers to verify buyer permission before releasing key shares.
    //
    // `user`   = wallet address of the buyer requesting decryption
    // `domain` = UTF-8 bytes of "prompts/<64-char-hex-prompt-id>"
    //
    // Returns true if the user has valid on-chain access (paid / subscribed /
    // has API calls remaining) for the prompt referenced by the domain.
    #[view]
    public fun check_permission(user: address, domain: vector<u8>): bool {
        let (prompt_id, ok) = parse_prompt_id(domain);
        if (!ok) {
            return false
        };
        access_control::has_access(user, prompt_id)
    }

    // ── Internal Helpers ──────────────────────────────────────────────────────

    /// Parse "prompts/<hex_addr>" → (address, true)
    /// Returns (@0x0, false) on any malformed input.
    fun parse_prompt_id(domain: vector<u8>): (address, bool) {
        let prefix = DOMAIN_PREFIX;
        let prefix_len = vector::length(&prefix);
        let domain_len = vector::length(&domain);

        // Domain must be longer than the prefix
        if (domain_len <= prefix_len) {
            return (@0x0, false)
        };

        // Verify "prompts/" prefix
        let i = 0;
        while (i < prefix_len) {
            if (*vector::borrow(&domain, i) != *vector::borrow(&prefix, i)) {
                return (@0x0, false)
            };
            i = i + 1;
        };

        // Extract the hex string after "prompts/"
        let hex_bytes = vector::slice(&domain, prefix_len, domain_len);

        // Decode hex → 32-byte address
        hex_to_address(hex_bytes)
    }

    /// Decode a 64-char lowercase hex string into an Aptos address (32 bytes).
    fun hex_to_address(hex: vector<u8>): (address, bool) {
        let hex_len = vector::length(&hex);
        // Aptos address = 32 bytes = 64 hex characters
        if (hex_len != 64) {
            return (@0x0, false)
        };

        let raw = vector::empty<u8>();
        let i = 0;
        while (i < 64) {
            let hi = hex_nibble(*vector::borrow(&hex, i));
            let lo = hex_nibble(*vector::borrow(&hex, i + 1));
            if (hi == 255 || lo == 255) {
                return (@0x0, false)
            };
            vector::push_back(&mut raw, (hi << 4) | lo);
            i = i + 2;
        };

        // from_bcs::to_address expects a 32-byte BCS-encoded address
        // which is identical to the raw bytes representation
        let addr = from_bcs::to_address(raw);
        (addr, true)
    }

    /// Convert a single hex ASCII byte to its 0-15 nibble value.
    /// Returns 255 (sentinel) on invalid character.
    fun hex_nibble(c: u8): u8 {
        if (c >= 48 && c <= 57) {         // '0'-'9'
            c - 48
        } else if (c >= 65 && c <= 70) {  // 'A'-'F'
            c - 55
        } else if (c >= 97 && c <= 102) { // 'a'-'f'
            c - 87
        } else {
            255 // invalid
        }
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    #[test]
    fun test_valid_domain() {
        // "prompts/" + 64-char hex of 0x0000...01
        let hex_addr = b"0000000000000000000000000000000000000000000000000000000000000001";
        let domain = b"prompts/";
        vector::append(&mut domain, hex_addr);

        let (addr, ok) = parse_prompt_id(domain);
        assert!(ok, 0);
        assert!(addr == @0x1, 1);
    }

    #[test]
    fun test_invalid_prefix() {
        let (_, ok) = parse_prompt_id(b"invalid/abc123");
        assert!(!ok, 0);
    }

    #[test]
    fun test_empty_domain() {
        let (_, ok) = parse_prompt_id(b"");
        assert!(!ok, 0);
    }

    #[test]
    fun test_short_hex() {
        // Valid prefix but hex too short
        let (_, ok) = parse_prompt_id(b"prompts/abc123");
        assert!(!ok, 0);
    }
}
