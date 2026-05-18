/// Wallet storage cleanup helpers

export const WALLET_STORAGE_KEYS_TO_RESET = [
    "AptosWalletName",
    "@aptos-connect/connectedAccount",
    "@aptos-connect/dapp-local-state",
    "icDappPairings",
];

const WALLET_JSON_STORAGE_KEYS = [
    "@aptos-connect/connectedAccount",
    "@aptos-connect/dapp-local-state",
    "icDappPairings",
];

export function resetWalletStorage() {
    if (typeof window === "undefined") return;

    WALLET_STORAGE_KEYS_TO_RESET.forEach((key) => {
        window.localStorage.removeItem(key);
    });
}

export function sanitizeWalletStorage() {
    if (typeof window === "undefined") return;

    for (const key of WALLET_JSON_STORAGE_KEYS) {
        const value = window.localStorage.getItem(key);
        if (!value) continue;

        try {
            JSON.parse(value);
        } catch {
            resetWalletStorage();
            return;
        }
    }
}
