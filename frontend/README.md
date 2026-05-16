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
| `SHELBY_API_KEY` | Server-side Shelby API key (secret) |

## Shelby SDK

`lib/shelby.ts` supports two modes:

1. **`@shelby-protocol/sdk`** *(recommended)* — uncomment once you have API access
2. **REST fallback** — direct HTTP to Shelby RPC (active by default)

## Deploy Contract

See [contracts setup](../README.md#1-deploy-contracts) in the root README.
