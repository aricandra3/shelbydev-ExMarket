# ExMarket Frontend

> Next.js web app for the ExMarket decentralized AI prompt marketplace.

## Setup

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

```bash
cp .env.example .env.local
```

Fill in your values. See the [root README](../README.md) for full environment variable docs and network presets.

### Required Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_NETWORK` | `testnet` or `shelbynet` |
| `NEXT_PUBLIC_APTOS_NODE_URL` | Aptos fullnode URL |
| `NEXT_PUBLIC_APTOS_INDEXER_URL` | Aptos indexer GraphQL URL |
| `NEXT_PUBLIC_SHELBY_RPC_URL` | Shelby RPC endpoint |
| `NEXT_PUBLIC_MODULE_ADDRESS` | Deployed ExMarket contract address |
| `APTOS_API_KEY` | Server-side Aptos/Shelby API key |
| `APTOS_API_ORIGIN` | Only for a Geomi client key; leave unset for a Server key |
| `SHELBY_API_KEY` | Server-side Shelby API key (secret) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Redis REST credentials required for durable rate limits, proof nonces, and upload state |

## Shelby SDK

`lib/shelby.ts` supports two modes:

1. **`@shelby-protocol/sdk`** *(recommended)* — uncomment once you have API access
2. **REST fallback** — direct HTTP to Shelby RPC (active by default)

## Prompt API Proof

`GET /api/v1/prompt/:id` requires a fresh wallet proof. Sign this exact message:

```text
ExMarket API prompt access
Prompt: <prompt_id>
Wallet: <normalized_wallet_address>
Timestamp: <unix_ms>
Nonce: <random_16_to_128_chars>
```

Send it with `X-Wallet-Address`, `X-Wallet-Public-Key`, `X-Wallet-Signature`,
`X-Wallet-Message`, `X-Wallet-Timestamp`, and `X-Wallet-Nonce`. Timestamps expire
after five minutes and nonces are one-time use per wallet and prompt.

## Deploy Contract

See [contracts setup](../README.md#1-deploy-contracts) in the root README.
