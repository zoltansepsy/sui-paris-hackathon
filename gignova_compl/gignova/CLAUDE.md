# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js dApp built on the Sui blockchain featuring a **Zero-Knowledge Freelance Platform** with **Walrus** (decentralized storage) and **Seal** (Identity-Based Encryption). The platform solves the atomic swap problem in freelance work through:

- **Encrypted Deliverables**: Work is stored encrypted on Walrus, only accessible after payment
- **Escrow Payments**: Smart contract holds funds until milestone approval
- **Milestone System**: Break projects into verifiable stages with partial payments
- **Dynamic NFT Profiles**: On-chain reputation with ratings and badges
- **Access Control**: Seal encryption ensures only authorized parties can access work

### Platform Concept

**Problem**: Traditional freelance platforms suffer from trust issues - clients fear paying before seeing work, freelancers fear delivering before payment.

**Solution**: Multi-layer verification with encrypted previews:
1. Freelancer completes work, uploads encrypted full deliverables + watermarked previews to Walrus
2. Client reviews preview to verify quality (cannot access full work)
3. Client approves milestone, smart contract releases payment
4. Freelancer shares decryption key, client gets full work
5. Both parties rate each other, updating on-chain reputation

## MVP Architecture

### Phase 1 - Hackathon Core (3 Developers)

**Dev 1 (Smart Contract Lead)**: Move contracts in [move/zk_freelance/sources/](move/zk_freelance/sources/)
- [job_escrow.move](move/zk_freelance/sources/job_escrow.move) - Job posting, escrow, state machine
- [profile_nft.move](move/zk_freelance/sources/profile_nft.move) - Dynamic NFT profiles
- [milestone.move](move/zk_freelance/sources/milestone.move) - Milestone management
- [reputation.move](move/zk_freelance/sources/reputation.move) - Rating system

**Dev 2 (Integration Lead)**: Service layer in [app/services/](app/services/)
- [jobService.ts](app/services/jobService.ts) - Job operations
- [profileService.ts](app/services/profileService.ts) - Profile management
- [reputationService.ts](app/services/reputationService.ts) - Ratings
- Custom hooks in [app/hooks/](app/hooks/)

**Dev 3 (Frontend Lead)**: UI components and views
- Components in [app/components/](app/components/)
- Views: Marketplace, My Jobs, Profile, Job Detail, Create Job
- Integration with services via hooks

## Core Technologies

- **Frontend**: Next.js 16.0.3 with React 19.2.0, TypeScript, Tailwind CSS 4.1.17
- **Blockchain**: Sui blockchain (testnet)
- **Storage**: Walrus decentralized storage network (@mysten/walrus SDK)
- **Encryption**: Seal Identity-Based Encryption (@mysten/seal SDK)
- **UI**: Radix UI components with shadcn/ui patterns
- **State Management**: @tanstack/react-query for data fetching
- **Wallet**: @mysten/dapp-kit for wallet connections

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

## Smart Contract Development

### Move Package Location
- All Move smart contracts are in [move/zk_freelance/](move/zk_freelance/)
- Package name: `zk_freelance`
- Modules: `counter` and `whitelist`

### Deploying Smart Contracts

```bash
# Navigate to Move directory
cd move/zk_freelance

# Build (check for errors)
sui move build

# Test
sui move test

# Deploy to testnet
sui client publish --gas-budget 100000000 .

# After deployment, update constants.ts with the new package ID
```

### Important: After Deployment
Always update [app/constants.ts](app/constants.ts) with the new package ID:
```typescript
// All platform modules are in same package
export const TESTNET_JOB_ESCROW_PACKAGE_ID = "0xYOUR_NEW_PACKAGE_ID";
export const TESTNET_PROFILE_NFT_PACKAGE_ID = "0xYOUR_NEW_PACKAGE_ID";
export const TESTNET_REPUTATION_PACKAGE_ID = "0xYOUR_NEW_PACKAGE_ID";
```

## Freelance Platform Architecture

### Job Lifecycle & State Machine

