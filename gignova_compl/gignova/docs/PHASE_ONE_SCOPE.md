# Phase 1 MVP Scope - Zero-Knowledge Freelance Platform

## Executive Summary

**Timeline**: 5-6 days (Hackathon)
**Team**: 3 Developers working in parallel
**Goal**: Functional freelance platform with job escrow, encrypted deliverables, and dynamic NFT profiles

---

## Core Features

### 1. Job Management
- ✅ Post jobs with escrow payment
- ✅ Freelancer application system
- ✅ Client assigns freelancer
- ✅ Milestone-based payment release
- ✅ Job cancellation with refunds
- ✅ State machine (8 states: OPEN → COMPLETED)

### 2. Profile System
- ✅ Dynamic NFT profiles (Freelancer/Client types)
- ✅ On-chain reputation tracking
- ✅ Rating system (0.1-5.0 stars, scaled by 100)
- ✅ Badge tiers (Bronze/Silver/Gold/Platinum)
- ✅ Job history and earnings tracking

### 3. Secure Deliverables
- ✅ Job descriptions stored on Walrus (decentralized storage)
- ✅ Work encrypted with Seal (Identity-Based Encryption)
- ✅ Whitelist-based access control
- ✅ Payment → Decryption key release flow

---

## Technical Implementation

### Smart Contracts (Dev 1)

**Package**: `zk_freelance`
**Location**: `move/zk_freelance/sources/`

#### Contract Modules

1. **job_escrow.move** (Priority 1 - 2-3 days)
   - Job creation with `Balance<SUI>` escrow
   - State machine with 8 states
   - Milestone tracking with `Table<u64, Milestone>`
   - JobCap capability pattern for client operations
   - Applicant management
   - Deadline enforcement with Clock object

2. **profile_nft.move** (Priority 2 - 1-2 days)
   - Profile NFT minting (Freelancer/Client enum)
   - Dynamic fields: username, bio, tags, avatar
   - Reputation tracking: rating, rating_count, completed_jobs
   - ProfileCap for owner operations
   - VecSet for active job tracking

3. **reputation.move** (Priority 3 - 1 day)
   - Rating submission (10-50 scale)
   - Rating validation (only job participants)
   - Badge eligibility calculation
   - Rating dispute handling

4. **milestone.move** (Optional - Can integrate into job_escrow)
   - Standalone milestone objects
   - Revision request system
   - Proof submission tracking

**Key Patterns**:
- Capability objects (JobCap, ProfileCap) for access control
- Shared objects for Jobs and Profiles
- Event emission for all state changes
- Clock integration for timestamps

---

### Service Layer (Dev 2)

**Location**: `app/services/`

#### Services to Implement

1. **jobService.ts** (Priority 1 - 2-3 days)
   - Transaction builders for all job operations
   - Query methods: getJob, getJobsByClient, getOpenJobs
   - Object parsing with type guards
   - Event extraction for created objects

2. **profileService.ts** (Priority 2 - 1-2 days)
   - Profile creation and update transactions
   - Query methods: getProfile, getProfileByOwner
   - Rating calculation helpers
   - Cap management

3. **reputationService.ts** (Priority 3 - 1 day)
   - Rating submission transactions
   - Badge eligibility checks
   - Helper methods for formatting

#### Custom Hooks (1 day)

**Location**: `app/hooks/`

- `useJob.ts` - Job data fetching with react-query
- `useProfile.ts` - Profile data management
- `useWallet.ts` - Balance, formatting utilities

**Integration Points**:
- Wait for Dev 1 to deploy contracts
- Get package IDs from deployment output
- Update `app/constants.ts` with IDs
- Test all service methods in browser console

---

### Frontend (Dev 3)

**Location**: `app/` (views) and `app/components/`

#### Views to Build (Priority Order)

1. **Job Marketplace View** (2 days)
   - Display open jobs with JobList component
   - Job filtering and sorting
   - "Apply" action for freelancers
   - Integration with useOpenJobs hook

2. **Job Detail View** (1-2 days)
   - Full job information display
   - Milestone progress tracker
   - Apply/Submit/Approve actions based on role
   - Show applicants (for clients)

