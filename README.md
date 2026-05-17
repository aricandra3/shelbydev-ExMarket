# ExMarket

> Decentralized AI Prompt Marketplace built on Aptos + Shelby Protocol

ExMarket lets users create, sell, and unlock AI prompts stored on-chain via Shelby's decentralized storage. Smart contracts on Aptos handle access control, payments, and revenue splits.

## Architecture

```
shelbydev/
├── contracts/          # Aptos Move smart contracts
│   └── sources/
│       ├── access_control.move    # Prompt access gating
│       ├── payment.move           # Purchase & payment flow
│       ├── prompt_registry.move   # Prompt registration & metadata
│       ├── revenue_split.move     # Creator revenue distribution
│       └── unlock_history.move    # On-chain unlock records
└── frontend/           # Next.js web app
    ├── app/            # App Router pages (dashboard, explore, create, library, prompt)
    ├── components/     # Reusable UI components
    ├── hooks/          # React hooks
    ├── lib/            # SDK clients & utilities
    └── types/          # TypeScript type definitions
```

## Quick Start

### 1. Deploy Contracts

```bash
cd contracts
aptos move compile --named-addresses exmarket=default
aptos move publish --named-addresses exmarket=default

# Initialize modules
aptos move run --function-id default::prompt_registry::initialize \
  --args address:YOUR_TREASURY_ADDRESS

aptos move run --function-id default::revenue_split::initialize
```

Copy the deployed address and set it as `NEXT_PUBLIC_MODULE_ADDRESS` in `frontend/.env.local`.

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
| `APTOS_API_ORIGIN` | Origin allowed by your Aptos API key |
| `SHELBY_API_KEY` | Server-side Shelby API key |

### Network Presets

**testnet:**
```env
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_APTOS_NODE_URL=https://api.testnet.aptoslabs.com/v1
NEXT_PUBLIC_APTOS_INDEXER_URL=https://api.testnet.aptoslabs.com/v1/graphql
NEXT_PUBLIC_SHELBY_RPC_URL=https://api.testnet.shelby.xyz/shelby
NEXT_PUBLIC_SHELBY_CONTRACT_ADDRESS=0xc63d6a5efb0080a6029403131715bd4971e1149f7cc099aac69bb0069b3ddbf5
```

**shelbynet** *(dev prototype, wiped weekly)*:
```env
NEXT_PUBLIC_NETWORK=shelbynet
NEXT_PUBLIC_APTOS_NODE_URL=https://api.shelbynet.shelby.xyz/v1
NEXT_PUBLIC_APTOS_INDEXER_URL=https://api.shelbynet.shelby.xyz/v1/graphql
NEXT_PUBLIC_SHELBY_RPC_URL=https://api.shelbynet.shelby.xyz/shelby
NEXT_PUBLIC_SHELBY_CONTRACT_ADDRESS=0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a
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
