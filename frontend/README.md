# ExMarket Frontend

> Decentralized AI Prompt Marketplace on Aptos + Shelby Protocol

## Setup

```bash
cd frontend
pnpm install
pnpm dev
```

## Environment

Copy `.env.example` → `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

### Required Variables

| Variable | Description | Source |
|---|---|---|
| `NEXT_PUBLIC_NETWORK` | `testnet` or `shelbynet` | Choose your network |
| `NEXT_PUBLIC_APTOS_NODE_URL` | Aptos fullnode URL | [Shelby Networks](https://docs.shelby.xyz/protocol/architecture/networks) |
| `NEXT_PUBLIC_APTOS_INDEXER_URL` | Aptos indexer GraphQL URL | Same as above |
| `NEXT_PUBLIC_SHELBY_RPC_URL` | Shelby RPC endpoint | Same as above |
| `NEXT_PUBLIC_MODULE_ADDRESS` | Your deployed ExMarket contract | After `aptos move publish` |
| `NEXT_PUBLIC_APTOS_API_KEY` | Aptos/Shelby API key | [Geomi Platform](https://docs.shelby.xyz/sdks/typescript/acquire-api-keys) |
| `SHELBY_API_KEY` | Server-side Shelby API key | Same as above |

### Network Presets

**testnet** (Aptos testnet + Shelby testnet):
```env
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_APTOS_NODE_URL=https://api.testnet.aptoslabs.com/v1
NEXT_PUBLIC_APTOS_INDEXER_URL=https://api.testnet.aptoslabs.com/v1/graphql
NEXT_PUBLIC_SHELBY_RPC_URL=https://api.testnet.shelby.xyz/shelby
NEXT_PUBLIC_SHELBY_CONTRACT_ADDRESS=0xc63d6a5efb0080a6029403131715bd4971e1149f7cc099aac69bb0069b3ddbf5
```

**shelbynet** (Shelby's dev prototype — wiped weekly):
```env
NEXT_PUBLIC_NETWORK=shelbynet
NEXT_PUBLIC_APTOS_NODE_URL=https://api.shelbynet.shelby.xyz/v1
NEXT_PUBLIC_APTOS_INDEXER_URL=https://api.shelbynet.shelby.xyz/v1/graphql
NEXT_PUBLIC_SHELBY_RPC_URL=https://api.shelbynet.shelby.xyz/shelby
NEXT_PUBLIC_SHELBY_CONTRACT_ADDRESS=0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a
```

## Shelby SDK

The `lib/shelby.ts` file has two integration modes:

1. **`@shelby/sdk`** (recommended) — uncomment the SDK import section once you have API access
2. **REST fallback** — direct HTTP calls to Shelby RPC endpoint (active by default)

```typescript
// In lib/shelby.ts, uncomment:
import { ShelbyNodeClient } from "@shelby/sdk";
```

## Deploy Contract

```bash
cd ../contracts
aptos move compile --named-addresses exmarket=default
aptos move publish --named-addresses exmarket=default

# Initialize registry
aptos move run --function-id default::prompt_registry::initialize \
  --args address:YOUR_TREASURY_ADDRESS

aptos move run --function-id default::revenue_split::initialize
```

Then update `NEXT_PUBLIC_MODULE_ADDRESS` in `.env.local` with your deployed address.
