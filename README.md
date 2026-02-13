# SUI Paris Hack

24h hackathon dApp skeleton on SUI. Team of 4 – ready to build at full speed.

## Prerequisites

- **Node.js** 18+
- **pnpm** 9+
- **SUI CLI** ([install guide](https://docs.sui.io/build/install))

## Quick start

```bash
pnpm install
pnpm dev
```

App runs at [http://localhost:3000](http://localhost:3000). Use the Connect button to connect a SUI wallet.

## Commands

| Command                                          | Description                           |
| ------------------------------------------------ | ------------------------------------- |
| `pnpm dev`                                       | Run the dApp (Next.js) in development |
| `pnpm build`                                     | Build all packages and the dApp       |
| `pnpm type-check`                                | Type-check all packages               |
| `pnpm lint`                                      | Lint all packages                     |
| `pnpm --filter @hack/blockchain build:contracts` | Build Move contracts                  |
| `pnpm --filter @hack/blockchain test:contracts`  | Test Move contracts                   |

## Project structure

- **apps/dapp** – Next.js front-end (wallet connect, UI)
- **packages/blockchain** – SUI Move contracts + TypeScript SDK (network config, future contract helpers)
- **packages/types** – Shared TypeScript types
- **packages/ui** – Shared UI components (Button, Card)
- **packages/config/typescript** – Shared tsconfig base and Next.js config

## Deploy contracts

```bash
cd packages/blockchain/contracts
sui move build
sui client publish --gas-budget 100000000
```

Save the Package ID and any object IDs, then add them to `packages/blockchain/sdk/networkConfig.ts` under the right network’s `variables` (and optionally to `apps/dapp/.env.local`).

## Pre-hackathon checklist

See **[docs/PRE-HACKATHON-CHECKLIST.md](docs/PRE-HACKATHON-CHECKLIST.md)** for the list to run through when the hackathon starts (env, deps, Move build, deploy, wallet connect, team roles).
