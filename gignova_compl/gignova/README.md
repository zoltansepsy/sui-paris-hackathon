# GigNova - Zero-Knowledge Freelance Platform

A decentralized freelance marketplace built on **Sui blockchain** with encrypted deliverables via **Walrus** storage and **Seal** Identity-Based Encryption. The platform solves the atomic swap problem in freelance work through escrow payments and milestone-based delivery.

## The Problem We Solve

Traditional freelance platforms suffer from trust issues:
- **Clients** fear paying before seeing completed work
- **Freelancers** fear delivering work before receiving payment

## Our Solution

Multi-layer verification with encrypted deliverables:

1. **Freelancer completes work** → uploads encrypted full deliverables + watermarked previews to Walrus
2. **Client reviews preview** → verifies quality (cannot access full work yet)
3. **Client approves milestone** → smart contract releases escrowed payment
4. **Freelancer shares decryption key** → client gets full work access
5. **Both parties rate each other** → on-chain reputation updates

## Tech Stack

| Category | Technology |
|----------|------------|
| **Blockchain** | Sui (testnet/devnet) |
| **Smart Contracts** | Move |
| **Frontend** | Next.js 16.0.3, React 19.2.0, TypeScript |
| **Styling** | Tailwind CSS 4.1.17, Radix UI |
| **Storage** | Walrus decentralized storage |
| **Encryption** | Seal Identity-Based Encryption |
| **Authentication** | zkLogin (Google OAuth) |
| **State Management** | TanStack React Query |
| **Wallet** | @mysten/dapp-kit |

## Quick Start

### Prerequisites

- Node.js 18+ (LTS recommended)
- pnpm package manager
- Sui CLI (for contract deployment)
- Sui Wallet browser extension

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd gig-nova

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Setup

The app uses Google OAuth for zkLogin authentication. Configure your OAuth credentials in [app/constants.ts](app/constants.ts):

```typescript
export const GOOGLE_CLIENT_ID = "your-google-client-id";
```

## Project Structure

```
gig-nova/
├── app/                          # Next.js frontend
│   ├── components/               # React components
│   ├── services/                 # Service layer (blockchain interactions)
│   ├── hooks/                    # Custom React hooks
│   ├── contexts/                 # React contexts (auth, navigation)
│   ├── auth/                     # zkLogin OAuth callback
│   ├── constants.ts              # Package IDs & configuration
│   └── networkConfig.ts          # Multi-network setup
├── move/                         # Smart contracts
│   └── zk_freelance/
│       ├── sources/              # Move modules
│       └── tests/                # Unit tests
├── docs/                         # Detailed documentation
└── scripts/                      # Utility scripts
```

## Smart Contracts

All contracts are in the `zk_freelance` package under [move/zk_freelance/sources/](move/zk_freelance/sources/).

### Modules

| Module | Description | LOC |
|--------|-------------|-----|
| [job_escrow.move](move/zk_freelance/sources/job_escrow.move) | Job creation, escrow, state machine, milestones | 1,215 |
| [profile_nft.move](move/zk_freelance/sources/profile_nft.move) | Dynamic NFT profiles with zkLogin support | 645 |
| [reputation.move](move/zk_freelance/sources/reputation.move) | Rating system and achievement badges | 252 |
| [whitelist.move](move/zk_freelance/sources/whitelist.move) | Seal encryption access control | 146 |

### Job State Machine

```
OPEN → ASSIGNED → IN_PROGRESS → SUBMITTED → AWAITING_REVIEW → COMPLETED
  ↓                                                              ↓
CANCELLED                                                     DISPUTED
```

### Deploying Contracts

```bash
# Navigate to Move package
cd move/zk_freelance

# Build and check for errors
sui move build

# Run tests
sui move test

# Deploy to testnet
sui client publish --gas-budget 100000000 .

# After deployment, update app/constants.ts with the new package ID
```

## Frontend Services

The service layer provides clean abstractions for blockchain interactions.

