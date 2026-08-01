/// Server-side wallet ownership proofs.
///
/// Any endpoint that acts on behalf of a wallet — serving paid content, or
/// spending our Shelby quota under that wallet's account — needs to know the
/// caller actually controls it. The caller signs a message that names the
/// action and its parameters, and we verify the signature against the address
/// derived from the public key.
///
/// Two shapes are accepted for the signed message:
///   - the required message verbatim (programmatic callers signing raw bytes)
///   - a wrapper containing it (browser wallets add their own preamble to
///     signMessage, so the signature covers `fullMessage`, not our string)
///
/// Either way every binding line must be present, and the nonce is single-use.

import {
    AccountAddress,
    AuthenticationKey,
    Ed25519PublicKey,
    Ed25519Signature,
} from "@aptos-labs/ts-sdk";
import { reserveOnce } from "./durableStore";

const PROOF_MAX_AGE_MS = 5 * 60 * 1000;
const PROOF_CLOCK_SKEW_MS = 30 * 1000;

/// Returns false when this nonce was already used for the same scope.
export async function consumeNonce(scope: string, nonce: string) {
    return reserveOnce(
        `exmarket:nonce:${scope}:${nonce}`,
        Math.ceil((PROOF_MAX_AGE_MS + PROOF_CLOCK_SKEW_MS) / 1_000)
    );
}

export type WalletProofHeaders = {
    publicKey: string | null;
    signature: string | null;
    message: string | null;
    timestamp: string | null;
    nonce: string | null;
};

export function readWalletProofHeaders(headers: Headers): WalletProofHeaders {
    return {
        publicKey: headers.get("X-Wallet-Public-Key"),
        signature: headers.get("X-Wallet-Signature"),
        message: headers.get("X-Wallet-Message"),
        timestamp: headers.get("X-Wallet-Timestamp"),
        nonce: headers.get("X-Wallet-Nonce"),
    };
}

/// The signed message is multi-line, and newlines cannot travel in an HTTP
/// header value, so X-Wallet-Message carries base64. The signature is verified
/// against the decoded bytes.
function decodeSignedMessage(encoded: string): string | null {
    try {
        const decoded = Buffer.from(encoded, "base64").toString("utf8");
        if (!decoded.trim()) return null;
        // Reject input that was not really base64: re-encoding must round-trip.
        if (Buffer.from(decoded, "utf8").toString("base64") !== encoded.trim()) {
            return null;
        }
        return decoded;
    } catch {
        return null;
    }
}

export function encodeSignedMessage(message: string): string {
    return Buffer.from(message, "utf8").toString("base64");
}

/// The message a caller must sign: an action line, the bindings that scope the
/// request, then freshness fields.
export function buildProofMessage(params: {
    action: string;
    bindings: Array<[string, string]>;
    timestamp: string;
    nonce: string;
}) {
    return [
        params.action,
        ...params.bindings.map(([label, value]) => `${label}: ${value}`),
        `Timestamp: ${params.timestamp}`,
        `Nonce: ${params.nonce}`,
    ].join("\n");
}

export function buildProofMessageFormat(params: {
    action: string;
    bindings: Array<[string, string]>;
}) {
    return buildProofMessage({
        ...params,
        timestamp: "<unix_ms>",
        nonce: "<random_16_to_128_chars>",
    });
}

function validateFreshness(timestamp: string | null, nonce: string | null) {
    if (!timestamp || !nonce) return "Missing wallet proof timestamp or nonce";
    if (!/^\d{10,17}$/.test(timestamp)) return "Invalid wallet proof timestamp";
    if (nonce.length < 16 || nonce.length > 128 || /\s/.test(nonce)) {
        return "Invalid wallet proof nonce";
    }

    const timestampMs = Number(timestamp);
    const now = Date.now();

    if (!Number.isFinite(timestampMs)) return "Invalid wallet proof timestamp";
    if (timestampMs > now + PROOF_CLOCK_SKEW_MS) {
        return "Wallet proof timestamp is too far in the future";
    }
    if (now - timestampMs > PROOF_MAX_AGE_MS) return "Wallet proof has expired";

    return null;
}

export type WalletProofResult =
    | { ok: true; walletAddress: string; nonce: string }
    | { ok: false; error: string; requiredMessage: string };

/// Verify that the caller controls `walletAddress` and signed for exactly this
/// action and bindings. `scope` namespaces the replay cache.
export async function verifyWalletProof(params: {
    headers: Headers;
    walletAddress: string;
    action: string;
    bindings: Array<[string, string]>;
    scope: string;
}): Promise<WalletProofResult> {
    const { headers, action, bindings, scope } = params;
    const proof = readWalletProofHeaders(headers);

    let walletAddress: string;
    try {
        walletAddress = AccountAddress.fromString(params.walletAddress).toString();
    } catch {
        return {
            ok: false,
            error: "Invalid wallet address",
            requiredMessage: buildProofMessageFormat({ action, bindings }),
        };
    }

    const format = buildProofMessageFormat({ action, bindings });

    if (!proof.publicKey || !proof.signature || !proof.message) {
        return {
            ok: false,
            error: "Missing wallet proof headers",
            requiredMessage: format,
        };
    }

    const signedMessage = decodeSignedMessage(proof.message);
    if (!signedMessage) {
        return {
            ok: false,
            error: "X-Wallet-Message must be the base64 encoding of the signed message",
            requiredMessage: format,
        };
    }

    const freshnessError = validateFreshness(proof.timestamp, proof.nonce);
    if (freshnessError) {
        return { ok: false, error: freshnessError, requiredMessage: format };
    }

    const timestamp = proof.timestamp as string;
    const nonce = proof.nonce as string;
    const requiredMessage = buildProofMessage({
        action,
        bindings,
        timestamp,
        nonce,
    });

    // The signature covers proof.message. A browser wallet wraps our text in
    // its own preamble, so require containment rather than equality — every
    // binding, the timestamp and the nonce still have to be in there.
    if (!signedMessage.includes(requiredMessage)) {
        return {
            ok: false,
            error: "Wallet proof message does not match this request",
            requiredMessage,
        };
    }

    let publicKey: Ed25519PublicKey;
    let signature: Ed25519Signature;
    try {
        publicKey = new Ed25519PublicKey(proof.publicKey);
        signature = new Ed25519Signature(proof.signature);
    } catch {
        return {
            ok: false,
            error: "Malformed wallet public key or signature",
            requiredMessage,
        };
    }

    const derivedAddress = AuthenticationKey.fromPublicKey({ publicKey })
        .derivedAddress()
        .toString();

    if (derivedAddress !== walletAddress) {
        return {
            ok: false,
            error: "Wallet proof public key does not match wallet address",
            requiredMessage,
        };
    }

    const valid = publicKey.verifySignature({
        message: new TextEncoder().encode(signedMessage),
        signature,
    });

    if (!valid) {
        return {
            ok: false,
            error: "Invalid wallet proof signature",
            requiredMessage,
        };
    }

    if (!(await consumeNonce(`${scope}:${walletAddress}`, nonce))) {
        return {
            ok: false,
            error: "Wallet proof nonce has already been used",
            requiredMessage,
        };
    }

    return { ok: true, walletAddress, nonce };
}
