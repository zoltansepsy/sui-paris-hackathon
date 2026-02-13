# Job Assignment Ownership Fix - Implementation Summary

## Problem

The `assign_freelancer` function in `job_escrow.move` failed at runtime because it required the **client** to pass the **freelancer's Profile** object. On Sui, only the owner of an object can pass it in a transaction - the client doesn't own the freelancer's profile, causing `InvalidOwner` or `MutableObjectUsedAsImmutable` errors.

## Solution

Moved the profile update logic from `assign_freelancer` (client action) to `start_job` (freelancer action):

| Function | Before | After |
|----------|--------|-------|
| `assign_freelancer` | Required `freelancer_profile` param | No profile param needed |
| `start_job` | No profile param | Now requires `freelancer_profile` param |

The freelancer now provides their own profile when they call `start_job`, which they can do because they own it.

## Files Changed

### Smart Contract (`move/zk_freelance/sources/job_escrow.move`)

**`assign_freelancer` (lines 313-352):**
```move
// BEFORE: 6 parameters including freelancer_profile
public fun assign_freelancer(
    job: &mut Job,
    cap: &JobCap,
    freelancer: address,
    freelancer_profile: &mut Profile,  // REMOVED
    clock: &Clock,
    ctx: &mut TxContext
)

// AFTER: 5 parameters, no profile needed
public fun assign_freelancer(
    job: &mut Job,
    cap: &JobCap,
    freelancer: address,
    clock: &Clock,
    ctx: &mut TxContext
)
```

**`start_job` (lines 358-401):**
```move
// BEFORE: 3 parameters
public fun start_job(
    job: &mut Job,
    clock: &Clock,
    ctx: &mut TxContext
)

// AFTER: 4 parameters, includes freelancer_profile + profile updates
public fun start_job(
    job: &mut Job,
    freelancer_profile: &mut Profile,  // ADDED
    clock: &Clock,
    ctx: &mut TxContext
) {
    // ... validation ...

    // Verify profile ownership
    let freelancer = *option::borrow(&job.freelancer);
    assert!(profile_nft::get_owner(freelancer_profile) == freelancer, ENotAuthorized);

    // Get the stored cap and increment total_jobs
    let job_profile_cap = table::borrow(&job.applicant_caps, freelancer);
    profile_nft::increment_total_jobs(freelancer_profile, job_profile_cap, clock);

    // Add job to freelancer's active jobs
    profile_nft::add_active_job(freelancer_profile, object::id(job), clock);

    // ... state transition and events ...
}
```

### Tests

**`job_workflow_state_machine_tests.move`:**
- Updated `apply_and_assign` helper - removed freelancer_profile from assign
- Updated `start_job` helper - added freelancer_profile handling
- Fixed `test_concurrent_applications` - removed profile from assign call
- Updated assertions: `total_jobs` is now 0 after assign, 1 after start_job

**`job_escrow_tests.move`:**
- Updated ~20 occurrences of `assign_freelancer` calls
- Updated ~19 occurrences of `start_job` calls
- Added proper profile take/return patterns in each transaction block

### TypeScript Service (`app/services/jobService.ts`)

```typescript
// BEFORE
assignFreelancerTransaction(
  jobId: string,
  jobCapId: string,
  freelancerAddress: string,
  freelancerProfileId: string  // REMOVED
): Transaction

// AFTER
assignFreelancerTransaction(
  jobId: string,
  jobCapId: string,
  freelancerAddress: string
): Transaction

// BEFORE
startJobTransaction(jobId: string): Transaction

// AFTER
startJobTransaction(jobId: string, freelancerProfileId: string): Transaction
```

### Frontend (`app/components/job/ClientJobDetailView.tsx`)

Removed the freelancer profile lookup from `handleAssignFreelancer`:
```typescript
// No longer need freelancer profile - profile update now happens in start_job
const tx = jobService.assignFreelancerTransaction(
  jobId,
  jobCapId,
  freelancerAddress
  // freelancerProfileId removed
);
```

### Shell Test Script (`test_job_workflow_devnet.sh`)

- Updated from 7 steps to 8 steps
- Step 7: `assign_freelancer` now succeeds (no profile needed)
- Step 8: Added `start_job` as freelancer with profile

## Test Results

All **98 Move tests pass** after the changes.

## Job Workflow After Fix