3. **My Jobs View** (1 day)
   - Client: Posted jobs with management actions
   - Freelancer: Assigned jobs with submission actions
   - Tab-based UI for different job states

4. **Profile View** (1 day)
   - Display profile card with ratings/badges
   - Profile edit form (for owner)
   - Job history
   - Reputation visualization

5. **Create Job View** (1 day)
   - Multi-step form (Info → Milestones → Review)
   - Walrus integration for description upload
   - Budget and deadline input
   - Preview before posting

#### Components to Build

**Job Components** (`app/components/job/`):
- ✅ JobCard.tsx (skeleton exists)
- ✅ JobList.tsx (skeleton exists)
- JobDetail.tsx
- JobCreateForm.tsx
- MilestoneTracker.tsx

**Profile Components** (`app/components/profile/`):
- ✅ ProfileCard.tsx (skeleton exists)
- ProfileEditor.tsx
- ReputationBadge.tsx
- ProfileSetup.tsx

**Escrow Components** (`app/components/escrow/`):
- EscrowStatus.tsx
- FundReleaseButton.tsx

---

## User Flows

### 1. Post a Job (Client)
```
1. Connect wallet
2. Create profile (if first time)
3. Click "Post a Job"
4. Fill form: title, description, budget, deadline
5. Add milestones (optional)
6. Description uploaded to Walrus automatically
7. Submit transaction with escrow funding
8. Job appears in marketplace
```

### 2. Apply for Job (Freelancer)
```
1. Connect wallet
2. Create profile (if first time)
3. Browse marketplace
4. Click job card → View details
5. Click "Apply"
6. Submit application transaction
7. Wait for client to assign
```

### 3. Complete Milestone
```
1. Freelancer completes work
2. Uploads deliverable to Walrus (encrypted with Seal)
3. Submits milestone with blob ID
4. Client reviews watermarked preview
5. Client approves milestone
6. Smart contract releases payment
7. Freelancer shares decryption key
8. Client decrypts full deliverable
```

### 4. Rate & Review
```
1. Job completes
2. Both parties submit ratings
3. Profiles updated automatically
4. Badge eligibility checked
5. Badges awarded if thresholds met
```

---

## Integration with Walrus & Seal

### Job Descriptions (Walrus)
- Upload description text/files to Walrus
- Store blob ID in job object
- Retrieve for display in UI

### Encrypted Deliverables (Walrus + Seal)
```typescript
// Freelancer flow
1. Create whitelist with client address
2. Encrypt work with Seal (using whitelist ID)
3. Upload encrypted data to Walrus
4. Submit milestone with blob ID

// Client flow (after payment)
1. Create Seal session key (10-min TTL)
2. Download encrypted blob from Walrus
3. Decrypt with session key + whitelist
4. Access full deliverable
```

---

## What's NOT in Phase 1

**Deferred to Phase 2+**:
- ❌ Dispute resolution system (basic structure only)
- ❌ Milestone revision flow (basic structure only)
- ❌ Advanced search/filters (basic only)
- ❌ Messaging system
- ❌ Escrow split for multiple milestones
- ❌ Partial refunds
- ❌ Admin dashboard
- ❌ zkLogin integration (can use standard wallet)
- ❌ Nautilus verification (mentioned in concept)
- ❌ Watermarked preview generation (manual for MVP)

---

## Success Criteria

### Minimum Viable Demo

**Must Have**:
- [x] Job posting works with escrow
- [x] Freelancer can apply to jobs
- [x] Client can assign freelancer
- [x] Milestone submission works
- [x] Payment release on approval works
- [x] Profiles display correctly
- [x] Ratings update profiles
- [x] Basic UI is functional

**Nice to Have**:
- [ ] Badge system working
- [ ] Walrus integration for descriptions
- [ ] Seal encryption for deliverables
- [ ] Job cancellation works
- [ ] Profile editing works

### Demo Flow for Judges

```
1. Show home page with platform concept
2. Create client profile
3. Post a job with escrow
4. Switch wallet → Create freelancer profile
5. Apply for job
6. Switch back → Assign freelancer
7. Submit milestone
8. Approve milestone (show payment release)
9. Show updated profiles with ratings
10. Show badge awards (if implemented)
```