| Service | Purpose |
|---------|---------|
| [jobService.ts](app/services/jobService.ts) | Job CRUD, milestone management, escrow operations |
| [profileService.ts](app/services/profileService.ts) | Profile creation, updates, queries |
| [deliverableService.ts](app/services/deliverableService.ts) | Encrypted file upload/download workflow |
| [sealService.ts](app/services/sealService.ts) | Seal encryption/decryption |
| [walrusServiceSDK.ts](app/services/walrusServiceSDK.ts) | Walrus storage operations |
| [jobEventIndexer.ts](app/services/jobEventIndexer.ts) | Event-based marketplace discovery |
| [authService.ts](app/services/authService.ts) | zkLogin OAuth authentication |
| [reputationService.ts](app/services/reputationService.ts) | Rating and badge operations |

## Features

### Implemented

- Job creation with SUI escrow funding
- 8-state job lifecycle management
- Milestone tracking and partial payments
- Freelancer application and assignment system
- Encrypted deliverables (Seal + Walrus)
- Preview URLs for client review before payment
- Profile creation with zkLogin (Google OAuth)
- Dynamic NFT profiles with reputation tracking
- Event-based marketplace discovery (scalable)
- Multi-network support (devnet/testnet/mainnet)
- Responsive UI with dark mode support

### In Progress

- Rating submission and display
- Badge awarding automation
- Dispute resolution workflow
- Profile email verification
- Advanced search and filtering

## Architecture Highlights

### Event-Based Marketplace Discovery

Instead of querying shared objects (which doesn't scale), we use on-chain events:

```typescript
// Query JobCreated events for marketplace listings
const events = await suiClient.queryEvents({
  query: { MoveEventType: `${packageId}::job_escrow::JobCreated` },
  limit: 50
});
```

### Encrypted Deliverable Flow

```
1. Freelancer creates whitelist → adds client address
2. Encrypts deliverable with Seal → uploads to Walrus
3. Submits milestone with blob ID + preview URL
4. Client reviews preview → approves milestone
5. Client decrypts deliverable using whitelist access
```

### zkLogin Authentication

- Google OAuth for familiar login experience
- Deterministic wallet addresses from email
- Profile persistence across sessions
- No seed phrase management required

## Development Commands

```bash
# Install dependencies
pnpm install

# Development server (http://localhost:3000)
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Linting
pnpm lint
pnpm lint:fix
```

## Network Configuration

The app supports multiple Sui networks. Configure in [app/networkConfig.ts](app/networkConfig.ts):

- **Devnet**: Local development and testing
- **Testnet**: Public testing (default)
- **Mainnet**: Production (requires real SUI)

Switch networks using the network selector in the navbar.

## Documentation

Detailed documentation is available in [docs/](docs/):

- [Smart Contract Architecture](docs/smart-contract-architecture.md)
- [Walrus & Seal Integration](docs/WALRUS_SEAL_INTEGRATION.md)
- [Job Marketplace](docs/JOB_MARKETPLACE.md)
- [zkLogin Implementation](docs/ZKLOGIN_IMPLEMENTATION.md)
- [Phase One Scope](docs/PHASE_ONE_SCOPE.md)

## Testing the Platform

1. **Connect wallet** or sign in with Google (zkLogin)
2. **Create a profile** (Freelancer or Client type)
3. **As Client**: Post a job with escrow funding
4. **As Freelancer**: Browse marketplace, apply for jobs
5. **Client assigns freelancer** → work begins
6. **Freelancer submits milestone** with encrypted deliverable
7. **Client reviews preview** → approves and releases payment
8. **Client downloads** decrypted deliverable

## Troubleshooting

### Common Issues

**"Package not found"**
- Verify package ID in [constants.ts](app/constants.ts) matches deployed contract
- Ensure wallet is connected to correct network

**Walrus upload fails**
- Check wallet connection
- Verify testnet SUI balance for gas fees

**Seal decryption fails**
- Confirm address is on the whitelist
- Check session key hasn't expired (10 min TTL)
- Verify correct whitelistObjectId and nonce

**zkLogin issues**
- Clear browser localStorage
- Re-authenticate with Google
- Check OAuth redirect URL configuration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting: `pnpm lint:fix`
5. Submit a pull request

## License

[Add license information]

---

Built with Sui, Walrus, and Seal by the GigNova team.