**Job States** ([job_escrow.move:17-24](move/zk_freelance/sources/job_escrow.move#L17-L24)):
1. **OPEN** (0) - Job posted, accepting applications
2. **ASSIGNED** (1) - Freelancer selected, not yet started
3. **IN_PROGRESS** (2) - Work actively being done
4. **SUBMITTED** (3) - Milestone submitted for review
5. **AWAITING_REVIEW** (4) - Client reviewing submission
6. **COMPLETED** (5) - All milestones approved, payment released
7. **CANCELLED** (6) - Job cancelled, funds refunded
8. **DISPUTED** (7) - Dispute raised (future feature)

**State Transitions**:
```
OPEN → ASSIGNED (client assigns freelancer)
ASSIGNED → IN_PROGRESS (freelancer starts work)
IN_PROGRESS → SUBMITTED (freelancer submits milestone)
SUBMITTED → AWAITING_REVIEW (system state)
AWAITING_REVIEW → IN_PROGRESS (client requests revision) OR COMPLETED (client approves)
OPEN/ASSIGNED → CANCELLED (client cancels before work starts)
```

### Smart Contract Modules

#### 1. Job Escrow Module ([job_escrow.move](move/zk_freelance/sources/job_escrow.move))

**Core Functionality**:
- **Job Creation**: Client posts job with description (Walrus blob ID) and budget
- **Escrow Management**: Holds SUI funds in `Balance<SUI>` until milestone approval
- **Milestone System**: Track multiple milestones per job with individual amounts
- **Access Control**: JobCap capability pattern for client operations
- **Deadline Enforcement**: Uses `Clock` object for timestamp validation

**Key Structs**:
```move
public struct Job has key {
    id: UID,
    client: address,
    freelancer: Option<address>,
    title: vector<u8>,
    description_blob_id: vector<u8>,  // Walrus storage
    budget: u64,
    escrow: Balance<SUI>,
    state: u8,
    milestones: Table<u64, Milestone>,
    applicants: vector<address>,
    deadline: u64,
    deliverable_blob_ids: vector<vector<u8>>,  // Encrypted with Seal
}

public struct JobCap has key, store {
    id: UID,
    job_id: ID,  // Links to specific job
}
```

**Entry Functions** (with mandatory profile integration):
- `create_job(client_profile, ...)` - Create job with escrow funding, adds to client's active jobs
- `apply_for_job(freelancer_profile, ...)` - Freelancer applies (profile required for validation, read-only)
- `assign_freelancer(job, cap, freelancer_addr, ...)` - Client selects freelancer (no profiles needed - ownership fix)
- `start_job(freelancer_profile, ...)` - Freelancer begins work, updates profile (total_jobs +1, active_jobs updated)
- `submit_milestone()` - Freelancer submits with proof blob ID (no profile change)
- `approve_milestone(job, cap, milestone_id, client_profile, freelancer_profile, ...)` - Client approves, releases funds, updates profiles on job completion
- `add_milestone()` - Client adds milestone before assignment (no profile change)
- `cancel_job(job, cap, client_profile, ...)` - Client cancels (OPEN state), refunds escrow, removes from client profile
- `cancel_job_with_freelancer(job, cap, client_profile, freelancer_profile, ...)` - Client cancels (ASSIGNED state), removes from both profiles

#### 2. Profile NFT Module ([profile_nft.move](move/zk_freelance/sources/profile_nft.move))

**Core Functionality**:
- **Dynamic NFTs**: Profile data updates on-chain (not static metadata)
- **Reputation Tracking**: Average rating, job counts, total earnings
- **Profile Types**: Separate freelancer and client profiles (enum)
- **Verification**: Admin-controlled verification badge
- **Active Jobs**: VecSet tracks current job IDs

**Key Structs**:
```move
public struct Profile has key, store {
    id: UID,
    owner: address,
    profile_type: u8,  // FREELANCER (0) or CLIENT (1)
    username: String,
    bio: String,
    tags: vector<String>,  // Skills or industries
    avatar_url: String,  // Walrus blob ID
    completed_jobs: u64,
    rating: u64,  // Scaled by 100 (450 = 4.50 stars)
    rating_count: u64,
    total_amount: u64,  // Earnings (freelancer) or spent (client)
    verified: bool,
    active_jobs: VecSet<ID>,
}

public struct ProfileCap has key, store {
    id: UID,
    profile_id: ID,
}
```

**Entry Functions** (DEV 1 to implement):
- `create_profile()` - Mint profile NFT with type
- `update_profile_info()` - Edit username, bio, tags, avatar (requires ProfileCap)
- `add_rating()` - Called by job_escrow on completion
- `record_job_completion()` - Update stats when job completes
- `add_active_job()` / `remove_active_job()` - Manage active jobs

#### 3. Reputation Module ([reputation.move](move/zk_freelance/sources/reputation.move))

**Core Functionality**:
- **Rating Submission**: Post-job ratings with reviews
- **Dispute Handling**: Flag unfair ratings for review
- **Badge System**: Award achievement badges (Bronze/Silver/Gold/Platinum)
- **Rating Validation**: Ensure rater was job participant

**Badge Tiers**:
- **Bronze**: 5+ jobs, 4.0+ rating, 3+ reviews
- **Silver**: 20+ jobs, 4.5+ rating, 5+ reviews
- **Gold**: 50+ jobs, 4.7+ rating, 10+ reviews
- **Platinum**: 100+ jobs, 4.9+ rating, 10+ reviews

**Entry Functions** (DEV 1 to implement):
- `submit_rating()` - Submit rating for completed job (10-50 scale)
- `dispute_rating()` - Challenge unfair rating
- `award_badge()` - Award achievement badge (admin or automated)

### Service Layer for Freelance Platform

#### JobService ([jobService.ts](app/services/jobService.ts))

**Transaction Builders** (DEV 2 to implement - **IMPORTANT: Profile requirements vary by function**):
```typescript
createJobTransaction(clientProfileId, title, descriptionBlobId, budgetAmount, deadline): Transaction
applyForJobTransaction(jobId, freelancerProfileId): Transaction  // Profile for validation only
assignFreelancerTransaction(jobId, jobCapId, freelancerAddress): Transaction  // No profile needed (ownership fix)
startJobTransaction(jobId, freelancerProfileId): Transaction  // Profile updated here
submitMilestoneTransaction(jobId, milestoneId, proofBlobId): Transaction
approveMilestoneTransaction(jobId, jobCapId, milestoneId, clientProfileId, freelancerProfileId): Transaction
cancelJobTransaction(jobId, jobCapId, clientProfileId): Transaction  // For OPEN state
cancelJobWithFreelancerTransaction(jobId, jobCapId, clientProfileId, freelancerProfileId): Transaction  // For ASSIGNED state
```

**Query Methods**:
```typescript
async getJob(jobId): Promise<JobData | null>
async getJobsByClient(clientAddress): Promise<JobData[]>
async getJobsByFreelancer(freelancerAddress): Promise<JobData[]>
async getOpenJobs(): Promise<JobData[]>
```

**Usage Pattern with Profile Integration**:
```typescript
const jobService = useMemo(
  () => createJobService(suiClient, jobEscrowPackageId),
  [suiClient, jobEscrowPackageId]
);

// Create job - requires client profile
const tx = jobService.createJobTransaction(
  clientProfileId,  // Profile object ID
  title,
  blobId,
  budget,
  deadline
);
signAndExecute({ transaction: tx }, {
  onSuccess: async ({ digest }) => {
    const { jobId, jobCapId } = await jobService.waitForTransactionAndGetCreatedObjects(digest);
    // Profile automatically updated with active job
  }
});

// Apply for job - requires freelancer profile for validation
const applyTx = jobService.applyForJobTransaction(
  jobId,
  freelancerProfileId  // Freelancer's profile (read-only validation)
);

// Assign freelancer - NO profile needed (ownership fix)
const assignTx = jobService.assignFreelancerTransaction(
  jobId,
  jobCapId,
  freelancerAddress  // No profile parameter
);

// Start job - requires freelancer profile for update
const startTx = jobService.startJobTransaction(
  jobId,
  freelancerProfileId  // Profile updated: total_jobs +1, active_jobs
);

// Approve milestone - requires BOTH profiles
const approveTx = jobService.approveMilestoneTransaction(
  jobId,
  jobCapId,
  milestoneId,
  clientProfileId,      // Client's profile
  freelancerProfileId   // Freelancer's profile
);
// On job completion, both profiles updated automatically
```

#### ProfileService ([profileService.ts](app/services/profileService.ts))

**Transaction Builders** (DEV 2 to implement):
```typescript
createProfileTransaction(profileType, username, realName, bio, tags, avatarUrl): Transaction
updateProfileTransaction(profileId, profileCapId, updates): Transaction
```

**Query Methods**:
```typescript
async getProfile(profileId): Promise<ProfileData | null>
async getProfileByOwner(ownerAddress): Promise<ProfileData | null>
async getTopFreelancers(limit): Promise<ProfileData[]>
```

### Custom Hooks ([app/hooks/](app/hooks/))

**Job Hooks** ([useJob.ts](app/hooks/useJob.ts)) - DEV 3 to implement:
```typescript
useJob(jobId) // Fetch single job with caching
useJobsByClient(clientAddress) // Client's posted jobs
useJobsByFreelancer(freelancerAddress) // Freelancer's assigned jobs
useOpenJobs() // Marketplace listings
```

**Profile Hooks** ([useProfile.ts](app/hooks/useProfile.ts)):
```typescript
useProfile(profileId) // Fetch profile by ID
useCurrentProfile() // Current user's profile
useProfileByOwner(ownerAddress) // Profile by wallet address
useTopFreelancers(limit) // Leaderboard
```

**Wallet Hooks** ([useWallet.ts](app/hooks/useWallet.ts)):
```typescript
useSuiBalance() // Get SUI balance and formatted display
useHasSufficientBalance(requiredAmount) // Check if can afford operation
useShortenAddress(address) // Format address for display
useIsOwner(ownerAddress) // Check if current user owns resource
```

### Component Structure

**Job Components** ([app/components/job/](app/components/job/)):
- `JobCard.tsx` - Job summary for marketplace listings
- `JobList.tsx` - Grid of job cards with filters
- `JobDetail.tsx` - Full job details view
- `JobCreateForm.tsx` - Job creation form
- `MilestoneTracker.tsx` - Milestone progress display

**Profile Components** ([app/components/profile/](app/components/profile/)):
- `ProfileCard.tsx` - Profile display with rating/badges
- `ProfileEditor.tsx` - Edit profile form
- `ReputationBadge.tsx` - Badge tier display
- `ProfileSetup.tsx` - Initial profile creation wizard

**Escrow Components** ([app/components/escrow/](app/components/escrow/)):
- `EscrowStatus.tsx` - Show escrow balance and locks
- `FundReleaseButton.tsx` - Approve milestone payment

### Integration with Walrus and Seal

**Job Description Storage**:
```typescript
// 1. Upload job description to Walrus
const { blobId } = await walrusService.upload(description, { epochs: 10 });

// 2. Create job with blob ID
const tx = jobService.createJobTransaction(title, blobId, budget, deadline);
```

**Encrypted Deliverables**:
```typescript
// 1. Create whitelist with client address
const whitelistTx = whitelistService.createWhitelistTransaction();
// Add client to whitelist

// 2. Encrypt deliverable with Seal
const encrypted = await sealService.encrypt(whitelistObjectId, nonce, fileData);

// 3. Upload encrypted data to Walrus
const { blobId } = await walrusService.upload(encrypted, { epochs: 10 });

// 4. Submit milestone with blob ID
const tx = jobService.submitMilestoneTransaction(jobId, milestoneId, blobId);
```

**Client Access Flow**:
```typescript
// 1. Client approves milestone (payment released)
const approveTx = jobService.approveMilestoneTransaction(jobId, jobCapId, milestoneId);

// 2. Create session key for decryption
const sessionKey = await sealService.createSessionKey(address, signPersonalMessage);

// 3. Download encrypted deliverable
const encryptedData = await walrusService.downloadAsBytes(blobId);

// 4. Decrypt with whitelist access
const decrypted = await sealService.decrypt(encryptedData, sessionKey, whitelistObjectId, nonce);
```

## Architecture Overview

### Service Layer Pattern
The project uses a clean service layer architecture with three primary services in [app/services/](app/services/):

1. **WalrusService** ([walrusServiceSDK.ts](app/services/walrusServiceSDK.ts))
   - Uses official @mysten/walrus SDK
   - **CRITICAL**: Must use `SuiJsonRpcClient` (not `SuiClient`) with `network` property
   - Handles file upload/download to Walrus decentralized storage
   - Uses `writeFilesFlow` for browser environments (avoids popup blocking)
   - Flow steps: encode → register → upload → certify

2. **SealService** ([sealService.ts](app/services/sealService.ts))
   - Uses @mysten/seal SDK for Identity-Based Encryption
   - Manages encryption/decryption with whitelist access control
   - Uses SessionKey pattern (10-minute TTL) to avoid repeated wallet confirmations
   - ID format: `[packageId][whitelistObjectId][nonce]`

3. **WhitelistService** ([whitelistService.ts](app/services/whitelistService.ts))
   - Manages on-chain whitelist objects
   - Handles Cap (admin capability) objects
   - Create, add, and remove addresses from whitelists

### Key Components

- [WalrusUpload.tsx](app/WalrusUpload.tsx) - File/text/JSON upload to Walrus
- [SealWhitelist.tsx](app/SealWhitelist.tsx) - Encryption with whitelist access control
- [Navbar.tsx](app/components/Navbar.tsx) - Navigation with wallet connection

### Whitelist Smart Contract Pattern

The [whitelist.move](move/zk_freelance/sources/whitelist.move) contract implements:
- **Whitelist**: Shared object containing allowed addresses
- **Cap**: Owned object granting admin rights to manage the whitelist
- **Access Control**: `seal_approve` validates decryption attempts
- **Key Format**: `[packageId][whitelistObjectId][nonce]`

#### Whitelist ID Construction
When using Seal with whitelist:
1. The ID passed to `SealClient.encrypt()` is: `[whitelistObjectId][nonce]` in hex
2. Seal SDK automatically prepends the `packageId`
3. The Move contract validates the ID has the whitelist object ID as prefix

## Configuration Files

### Critical Configuration
- [app/constants.ts](app/constants.ts) - Package IDs for different networks
- [app/networkConfig.ts](app/networkConfig.ts) - Network configuration for dApp-kit
- [tsconfig.json](tsconfig.json) - Path alias: `@/*` → `./app/*`
- [move/zk_freelance/Move.toml](move/zk_freelance/Move.toml) - Move package configuration

## Walrus Integration Notes

### Upload Flow (Browser Environment)
The `uploadWithFlow` method breaks upload into steps to avoid browser popup blocking:
```typescript
const flow = walrus.uploadWithFlow([file], { epochs, deletable });
await flow.encode();
const registerTx = flow.register({ owner, epochs, deletable });
// Sign and execute registerTx
await flow.upload({ digest });
const certifyTx = flow.certify();
// Sign and execute certifyTx
const files = await flow.listFiles();
```

### Important Walrus Details
- BlobId vs Metadata ID: Extract metadata ID from `BlobRegistered` event for explorer links
- Storage duration: Set in epochs (10 epochs ≈ 30 days on testnet)
- Aggregator URL: `https://aggregator.walrus-testnet.walrus.space/v1/`
- Explorer: WalrusCan (https://walruscan.com/testnet/blob/{blobId})

## Seal Integration Notes

### Session Key Pattern
Session keys allow decryption for 10 minutes without repeated wallet signatures:
```typescript
const sessionKey = await sealService.createSessionKey(address, signPersonalMessage);
// Use for multiple decryptions within 10 minutes
const decrypted = await sealService.decrypt(encrypted, sessionKey, whitelistId, nonce);
```

### Seal Server Selection
Multiple Seal key servers available on testnet (in [sealService.ts:10-29](app/services/sealService.ts)):
- Default: "Mysten Testnet 1"
- Configurable at runtime in UI

### Encryption ID Format
- ID = `[whitelistObjectId][nonce]` (hex bytes)
- Seal SDK prepends packageId automatically
- Move contract validates: `wl.id.to_bytes()` must be prefix of ID

## Common Patterns

### Transaction Pattern
```typescript
const tx = new Transaction();
tx.moveCall({
  arguments: [tx.object(id), tx.pure.u64(value)],
  target: `${packageId}::module::function`,
});
signAndExecute({ transaction: tx }, {
  onSuccess: async ({ digest }) => {
    await suiClient.waitForTransaction({ digest });
    // Handle success
  }
});
```

### Object Query Pattern
```typescript
const { data, refetch } = useSuiClientQuery("getObject", {
  id: objectId,
  options: { showContent: true }
});
```

## Troubleshooting

### Common Issues

**"Package not found"**: Verify package ID in [constants.ts](app/constants.ts) matches deployed package

**Walrus upload fails**:
- Check wallet is connected
- Ensure using `writeFilesFlow` for browser (not direct `writeFiles`)
- Verify network matches (testnet)

**Seal decryption fails**:
- Verify address is on the whitelist
- Check session key hasn't expired (10 min TTL)
- Ensure correct whitelistObjectId and nonce
- Validate Seal server selection

**Transaction fails**:
- Check gas budget (100000000 for contract deployment)
- Verify wallet has sufficient SUI
- Ensure connected to correct network (testnet)

## Testing Strategy

When testing Walrus/Seal integration:
1. Create a whitelist first
2. Add test addresses to whitelist
3. Create session key before decryption
4. Use same whitelistId and nonce for encrypt/decrypt pairs
5. Monitor browser console for detailed logs (encryption/decryption show bytes)

## Dependencies Notes

- **@mysten/walrus**: Requires `SuiJsonRpcClient` with `network` property
- **@mysten/seal**: Requires wallet's `signPersonalMessage` feature
- **@mysten/dapp-kit**: Provides wallet hooks and UI components
- **Next.js 16**: Uses App Router, all pages are client components with `"use client"`
- **pnpm**: Required package manager (specified in package.json)