---

## Development Timeline

### Sprint 1: Foundation (Days 1-2)
- **Dev 1**: job_escrow.move structure + state machine
- **Dev 2**: jobService.ts skeleton + types
- **Dev 3**: Component structure + routing

### Sprint 2: Core Features (Days 3-4)
- **Dev 1**: profile_nft.move + reputation.move
- **Dev 2**: profileService.ts + hooks
- **Dev 3**: Job marketplace + detail views

### Sprint 3: Integration (Days 5-6)
- **Dev 1**: Deploy contracts, update constants
- **Dev 2**: Test services, fix bugs
- **Dev 3**: My Jobs + Profile views, polish UI

---

## Risk Mitigation

### Technical Risks

1. **Contract Deployment Issues**
   - Mitigation: Test extensively on testnet
   - Fallback: Use existing counter/whitelist patterns

2. **Seal/Walrus Integration Complexity**
   - Mitigation: Reference existing WalrusUpload.tsx and SealWhitelist.tsx
   - Fallback: Skip encryption for MVP, use plain Walrus storage

3. **Query Performance (getOpenJobs)**
   - Mitigation: Start with owned objects query
   - Fallback: Manual job ID list or event indexing

### Team Coordination

1. **Contract-Service Mismatch**
   - Solution: Dev 1 documents all events and structs
   - Daily sync on function signatures

2. **Service-UI Integration Issues**
   - Solution: Dev 2 provides example usage for each service
   - Dev 3 tests with mock data first

---

## Files Already Created

### ✅ Completed

**Smart Contracts** (skeletons with TODOs):
- move/zk_freelance/sources/job_escrow.move
- move/zk_freelance/sources/profile_nft.move
- move/zk_freelance/sources/milestone.move
- move/zk_freelance/sources/reputation.move

**Services** (skeletons with TODOs):
- app/services/jobService.ts
- app/services/profileService.ts
- app/services/reputationService.ts
- app/services/types.ts (all types defined)

**Hooks** (skeletons with TODOs):
- app/hooks/useJob.ts
- app/hooks/useProfile.ts
- app/hooks/useWallet.ts

**Components** (partial):
- app/components/job/JobCard.tsx
- app/components/job/JobList.tsx
- app/components/profile/ProfileCard.tsx

**Configuration** (complete):
- app/constants.ts
- app/networkConfig.ts
- app/contexts/ViewContext.tsx
- app/App.tsx (with view routing)
- app/components/Navbar.tsx

**Documentation** (complete):
- CLAUDE.md
- DEVELOPER_HANDOFF.md
- REFACTORING_SUMMARY.md

---

## Next Steps

### For Dev 1
```bash
cd move/zk_freelance
# Implement TODOs in job_escrow.move
# Focus on create_job, apply, assign, submit_milestone, approve_milestone
sui move build
sui move test
```

### For Dev 2
```bash
# Wait for Dev 1 to deploy
# Get package ID from deployment output
# Update app/constants.ts

# Implement TODOs in jobService.ts
# Test transaction builders in browser console
# Implement hooks with react-query
```

### For Dev 3
```bash
# Build view components
# Start with JobMarketplaceView
# Use existing JobCard component
# Integrate with useOpenJobs hook when ready
# Focus on happy path first
```

---

## Questions to Resolve

1. **Profile creation**: Separate flow or part of first job posting?
   - **Decision**: Separate flow, required before posting/applying

2. **Milestone amounts**: Must sum to job budget?
   - **Decision**: Yes, validate in contract

3. **Job cancellation**: When allowed?
   - **Decision**: Only in OPEN or ASSIGNED states (before work starts)

4. **Rating**: Who can rate whom?
   - **Decision**: Client rates freelancer, freelancer rates client (mutual)

5. **Badge award**: Automatic or manual?
   - **Decision**: Check eligibility after each rating, auto-award

---

**Last Updated**: After refactoring to `zk_freelance` package name
**Status**: Ready for implementation 🚀