```
1. Client creates job (OPEN)
2. Freelancer applies with JobProfileUpdateCap
3. Client assigns freelancer (ASSIGNED) - no profile needed
4. Freelancer starts job (IN_PROGRESS) - provides own profile, total_jobs incremented
5. Freelancer submits milestone (SUBMITTED)
6. Client approves milestone (COMPLETED) - only updates client profile
7. Freelancer claims job completion - updates freelancer profile
```

---

# Split Operation Pattern - approve_milestone Fix

## Problem

Similar to the assign_freelancer issue, `approve_milestone` originally required both `client_profile` and `freelancer_profile` parameters. On Sui, the client cannot pass the freelancer's owned Profile object in their transaction.

## Solution: Split Operation Pattern

Split the profile update into two separate transactions:

| Step | Actor | Function | Profile Update |
|------|-------|----------|----------------|
| 1 | Client | `approve_milestone` | Client profile only |
| 2 | Freelancer | `claim_job_completion` | Freelancer profile only |

## Implementation

### New Field in Job Struct

```move
public struct Job has key {
    // ... existing fields ...
    /// Pending freelancer completion claim (amount to record in profile)
    /// Set when client approves final milestone, cleared when freelancer claims
    pending_freelancer_completion: Option<u64>,
}
```

### Modified Functions

**`approve_milestone` (now only updates client profile):**
```move
public fun approve_milestone(
    job: &mut Job,
    cap: &JobCap,
    milestone_id: u64,
    client_profile: &mut Profile,  // Only client profile now
    clock: &Clock,
    ctx: &mut TxContext
) {
    // ... validation and payment release ...

    if (all_milestones_approved(job)) {
        // Complete job - only updates client profile
        complete_job_client_side(job, client_profile, clock);
    }
}
```

**New `claim_job_completion` function:**
```move
public fun claim_job_completion(
    job: &mut Job,
    freelancer_profile: &mut Profile,
    clock: &Clock,
    ctx: &mut TxContext
) {
    // Validation
    assert!(job.state == STATE_COMPLETED, EInvalidState);
    assert!(option::is_some(&job.pending_freelancer_completion), ENoPendingCompletion);

    // Get and clear pending completion
    let total_paid = option::extract(&mut job.pending_freelancer_completion);

    // Update freelancer profile
    profile_nft::record_job_completion(freelancer_profile, object::id(job), total_paid, clock);

    // Emit event
    event::emit(FreelancerCompletionClaimed { ... });
}
```

### New Events

```move
/// Emitted when job is ready for freelancer to claim completion
public struct FreelancerCompletionPending has copy, drop {
    job_id: ID,
    freelancer: address,
    total_paid: u64,
    timestamp: u64,
}

/// Emitted when freelancer claims their job completion
public struct FreelancerCompletionClaimed has copy, drop {
    job_id: ID,
    freelancer: address,
    total_paid: u64,
    timestamp: u64,
}
```

### TypeScript Service Updates

```typescript
// BEFORE: Required both profiles
approveMilestoneTransaction(
  jobId: string,
  jobCapId: string,
  milestoneId: number,
  clientProfileId: string,
  freelancerProfileId: string  // REMOVED
): Transaction

// AFTER: Only client profile
approveMilestoneTransaction(
  jobId: string,
  jobCapId: string,
  milestoneId: number,
  clientProfileId: string
): Transaction

// NEW: Freelancer claims their profile update
claimJobCompletionTransaction(
  jobId: string,
  freelancerProfileId: string
): Transaction
```

## Complete Job Workflow

```
1. Client creates job (OPEN) - updates client profile
2. Freelancer applies
3. Client assigns freelancer (ASSIGNED)
4. Freelancer starts job (IN_PROGRESS) - updates freelancer profile (total_jobs)
5. Freelancer submits milestone (SUBMITTED)
6. Client approves milestone (COMPLETED)
   - Releases payment to freelancer
   - Updates client profile (completed_jobs, total_amount)
   - Sets pending_freelancer_completion
   - Emits FreelancerCompletionPending event
7. Freelancer claims completion
   - Updates freelancer profile (completed_jobs, total_amount)
   - Clears pending_freelancer_completion
   - Emits FreelancerCompletionClaimed event
```

## Key Benefits

1. **Ownership Compliance**: Each user only mutates their own Profile object
2. **Event-Driven UX**: Frontend can listen for `FreelancerCompletionPending` to prompt freelancer
3. **Atomic Payments**: Payment is released immediately on approval, profile update is separate
4. **Graceful Degradation**: If freelancer never claims, job is still COMPLETED and paid
