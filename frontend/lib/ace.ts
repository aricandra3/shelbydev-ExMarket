/// ACE (Access-Controlling Encrypted data) integration
/// SDK: @aptos-labs/ace-sdk v0.1.1
/// Protocol: https://github.com/aptos-labs/ace
///
/// Key flow:
///   Creator: aceEncrypt(content, promptId) → putEncryptedBlob({ ciphertext, domain }) to Shelby
///   Buyer:   readEncryptedBlob(blobId) → wallet.signMessage(domain) → aceDecrypt(…) → plaintext

"use client";

// The SDK exports a namespace `ace` containing all the client-facing classes/functions.
import { ace } from "@aptos-labs/ace-sdk";
import { AccountAddress, type AccountPublicKey, type Signature } from "@aptos-labs/ts-sdk";

import { MODULE_ADDRESS } from "./constants";

// ── Committee ────────────────────────────────────────────────────────────────
//
// Public test workers hosted by Aptos Labs — suitable for dev & testnet.
// For production, deploy and register your own ACE workers.

export const ACE_COMMITTEE = new ace.Committee({
    workerEndpoints: [
        "https://ace-worker-0-646682240579.europe-west1.run.app",
        "https://ace-worker-1-646682240579.europe-west1.run.app",
    ],
    threshold: 2,
});

// ── Contract ID ──────────────────────────────────────────────────────────────
//
// Points ACE workers to our on-chain check_permission view function.
// Workers will call: exmarket::ace_access_control::check_permission(user, domain)

export const ACE_CONTRACT_ID = ace.ContractID.newAptos({
    chainId: 2, // Aptos testnet
    moduleAddr: AccountAddress.fromString(MODULE_ADDRESS),
    moduleName: "ace_access_control",
    functionName: "check_permission",
});

// ── Domain encoding ──────────────────────────────────────────────────────────
//
// Domain = the identity used to derive a per-prompt encryption key.
// We encode as "prompts/<64-char-hex>" so our Move parser can reverse it.

export function promptIdToDomain(promptId: string): Uint8Array {
    const hex = promptId.replace(/^0x/, "").padStart(64, "0").toLowerCase();
    return new TextEncoder().encode(`prompts/${hex}`);
}

// ── Encrypt ──────────────────────────────────────────────────────────────────
//
// Called by the creator when uploading a new prompt.
// Returns serializable { ciphertextHex, domainHex } for storage in Shelby.

export async function aceEncrypt(
    plaintext: string,
    promptId: string
): Promise<{ ciphertextHex: string; domainHex: string }> {
    const encryptionKey = await ace.EncryptionKey.fetch({ committee: ACE_COMMITTEE });
    const ek = encryptionKey.unwrapOrThrow("Failed to fetch ACE encryption key");

    const domain = promptIdToDomain(promptId);

    const result = ace.encrypt({
        encryptionKey: ek,
        contractId: ACE_CONTRACT_ID,
        domain,
        plaintext: new TextEncoder().encode(plaintext),
    });

    const { ciphertext, fullDecryptionDomain } = result.unwrapOrThrow("ACE encryption failed");

    return {
        ciphertextHex: ciphertext.toHex(),
        domainHex: fullDecryptionDomain.toHex(),
    };
}

// ── Decrypt ───────────────────────────────────────────────────────────────────
//
// Called by the buyer after paying and signing the domain message.
// ACE workers verify the signature, check permissions on-chain, then release key shares.

export async function aceDecrypt(params: {
    ciphertextHex: string;
    domainHex: string;
    userAddr: string;
    publicKey: AccountPublicKey;
    signature: Signature;
    fullMessage: string;
}): Promise<string> {
    const { ciphertextHex, domainHex, userAddr, publicKey, signature, fullMessage } = params;

    // Parse ciphertext — failure means blob was uploaded without ACE (plaintext prompt)
    const ciphertextResult = ace.Ciphertext.fromHex(ciphertextHex);
    if (!ciphertextResult.isOk) {
        const reason = errString(ciphertextResult.errValue);
        throw new Error(`Invalid ciphertext — prompt may predate encryption. (${reason})`);
    }
    const ciphertext = ciphertextResult.okValue!;

    // Parse ACE domain
    const domainResult = ace.FullDecryptionDomain.fromHex(domainHex);
    if (!domainResult.isOk) {
        const reason = errString(domainResult.errValue);
        throw new Error(`Invalid ACE domain — blob data may be corrupted. (${reason})`);
    }
    const fullDecryptionDomain = domainResult.okValue!;

    const proof = ace.ProofOfPermission.createAptos({
        userAddr: AccountAddress.fromString(userAddr),
        publicKey,
        signature,
        fullMessage,
    });

    // Contact ACE workers — they call check_permission on-chain before releasing key shares
    const decryptionKeyResult = await ace.DecryptionKey.fetch({
        committee: ACE_COMMITTEE,
        contractId: fullDecryptionDomain.contractId,
        domain: fullDecryptionDomain.domain,
        proof,
    });

    if (!decryptionKeyResult.isOk) {
        console.error("ACE worker error:", decryptionKeyResult.errValue);
        const reason = errString(decryptionKeyResult.errValue);
        throw new Error(`ACE workers rejected: ${reason}`);
    }
    const dk = decryptionKeyResult.okValue!;

    const decryptedResult = ace.decrypt({ decryptionKey: dk, ciphertext });
    if (!decryptedResult.isOk) {
        throw new Error(`ACE client-side decryption failed: ${errString(decryptedResult.errValue)}`);
    }

    return new TextDecoder().decode(decryptedResult.okValue!);
}

/** Safely extract a readable message from an ACE error value */
function errString(e: unknown): string {
    if (typeof e === "string") return e;
    if (e instanceof Error) return e.message;
    try { return JSON.stringify(e); } catch { return String(e); }
}



// ── Pretty message for wallet signing ────────────────────────────────────────
//
// Returns the human-readable message the user must sign to prove permission.
// The wallet will display this message to the user before signing.

export function getSigningMessage(domainHex: string): string {
    const fullDecryptionDomain = ace.FullDecryptionDomain.fromHex(domainHex).unwrapOrThrow("Invalid domain");
    return fullDecryptionDomain.toPrettyMessage();
}
