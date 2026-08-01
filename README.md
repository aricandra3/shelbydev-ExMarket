# ExMarket

> Decentralized AI Prompt Marketplace built on Aptos + Shelby Protocol

ExMarket lets users create, sell, and unlock AI prompts stored on-chain via Shelby's decentralized storage. Smart contracts on Aptos handle access control, payments, and revenue splits.

## Architecture

```
shelbydev/
├── contracts/          # Aptos Move smart contracts
│   ├── sources/
│   │   ├── access_control.move     # Prompt access gating
│   │   ├── ace_access_control.move # check_permission bridge for ACE workers
│   │   ├── payment.move            # Purchase & payment flow
│   │   ├── prompt_registry.move    # Prompt registration & metadata
│   │   ├── revenue_split.move      # Platform fee accounting & admin
│   │   └── unlock_history.move     # On-chain unlock records
│   └── tests/
│       └── payment_tests.move      # Money-path tests (fee split, pricing, expiry)
└── frontend/           # Next.js web app
    ├── app/            # App Router pages (dashboard, explore, create, library, prompt)
    ├── components/     # Reusable UI components
    ├── hooks/          # React hooks
    ├── lib/            # SDK clients & utilities
    └── types/          # TypeScript type definitions
```

## On-chain guarantees

The contracts enforce the marketplace rules rather than relying on the UI:

| Guarantee | Where |
|---|---|
| Fee split always pays the treasury registered at `@exmarket` — no caller-supplied registry | `prompt_registry::get_platform_config` |
| Platform fee is capped at 20%, admin-only, and every change is emitted as an event | `prompt_registry::set_platform_config` |
| Each pricing model can only be bought through its own entry function | `payment::assert_purchasable` |
| Subscription length is set by the creator; buyers choose how many periods, and renewing extends instead of resetting | `payment::subscribe_prompt`, `access_control::grant_access` |
| Nothing is sellable until its Shelby blob is linked | `prompt_registry::is_prompt_active` |
| Content is frozen after the first sale, and its sha-256 is pinned on-chain | `prompt_registry::link_blob` |

Run the test suite:

```bash
cd contracts && aptos move test --skip-fetch-latest-git-deps
```

## Storage lifetime

Shelby storage is paid up to a fixed expiry (one year at publish time), while a
listing sells perpetual access. Nothing in the protocol reconciles those two, so
the app does:

- `GET /api/v1/shelby/status?promptIds=…` reads each listing's real expiry from
  Shelby's own `blob_metadata::get_blob_metadata`, and the creator dashboard
  shows the remaining days per listing.
- Anything inside 30 days is flagged at the top of the dashboard.
- **Extend 1 year** signs `blob_metadata::increase_expiration_time`, paid in
  ShelbyUSD. Its `u64` is an *absolute* expiry in microseconds — confirmed by
  simulating both readings against the live contract, where a delta aborts — so
  the app extends from the current expiry rather than from today, and no paid
  time is thrown away.

Storage extension needs no re-upload and no contract change: the blob keeps its
identity, so buyers keep reading exactly the content they paid for.

## Programmatic access (`GET /api/v1/prompt/:id`)

Paid access for agents and backends. Every call proves wallet ownership; no
session, no API key of ours.

| Header | Value |
|---|---|
| `X-Wallet-Address` | buyer's address |
| `X-Wallet-Public-Key` | Ed25519 public key (must derive to that address) |
| `X-Wallet-Signature` | signature over the message below |
| `X-Wallet-Message` | **base64** of the exact signed message (it is multi-line, so it cannot travel raw in a header) |
| `X-Wallet-Timestamp` | unix ms, valid for 5 minutes |
| `X-Wallet-Nonce` | 16–128 chars, single use |
| `X-Consume-Tx` | api-pay-per-call listings only: hash of a fresh `access_control::consume_api_call` |

Message to sign:

```
ExMarket API prompt access
Prompt: <prompt_id>
Wallet: <wallet_address>
Timestamp: <unix_ms>
Nonce: <random>
```

