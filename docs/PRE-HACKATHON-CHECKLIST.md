# Pre-Hackathon Checklist

Use this list when the hackathon starts so you only run and verify—no structural decisions.

## Environment

- [ ] Node 18+ and pnpm 9+ installed on all machines
- [ ] SUI CLI installed and on PATH (`sui --version`)
- [ ] Git remote added (e.g. GitHub) and all members have access

## Repo and deps

- [ ] `git clone` (or pull) and `pnpm install` at repo root
- [ ] `pnpm type-check` and `pnpm lint` pass at root

## Move

- [ ] `pnpm --filter @hack/blockchain build:contracts` succeeds
- [ ] Decide network (e.g. testnet): set `defaultNetwork` in `apps/dapp/app/providers.tsx` and optionally `NEXT_PUBLIC_SUI_NETWORK` in `apps/dapp/.env.local`
- [ ] (When ready) Deploy: `cd packages/blockchain/contracts && sui client publish --gas-budget 100000000`; save Package ID and any object IDs
- [ ] Add deployed IDs to `packages/blockchain/sdk/networkConfig.ts` under the right network’s `variables`

## dApp

- [ ] `pnpm dev` (or `pnpm --filter @hack/dapp dev`) runs; app loads at http://localhost:3000
- [ ] Connect wallet (Sui Wallet / dapp-kit ConnectButton); switch network if needed
- [ ] One successful read or write to your contract (after deployment) so the full stack is proven

## Team

- [ ] Roles agreed (e.g. 2 Move, 2 frontend/integration)
- [ ] Who deploys contracts and updates `networkConfig` / env (e.g. one “contract lead”)
- [ ] Branch strategy (e.g. main + feature branches or one shared branch)
