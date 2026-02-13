# Smart Contract Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           ZK FREELANCE SMART CONTRACT ARCHITECTURE                               │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      PROFILE_NFT MODULE                                         │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐     │
│  │    IdentityRegistry     │    │        Profile          │    │       ProfileCap        │     │
│  │       (shared)          │    │        (owned)          │    │        (owned)          │     │
│  ├─────────────────────────┤    ├─────────────────────────┤    ├─────────────────────────┤     │
│  │ zklogin_to_profile:     │    │ owner: address          │    │ profile_id: ID          │     │
│  │   Table<String, ID>     │───▶│ zklogin_sub: String     │◀───│                         │     │
│  └─────────────────────────┘    │ email: String           │    └─────────────────────────┘     │
│                                 │ profile_type: u8        │                                    │
│                                 │ username: String        │                                    │
│                                 │ bio: String             │                                    │
│                                 │ tags: vector<String>    │                                    │
│                                 │ avatar_url: String      │                                    │
│                                 │ completed_jobs: u64     │                                    │
│                                 │ total_jobs: u64         │                                    │
│                                 │ rating: u64             │                                    │
│                                 │ rating_count: u64       │                                    │
│                                 │ total_amount: u64       │                                    │
│                                 │ verified: bool          │                                    │
│                                 │ active_jobs: VecSet<ID> │                                    │
│                                 └─────────────────────────┘                                    │
│                                                                                                 │
│  FUNCTIONS:                                                                                     │
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│  │ create_profile(registry, profile_type, zklogin_sub, email, username, ...) → Profile   │    │
│  │ update_profile_info(profile, cap, username?, real_name?, bio?, tags?, avatar_url?)    │    │
│  │ add_rating(profile, rating) ─────────────────────────────────────────── [from escrow] │    │
│  │ record_job_completion(profile, job_id, amount) ─────────────────────── [from escrow] │    │
│  │ add_active_job(profile, job_id) ────────────────────────────────────── [from escrow] │    │
│  │ remove_active_job(profile, job_id) ─────────────────────────────────── [from escrow] │    │
│  │ increment_own_total_jobs(profile) ──────────────────────────────────── [self-update] │    │
│  │ set_verification(profile, verified) ─────────────────────────────────── [admin/TODO] │    │
│  │ get_profile_by_zklogin_sub(registry, zklogin_sub) → Option<ID>                        │    │
│  │ has_profile(registry, zklogin_sub) → bool                                             │    │
│  └────────────────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ Profile interactions
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      JOB_ESCROW MODULE                                          │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  ┌───────────────────────────────────────────┐         ┌─────────────────────────┐             │
│  │                  Job                      │         │        JobCap           │             │
│  │               (shared)                    │         │        (owned)          │             │
│  ├───────────────────────────────────────────┤         ├─────────────────────────┤             │
│  │ client: address                           │◀────────│ job_id: ID              │             │
│  │ freelancer: Option<address>               │         └─────────────────────────┘             │
│  │ title: vector<u8>                         │                                                 │
│  │ description_blob_id: vector<u8> (Walrus)  │         ┌─────────────────────────┐             │
│  │ budget: u64                               │         │      Milestone          │             │
│  │ escrow: Balance<SUI>                      │         │       (stored)          │             │
│  │ state: u8 ───────────────────────────┐    │         ├─────────────────────────┤             │
│  │ milestones: Table<u64, Milestone>────┼────┼────────▶│ id: u64                 │             │
│  │ milestone_count: u64                 │    │         │ description: vector<u8> │             │
│  │ applicants: vector<address>          │    │         │ amount: u64             │             │
│  │ created_at: u64                      │    │         │ completed: bool         │             │
│  │ deadline: u64                        │    │         │ approved: bool          │             │
│  │ deliverable_blob_ids: vector<...>    │    │         │ submission_blob_id: Opt │             │
│  │ pending_freelancer_completion: Opt   │    │         │ submitted_at: Option    │             │
│  └──────────────────────────────────────┼────┘         │ approved_at: Option     │             │
│                                         │              └─────────────────────────┘             │
│                                         ▼                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  STATE MACHINE:  OPEN(0) ──▶ ASSIGNED(1) ──▶ IN_PROGRESS(2) ──▶ SUBMITTED(3)          │   │
│  │                    │              │                  ▲                │                 │   │
│  │                    ▼              ▼                  │                ▼                 │   │
│  │               CANCELLED(6)   CANCELLED(6)           └──── AWAITING_REVIEW(4)           │   │
│  │                                                                       │                 │   │
│  │                                                                       ▼                 │   │
│  │                                                              COMPLETED(5)               │   │
│  └────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                 │
│  ENTRY FUNCTIONS:                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐      │    │
│  │  │ create_job(client_profile, title, desc_blob, budget, deadline)              │      │    │
│  │  │   → Creates Job (shared) + JobCap (to client)                               │      │    │
│  │  │   → Updates: client_profile.total_jobs++, client_profile.active_jobs        │      │    │
│  │  └─────────────────────────────────────────────────────────────────────────────┘      │    │
│  │                                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐      │    │
│  │  │ apply_for_job(job, freelancer_profile)                                      │      │    │
│  │  │   → Adds sender to job.applicants                                           │      │    │
│  │  │   → Profile used for validation only (read-only)                            │      │    │
│  │  └─────────────────────────────────────────────────────────────────────────────┘      │    │
│  │                                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐      │    │
│  │  │ assign_freelancer(job, cap, freelancer_addr)                                │      │    │
│  │  │   → Sets job.freelancer, state: OPEN → ASSIGNED                             │      │    │
│  │  │   → Requires JobCap ownership                                               │      │    │
│  │  └─────────────────────────────────────────────────────────────────────────────┘      │    │
│  │                                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐      │    │
│  │  │ start_job(job, freelancer_profile)                                          │      │    │
│  │  │   → State: ASSIGNED → IN_PROGRESS                                           │      │    │
│  │  │   → Updates: freelancer_profile.total_jobs++, freelancer_profile.active_jobs│      │    │
│  │  └─────────────────────────────────────────────────────────────────────────────┘      │    │
│  │                                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐      │    │
│  │  │ add_milestone(job, cap, description, amount)                                │      │    │
│  │  │   → Adds Milestone to job.milestones table                                  │      │    │
│  │  │   → Only in OPEN state, requires JobCap                                     │      │    │
│  │  └─────────────────────────────────────────────────────────────────────────────┘      │    │
│  │                                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐      │    │
│  │  │ submit_milestone(job, milestone_id, proof_blob_id)                          │      │    │
│  │  │   → State: IN_PROGRESS → SUBMITTED                                          │      │    │
│  │  │   → Updates milestone.completed, submission_blob_id                         │      │    │
│  │  └─────────────────────────────────────────────────────────────────────────────┘      │    │
│  │                                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐      │    │
│  │  │ approve_milestone(job, cap, milestone_id, client_profile)                  │      │    │
│  │  │   → Releases payment from escrow to freelancer                              │      │    │
│  │  │   → If all milestones approved → complete_job_client_side() called          │      │    │
│  │  │   → Updates client profile, sets pending_freelancer_completion              │      │    │
│  │  │   → Emits FreelancerCompletionPending event                                 │      │    │
│  │  └─────────────────────────────────────────────────────────────────────────────┘      │    │
│  │                                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐      │    │
│  │  │ request_revision(job, cap, milestone_id)                                    │      │    │
│  │  │   → State: SUBMITTED → IN_PROGRESS                                          │      │    │
│  │  │   → Client requests changes to submitted milestone                          │      │    │
│  │  │   → Requires JobCap ownership                                               │      │    │
│  │  └─────────────────────────────────────────────────────────────────────────────┘      │    │
│  │                                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐      │    │
│  │  │ claim_job_completion(job, freelancer_profile)         [COMPLETED state]     │      │    │
│  │  │   → Called by freelancer after client approves final milestone              │      │    │
│  │  │   → Updates freelancer profile: completed_jobs++, total_amount              │      │    │
│  │  │   → Clears pending_freelancer_completion                                    │      │    │
│  │  │   → Emits FreelancerCompletionClaimed event                                 │      │    │
│  │  └─────────────────────────────────────────────────────────────────────────────┘      │    │
│  │                                                                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐      │    │
│  │  │ cancel_job(job, cap, client_profile)           [OPEN state]                 │      │    │
│  │  │ cancel_job_with_freelancer(job, cap, client_profile, freelancer_profile)    │      │    │
│  │  │   → Refunds escrow to client                              [ASSIGNED state]  │      │    │
│  │  │   → Removes job from profile(s).active_jobs                                 │      │    │
│  │  └─────────────────────────────────────────────────────────────────────────────┘      │    │
│  │                                                                                        │    │
│  └────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                 │
│  INTERNAL: complete_job_client_side(job, client_profile)                                       │
│            → Updates client profile: completed_jobs++, total_amount, removes active_job        │
│            → Sets pending_freelancer_completion for freelancer to claim later                  │
│            → Solves Sui ownership constraint (client cannot mutate freelancer's profile)       │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ Ratings after job completion
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     REPUTATION MODULE                                           │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  ┌─────────────────────────┐              ┌─────────────────────────┐                          │
│  │        Rating           │              │         Badge           │                          │
│  │       (shared)          │              │        (owned)          │                          │
│  ├─────────────────────────┤              ├─────────────────────────┤                          │
│  │ job_id: ID              │              │ owner: address          │                          │
│  │ rater: address          │              │ tier: u8                │                          │
│  │ ratee: address          │              │   NONE(0)/BRONZE(1)/    │                          │
│  │ rating: u64 (10-50)     │              │   SILVER(2)/GOLD(3)/    │                          │
│  │ review: String          │              │   PLATINUM(4)           │                          │
│  │ created_at: u64         │              │ name: String            │                          │
│  │ disputed: bool          │              │ description: String     │                          │
│  └─────────────────────────┘              │ icon_url: String        │                          │
│                                           │ awarded_at: u64         │                          │
│                                           └─────────────────────────┘                          │
│                                                                                                 │
│  FUNCTIONS (TODO - Not yet implemented):                                                        │
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│  │ submit_rating(job_id, ratee, rating, review) → Rating                                  │    │
│  │ dispute_rating(rating, reason)                                                         │    │
│  │ award_badge(recipient, tier, name, description, icon_url) → Badge                      │    │
│  │ check_badge_eligibility(completed_jobs, rating, rating_count, total_amount) → tier     │    │
│  └────────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                                 │
│  BADGE THRESHOLDS:                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐    │
│  │ Bronze:   5+ jobs,   4.0+ rating,  3+ reviews                                          │    │
│  │ Silver:   20+ jobs,  4.5+ rating,  5+ reviews                                          │    │
│  │ Gold:     50+ jobs,  4.7+ rating, 10+ reviews                                          │    │
│  │ Platinum: 100+ jobs, 4.9+ rating, 10+ reviews                                          │    │
│  └────────────────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  CROSS-MODULE INTERACTIONS                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  job_escrow ─────────────────────────────▶ profile_nft                                         │
│       │                                         │                                               │
│       │  create_job()        ──────────▶  increment_own_total_jobs()                           │
│       │                      ──────────▶  add_active_job()                                     │
│       │                                                                                         │
│       │  start_job()         ──────────▶  increment_own_total_jobs()                           │
│       │                      ──────────▶  add_active_job()                                     │
│       │                                                                                         │
│       │  approve_milestone() ──────────▶  record_job_completion() [client profile only]        │
│       │                      ──────────▶  sets pending_freelancer_completion                   │
│       │                                                                                         │
│       │  claim_job_completion() ───────▶  record_job_completion() [freelancer claims]          │
│       │                                                                                         │
│       │  cancel_job()        ──────────▶  remove_active_job()                                  │
│       │                                                                                         │
│       │  apply_for_job()     ──────────▶  get_owner() [validation only]                        │
│       │                                                                                         │
│                                                                                                 │
│  reputation ─────────────────────────────▶ profile_nft (planned)                               │
│       │                                                                                         │
│       │  submit_rating()     ──────────▶  add_rating() [to update avg rating]                  │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       EVENTS EMITTED                                            │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  profile_nft:    ProfileCreated, ProfileUpdated, ReputationUpdated, JobCompleted               │
│                                                                                                 │
│  job_escrow:     JobCreated, FreelancerApplied, FreelancerAssigned, JobStateChanged,           │
│                  JobStarted, MilestoneSubmitted, MilestoneApproved, JobCompleted,              │
│                  JobCancelled, FundsReleased, FreelancerCompletionPending,                     │
│                  FreelancerCompletionClaimed                                                   │
│                                                                                                 │
│  reputation:     RatingSubmitted, RatingDisputed, BadgeAwarded                                 │
│                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Summary

### Modules Overview

| Module | Key Objects | Purpose |
|--------|-------------|---------|
| **profile_nft** | `Profile` (owned), `ProfileCap` (owned), `IdentityRegistry` (shared) | Dynamic NFT profiles with zkLogin support, reputation tracking |
| **job_escrow** | `Job` (shared), `JobCap` (owned), `Milestone` (stored in Job) | Job lifecycle, escrow payments, milestone management |
| **reputation** | `Rating` (shared), `Badge` (owned) | Post-job ratings and achievement badges (partially implemented) |

### Key Patterns

- **Capability pattern**: `JobCap`/`ProfileCap` grant admin rights to owners
- **Shared vs Owned**: Jobs/Registry are shared (accessible to all), Profiles/Caps are owned
- **Cross-module calls**: `job_escrow` calls `profile_nft` functions to update stats
- **Event-based indexing**: All state changes emit events for frontend discovery
- **Split Operation pattern**: Solves Sui ownership constraint where one signer cannot mutate another user's owned object
  - Client calls `approve_milestone` → updates client profile, sets `pending_freelancer_completion`
  - Freelancer calls `claim_job_completion` → updates freelancer profile, clears pending

### Job State Machine

```
OPEN(0) ──▶ ASSIGNED(1) ──▶ IN_PROGRESS(2) ──▶ SUBMITTED(3)
  │              │                  ▲                │
  ▼              ▼                  │                ▼
CANCELLED(6) CANCELLED(6)          └──── AWAITING_REVIEW(4)
                                                     │
                                                     ▼
                                            COMPLETED(5)
```

### Object Ownership

| Object | Type | Owner |
|--------|------|-------|
| `IdentityRegistry` | Shared | Global (one instance) |
| `Profile` | Owned | User wallet |
| `ProfileCap` | Owned | User wallet |
| `Job` | Shared | Accessible to all |
| `JobCap` | Owned | Client who created job |
| `Milestone` | Stored | Inside Job object |
| `Rating` | Shared | Accessible to all |
| `Badge` | Owned | Recipient user |