Any rejection returns `required_message` showing exactly what to sign. Responses:

- `200` — `ciphertext_hex`, `domain_hex`, `content_hash`, and `calls_remaining`
  for metered listings. The payload is ACE-encrypted: decrypt client-side with
  the buyer's wallet, then check it against `content_hash`. The server cannot
  decrypt it, which is the point.
- `402` — no access yet, or a per-call listing missing/reusing its consume tx
- `409` — listing deactivated, or content not stored yet
- `401` — proof missing, stale, replayed, or bound to another prompt

Per-call billing is the caller's own `consume_api_call` transaction rather than
a platform-side counter: `consume_api_call` takes the user's signer, so no
server key can spend someone's quota. One transaction per served response.

## Quick Start

### 1. Deploy Contracts

The `Registry` and `PlatformAdmin` resources live at `@exmarket`, so the
publishing account **is** the admin account — `initialize` rejects anyone else.

```bash
cd contracts
aptos move test --skip-fetch-latest-git-deps
aptos move compile
aptos move publish

# Initialize modules (must be signed by the publishing account)
aptos move run --function-id default::prompt_registry::initialize \
  --args address:YOUR_TREASURY_ADDRESS

aptos move run --function-id default::revenue_split::initialize
```

Copy the deployed address and set it as `NEXT_PUBLIC_MODULE_ADDRESS` in `frontend/.env.local`.

> **Upgrading from an earlier deployment:** `PromptMetadata` gained fields and
> the payment entry functions changed shape, so Aptos will reject an in-place
> module upgrade. Publish to a fresh account and point
> `NEXT_PUBLIC_MODULE_ADDRESS` at it; listings from the old address are not
> migrated.

> **Framework pin:** `Move.toml` tracks the `mainnet` framework branch. The
> `testnet` branch currently uses spec syntax that Aptos CLI 8.1.0 cannot
> compile.

### 2. Run Frontend

```bash
cd frontend
cp .env.example .env.local
# Fill in your values in .env.local

pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

See [`frontend/.env.example`](frontend/.env.example) for the full list. Key variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_NETWORK` | `testnet` or `shelbynet` |
| `NEXT_PUBLIC_MODULE_ADDRESS` | Deployed ExMarket contract address |
| `APTOS_API_KEY` | Server-side Aptos/Shelby API key |
| `APTOS_API_ORIGIN` | Only for a Geomi client key; leave unset for a Server key |
| `SHELBY_API_KEY` | Server-side Shelby API key. Also what egress is billed against — reads go through `/api/v1/shelby/blob`, never straight from the browser. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Redis REST credentials required to share rate limits, proof nonces, and upload state across Vercel instances |

### Network Presets

**testnet:**
```env
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_APTOS_NODE_URL=https://api.testnet.aptoslabs.com/v1
NEXT_PUBLIC_APTOS_INDEXER_URL=https://api.testnet.aptoslabs.com/v1/graphql
NEXT_PUBLIC_SHELBY_RPC_URL=https://api.testnet.shelby.xyz/shelby
```

**shelbynet** *(dev prototype, wiped weekly)*:
```env
NEXT_PUBLIC_NETWORK=shelbynet
NEXT_PUBLIC_APTOS_NODE_URL=https://api.shelbynet.shelby.xyz/v1
NEXT_PUBLIC_APTOS_INDEXER_URL=https://api.shelbynet.shelby.xyz/v1/graphql
NEXT_PUBLIC_SHELBY_RPC_URL=https://api.shelbynet.shelby.xyz/shelby
```

## Tech Stack

- **Smart Contracts** — Aptos Move
- **Frontend** — Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Storage** — [Shelby Protocol](https://docs.shelby.xyz) (decentralized storage on Aptos)
- **Wallet** — Aptos wallet adapter
- **Package Manager** — pnpm

## Links

- [Shelby Protocol Docs](https://docs.shelby.xyz)
- [Aptos Docs](https://aptos.dev)
