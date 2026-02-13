/// Job Escrow Module
/// Manages job posting, freelancer assignment, milestone tracking, and payment escrow
///
/// DEV 1 TODO:
/// 1. Implement complete state machine transitions
/// 2. Add deadline enforcement logic
/// 3. Implement refund mechanism
/// 4. Add applicant management
/// 5. Test all state transitions
/// 6. Add comprehensive error codes
/// 7. **CRITICAL**: Emit events in ALL state-changing functions (required for event-based indexing)
/// 8. Create job_escrow_tests.move with tests for event emissions

module zk_freelance::job_escrow {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::event;
    use sui::clock::{Self, Clock};
    use zk_freelance::profile_nft::{Self, Profile};
    use zk_freelance::whitelist::{Self, Whitelist, Cap as WhitelistCap};

    // ======== Constants ========

    /// Job states
    const STATE_OPEN: u8 = 0;
    const STATE_ASSIGNED: u8 = 1;
    const STATE_IN_PROGRESS: u8 = 2;
    const STATE_SUBMITTED: u8 = 3;
    const STATE_AWAITING_REVIEW: u8 = 4;
    const STATE_COMPLETED: u8 = 5;
    const STATE_CANCELLED: u8 = 6;
    #[allow(unused_const)]
    const STATE_DISPUTED: u8 = 7;

    /// Error codes
    const ENotAuthorized: u64 = 0;
    const EInvalidState: u64 = 1;
    const EInsufficientFunds: u64 = 2;
    const EDeadlinePassed: u64 = 3;
    const EInvalidMilestone: u64 = 4;
    const EJobNotOpen: u64 = 5;
    const EAlreadyApplied: u64 = 6;
    const EFreelancerNotAssigned: u64 = 7;
    const ENoPendingCompletion: u64 = 8;
    const ERevisionReasonRequired: u64 = 9;

    // ======== Structs ========

    /// Main Job object - shared object
    public struct Job has key {
        id: UID,
        /// Client who posted the job
        client: address,
        /// Assigned freelancer (Option)
        freelancer: Option<address>,
        /// Job title
        title: vector<u8>,
        /// Description stored on Walrus (blob ID)
        description_blob_id: vector<u8>,
        /// Total budget in MIST
        budget: u64,
        /// Escrow holding the funds
        escrow: Balance<SUI>,
        /// Current state
        state: u8,
        /// Milestones table
        milestones: Table<u64, Milestone>,
        /// Number of milestones
        milestone_count: u64,
        /// List of applicants
        applicants: vector<address>,
        /// Job creation timestamp
        created_at: u64,
        /// Job deadline timestamp
        deadline: u64,
        /// Deliverable blob IDs (encrypted with Seal)
        deliverable_blob_ids: vector<vector<u8>>,
        /// Pending freelancer completion claim (amount to record in profile)
        /// Set when client approves final milestone, cleared when freelancer claims
        pending_freelancer_completion: Option<u64>,
    }

    /// Milestone struct
    public struct Milestone has store {
        id: u64,
        description: vector<u8>,
        amount: u64,
        completed: bool,
        approved: bool,
        /// Encrypted blob ID on Walrus (encrypted deliverable)
        submission_blob_id: Option<vector<u8>>,
        /// Preview URL for client to review before approval
        preview_url: Option<vector<u8>>,
        /// ID of the DeliverableEscrow object holding the whitelist Cap
        deliverable_escrow_id: Option<ID>,
        /// Whitelist object ID for Seal decryption
        whitelist_id: Option<ID>,
        /// Encryption nonce for Seal decryption
        nonce: Option<vector<u8>>,
        /// Original file name for display
        original_file_name: Option<vector<u8>>,
        submitted_at: Option<u64>,
        approved_at: Option<u64>,
    }

    /// Deliverable Escrow - shared object holding the whitelist Cap
    /// Created by freelancer during submission, used by approve_milestone to grant access
    public struct DeliverableEscrow has key {
        id: UID,
        /// The job this deliverable belongs to
        job_id: ID,
        /// The milestone this deliverable belongs to
        milestone_id: u64,
        /// The whitelist Cap (controls who can decrypt)
        whitelist_cap: WhitelistCap,
        /// The whitelist object ID (for validation)
        whitelist_id: ID,
        /// Has access been granted? (prevents double-grant)
        access_granted: bool,
    }

    /// Job capability - given to client for management
    public struct JobCap has key, store {
        id: UID,
        job_id: ID,
    }

    // ======== Events ========
    //
    // NOTE: Events include comprehensive data for client-side indexing
    // This follows Sui's event-based discovery pattern for marketplace listings
    // Events are the primary mechanism for discovering jobs across all clients

    /// Emitted when a new job is created
    /// Contains all essential job data to avoid additional queries
    public struct JobCreated has copy, drop {
        job_id: ID,
        client: address,
        title: vector<u8>,
        description_blob_id: vector<u8>,
        budget: u64,
        deadline: u64,
        milestone_count: u64,
        state: u8,  // Always STATE_OPEN at creation
        timestamp: u64,
    }

    /// Emitted when a freelancer applies for a job
    public struct FreelancerApplied has copy, drop {
        job_id: ID,
        freelancer: address,
        timestamp: u64,
    }

    /// Emitted when client assigns a freelancer to a job
    /// Includes both client and freelancer for bi-directional queries
    public struct FreelancerAssigned has copy, drop {
        job_id: ID,
        client: address,
        freelancer: address,
        timestamp: u64,
    }

    /// Emitted when job state changes
    /// Allows tracking current job state without querying Job object
    public struct JobStateChanged has copy, drop {
        job_id: ID,
        old_state: u8,
        new_state: u8,
        freelancer: Option<address>,  // Included for filtering
        timestamp: u64,
    }

    /// Emitted when freelancer starts work
    public struct JobStarted has copy, drop {
        job_id: ID,
        freelancer: address,
        timestamp: u64,
    }

    /// Emitted when freelancer submits milestone
    public struct MilestoneSubmitted has copy, drop {
        job_id: ID,
        milestone_id: u64,
        freelancer: address,
        submission_blob_id: vector<u8>,  // Encrypted blob ID on Walrus
        preview_url: vector<u8>,         // Preview URL for client review
        whitelist_id: ID,                // Whitelist ID for decryption
        nonce: vector<u8>,               // Encryption nonce
        original_file_name: vector<u8>,  // Original file name
        timestamp: u64,
    }

    /// Emitted when client approves milestone
    public struct MilestoneApproved has copy, drop {
        job_id: ID,
        milestone_id: u64,
        amount: u64,
        freelancer: address,
        timestamp: u64,
    }

    /// Emitted when job is fully completed
    public struct JobCompleted has copy, drop {
        job_id: ID,
        client: address,
        freelancer: address,
        total_paid: u64,
        timestamp: u64,
    }

    /// Emitted when job is cancelled
    public struct JobCancelled has copy, drop {
        job_id: ID,
        client: address,
        refund_amount: u64,
        cancelled_state: u8,  // State when cancelled (OPEN or ASSIGNED)
        timestamp: u64,
    }

    /// Emitted when funds are released from escrow
    public struct FundsReleased has copy, drop {
        job_id: ID,
        recipient: address,
        amount: u64,
        reason: u8,  // 0=milestone, 1=completion, 2=refund
        timestamp: u64,
    }

    /// Emitted when job is ready for freelancer to claim completion
    /// Freelancer should call claim_job_completion to update their profile
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

    /// Emitted when client requests revision on a submitted milestone
    public struct MilestoneRevisionRequested has copy, drop {
        job_id: ID,
        milestone_id: u64,
        client: address,
        freelancer: address,
        reason_blob_id: vector<u8>,  // Required: feedback for freelancer
        timestamp: u64,
    }

    /// Emitted when client is granted access to decrypt deliverable
    public struct DeliverableAccessGranted has copy, drop {
        job_id: ID,
        milestone_id: u64,
        client: address,
        whitelist_id: ID,
        submission_blob_id: vector<u8>,
        nonce: vector<u8>,
        timestamp: u64,
    }

    // ======== Public Functions ========

    /// Create a new job with escrow funding
    /// Returns JobCap to the client
    ///
    /// Validates budget and deadline, creates Job object with escrow,
    /// creates JobCap for client, emits JobCreated event
    #[allow(lint(self_transfer))]
    public fun create_job(
        client_profile: &mut Profile,
        title: vector<u8>,
        description_blob_id: vector<u8>,
        budget: Coin<SUI>,
        deadline: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        let timestamp = clock::timestamp_ms(clock);
        let budget_amount = coin::value(&budget);

        // Validation
        assert!(budget_amount > 0, EInsufficientFunds);
        assert!(deadline > timestamp, EDeadlinePassed);
        assert!(vector::length(&title) > 0, EInvalidState);
        assert!(profile_nft::get_owner(client_profile) == sender, ENotAuthorized);

        // Create Job object
        let job_uid = object::new(ctx);
        let job_id = object::uid_to_inner(&job_uid);

        let job = Job {
            id: job_uid,
            client: sender,
            freelancer: option::none(),
            title,
            description_blob_id,
            budget: budget_amount,
            escrow: coin::into_balance(budget),
            state: STATE_OPEN,
            milestones: table::new(ctx),
            milestone_count: 0,
            applicants: vector::empty(),
            created_at: timestamp,
            deadline,
            deliverable_blob_ids: vector::empty(),
            pending_freelancer_completion: option::none(),
        };

        // Create JobCap
        let cap = JobCap {
            id: object::new(ctx),
            job_id,
        };

        // Emit event (CRITICAL for marketplace discovery)
        event::emit(JobCreated {
            job_id,
            client: sender,
            title,
            description_blob_id,
            budget: budget_amount,
            deadline,
            milestone_count: 0,
            state: STATE_OPEN,
            timestamp,
        });

        // Update client profile with active job and increment total_jobs
        profile_nft::increment_own_total_jobs(client_profile, clock, ctx);
        profile_nft::add_active_job(client_profile, job_id, clock);

        // Share job (makes it accessible to all)
        transfer::share_object(job);

        // Transfer capability to client
        transfer::transfer(cap, sender);
    }

    /// Apply for a job as freelancer
    ///
    /// Validates job is open, freelancer hasn't applied, adds to applicants
    public fun apply_for_job(
        job: &mut Job,
        freelancer_profile: &Profile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        let timestamp = clock::timestamp_ms(clock);

        // Validation
        assert!(job.state == STATE_OPEN, EJobNotOpen);
        assert!(!is_deadline_passed(job, clock), EDeadlinePassed);
        assert!(sender != job.client, ENotAuthorized);
        assert!(!vector::contains(&job.applicants, &sender), EAlreadyApplied);
        assert!(profile_nft::get_owner(freelancer_profile) == sender, ENotAuthorized);

        // Add to applicants
        vector::push_back(&mut job.applicants, sender);

        // Emit event
        event::emit(FreelancerApplied {
            job_id: object::id(job),
            freelancer: sender,
            timestamp,
        });
    }

    /// Assign freelancer to job (client only)
    ///
    /// Validates JobCap, assigns freelancer from applicants, transitions to ASSIGNED
    /// Profile updates (increment_total_jobs, add_active_job) moved to start_job
    public fun assign_freelancer(
        job: &mut Job,
        cap: &JobCap,
        freelancer: address,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let timestamp = clock::timestamp_ms(clock);
        let sender = tx_context::sender(ctx);

        // Validation
        verify_cap(job, cap);
        assert!(sender == job.client, ENotAuthorized);
        assert!(job.state == STATE_OPEN, EInvalidState);
        assert!(vector::contains(&job.applicants, &freelancer), ENotAuthorized);

        // State transition
        let old_state = job.state;
        job.state = STATE_ASSIGNED;
        job.freelancer = option::some(freelancer);

        // Emit events
        event::emit(FreelancerAssigned {
            job_id: object::id(job),
            client: job.client,
            freelancer,
            timestamp,
        });

        event::emit(JobStateChanged {
            job_id: object::id(job),
            old_state,
            new_state: STATE_ASSIGNED,
            freelancer: option::some(freelancer),
            timestamp,
        });
    }

    /// Start work on job (freelancer only)
    ///
    /// Validates assigned freelancer, transitions job to IN_PROGRESS
    /// Updates freelancer profile (increment total_jobs, add active job)
    public fun start_job(
        job: &mut Job,
        freelancer_profile: &mut Profile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        let timestamp = clock::timestamp_ms(clock);

        // Validation
        assert!(job.state == STATE_ASSIGNED, EInvalidState);
        assert!(option::contains(&job.freelancer, &sender), EFreelancerNotAssigned);
        assert!(!is_deadline_passed(job, clock), EDeadlinePassed);

        // Verify profile ownership - freelancer must pass their own profile
        let freelancer = *option::borrow(&job.freelancer);
        assert!(profile_nft::get_owner(freelancer_profile) == freelancer, ENotAuthorized);

        // Freelancer updates their own profile (no cap needed - they are the caller)
        profile_nft::increment_own_total_jobs(freelancer_profile, clock, ctx);

        // Add job to freelancer's active jobs
        profile_nft::add_active_job(freelancer_profile, object::id(job), clock);

        // State transition
        let old_state = job.state;
        job.state = STATE_IN_PROGRESS;

        // Emit events
        event::emit(JobStarted {
            job_id: object::id(job),
            freelancer: sender,
            timestamp,
        });

        event::emit(JobStateChanged {
            job_id: object::id(job),
            old_state,
            new_state: STATE_IN_PROGRESS,
            freelancer: job.freelancer,
            timestamp,
        });
    }

    /// Submit milestone completion with encrypted deliverable (freelancer only)
    ///
    /// Validates freelancer, stores encrypted deliverable metadata, transitions to SUBMITTED.
    /// Creates a DeliverableEscrow shared object that holds the whitelist Cap.
    /// When the client approves the milestone, the contract uses the Cap to grant access.
    ///
    /// @param job - The job object
    /// @param milestone_id - Which milestone is being submitted
    /// @param proof_blob_id - Encrypted blob ID on Walrus
    /// @param preview_url - URL where client can preview the work (e.g., deployed app)
    /// @param whitelist_cap - Whitelist Cap (transferred to escrow for later access grant)
    /// @param whitelist_id - Whitelist object ID (for Seal decryption)
    /// @param nonce - Encryption nonce (for Seal decryption)
    /// @param original_file_name - Original file name for display
    /// @param clock - Clock object for timestamps
    /// @param ctx - Transaction context
    public fun submit_milestone(
        job: &mut Job,
        milestone_id: u64,
        proof_blob_id: vector<u8>,
        preview_url: vector<u8>,
        whitelist_cap: WhitelistCap,
        whitelist_id: ID,
        nonce: vector<u8>,
        original_file_name: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        let timestamp = clock::timestamp_ms(clock);
        let job_id = object::id(job);

        // Validation
        assert!(job.state == STATE_IN_PROGRESS, EInvalidState);
        assert!(option::contains(&job.freelancer, &sender), EFreelancerNotAssigned);
        assert!(table::contains(&job.milestones, milestone_id), EInvalidMilestone);

        // Create DeliverableEscrow to hold the whitelist Cap
        let escrow_uid = object::new(ctx);
        let escrow_id = object::uid_to_inner(&escrow_uid);
        let escrow = DeliverableEscrow {
            id: escrow_uid,
            job_id,
            milestone_id,
            whitelist_cap,
            whitelist_id,
            access_granted: false,
        };

        // Get milestone and update it
        let milestone = table::borrow_mut(&mut job.milestones, milestone_id);
        assert!(!milestone.completed, EInvalidState);

        // Update milestone with encrypted deliverable data
        milestone.completed = true;
        milestone.submission_blob_id = option::some(proof_blob_id);
        milestone.preview_url = option::some(preview_url);
        milestone.deliverable_escrow_id = option::some(escrow_id);
        milestone.whitelist_id = option::some(whitelist_id);
        milestone.nonce = option::some(nonce);
        milestone.original_file_name = option::some(original_file_name);
        milestone.submitted_at = option::some(timestamp);

        // Add deliverable blob ID to job-level tracking
        vector::push_back(&mut job.deliverable_blob_ids, proof_blob_id);

        // State transition
        let old_state = job.state;
        job.state = STATE_SUBMITTED;

        // Share the escrow object (makes it accessible to approve_milestone)
        transfer::share_object(escrow);

        // Emit events
        event::emit(MilestoneSubmitted {
            job_id,
            milestone_id,
            freelancer: sender,
            submission_blob_id: proof_blob_id,
            preview_url,
            whitelist_id,
            nonce,
            original_file_name,
            timestamp,
        });

        event::emit(JobStateChanged {
            job_id,
            old_state,
            new_state: STATE_SUBMITTED,
            freelancer: job.freelancer,
            timestamp,
        });
    }

    /// Approve milestone, release funds, and grant client access to encrypted deliverable (client only)
    ///
    /// Validates JobCap, releases payment, checks for job completion.
    /// CRITICAL: This function also adds the client to the whitelist, granting them
    /// access to decrypt the encrypted deliverable. The DeliverableEscrow object
    /// holds the whitelist Cap and is used to authorize this action.
    ///
    /// If job is complete, sets pending_freelancer_completion for freelancer to claim.
    /// Freelancer must call claim_job_completion() to update their profile.
    ///
    /// @param job - The job object
    /// @param cap - JobCap proving client ownership
    /// @param milestone_id - Which milestone to approve
    /// @param deliverable_escrow - The escrow object holding the whitelist Cap
    /// @param whitelist - The whitelist object (must match milestone's whitelist_id)
    /// @param client_profile - Client's profile for stats update
    /// @param clock - Clock object for timestamps
    /// @param ctx - Transaction context
    public fun approve_milestone(
        job: &mut Job,
        cap: &JobCap,
        milestone_id: u64,
        deliverable_escrow: &mut DeliverableEscrow,
        whitelist: &mut Whitelist,
        client_profile: &mut Profile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let timestamp = clock::timestamp_ms(clock);

        // Validation
        verify_cap(job, cap);
        assert!(job.state == STATE_SUBMITTED || job.state == STATE_AWAITING_REVIEW, EInvalidState);
        assert!(table::contains(&job.milestones, milestone_id), EInvalidMilestone);
        assert!(option::is_some(&job.freelancer), EFreelancerNotAssigned);

        let freelancer = *option::borrow(&job.freelancer);
        assert!(profile_nft::get_owner(client_profile) == job.client, ENotAuthorized);

        // Validate deliverable escrow matches the milestone
        assert!(deliverable_escrow.job_id == object::id(job), EInvalidState);
        assert!(deliverable_escrow.milestone_id == milestone_id, EInvalidState);
        assert!(!deliverable_escrow.access_granted, EInvalidState);

        // Get milestone
        let milestone = table::borrow_mut(&mut job.milestones, milestone_id);
        assert!(milestone.completed && !milestone.approved, EInvalidState);

        // Verify whitelist matches the one stored in milestone and escrow
        assert!(option::is_some(&milestone.whitelist_id), EInvalidState);
        let stored_whitelist_id = *option::borrow(&milestone.whitelist_id);
        assert!(object::id(whitelist) == stored_whitelist_id, EInvalidState);
        assert!(deliverable_escrow.whitelist_id == stored_whitelist_id, EInvalidState);

        // Grant client access to decrypt the deliverable using the escrow's Cap
        whitelist::add(whitelist, &deliverable_escrow.whitelist_cap, job.client);

        // Mark access as granted in escrow (prevents double-grant)
        deliverable_escrow.access_granted = true;

        // Mark approved
        milestone.approved = true;
        milestone.approved_at = option::some(timestamp);

        let amount = milestone.amount;

        // Get submission data for event (before releasing funds)
        let submission_blob_id = *option::borrow(&milestone.submission_blob_id);
        let nonce = *option::borrow(&milestone.nonce);

        // Release funds from escrow
        let payment = coin::take(&mut job.escrow, amount, ctx);
        transfer::public_transfer(payment, freelancer);

        // Emit payment event
        event::emit(FundsReleased {
            job_id: object::id(job),
            recipient: freelancer,
            amount,
            reason: 0,  // 0 = milestone payment
            timestamp,
        });

        // Emit milestone approved event
        event::emit(MilestoneApproved {
            job_id: object::id(job),
            milestone_id,
            amount,
            freelancer,
            timestamp,
        });

        // Emit access granted event (client can now decrypt)
        event::emit(DeliverableAccessGranted {
            job_id: object::id(job),
            milestone_id,
            client: job.client,
            whitelist_id: stored_whitelist_id,
            submission_blob_id,
            nonce,
            timestamp,
        });

        // Check if all milestones approved
        if (all_milestones_approved(job)) {
            // Complete job with only client profile update
            complete_job_client_side(job, client_profile, clock);
        } else {
            // Back to IN_PROGRESS for next milestone
            let old_state = job.state;
            job.state = STATE_IN_PROGRESS;

            event::emit(JobStateChanged {
                job_id: object::id(job),
                old_state,
                new_state: STATE_IN_PROGRESS,
                freelancer: job.freelancer,
                timestamp,
            });
        }
    }

    /// Request revision on a submitted milestone (client only)
    ///
    /// Resets milestone for freelancer to resubmit, job returns to IN_PROGRESS.
    /// Feedback is required to help freelancer understand needed changes.
    public fun request_revision(
        job: &mut Job,
        cap: &JobCap,
        milestone_id: u64,
        reason_blob_id: vector<u8>,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        let timestamp = clock::timestamp_ms(clock);

        // Validation
        verify_cap(job, cap);
        assert!(
            job.state == STATE_SUBMITTED || job.state == STATE_AWAITING_REVIEW,
            EInvalidState
        );
        assert!(table::contains(&job.milestones, milestone_id), EInvalidMilestone);
        assert!(option::is_some(&job.freelancer), EFreelancerNotAssigned);
        assert!(vector::length(&reason_blob_id) > 0, ERevisionReasonRequired);

        let freelancer = *option::borrow(&job.freelancer);

        // Get milestone and validate state
        let milestone = table::borrow_mut(&mut job.milestones, milestone_id);
        assert!(milestone.completed && !milestone.approved, EInvalidState);

        // Reset milestone for resubmission
        milestone.completed = false;
        milestone.submission_blob_id = option::none();
        milestone.submitted_at = option::none();

        // State transition: SUBMITTED → IN_PROGRESS
        let old_state = job.state;
        job.state = STATE_IN_PROGRESS;

        // Emit events
        event::emit(MilestoneRevisionRequested {
            job_id: object::id(job),
            milestone_id,
            client: job.client,
            freelancer,
            reason_blob_id,
            timestamp,
        });

        event::emit(JobStateChanged {
            job_id: object::id(job),
            old_state,
            new_state: STATE_IN_PROGRESS,
            freelancer: job.freelancer,
            timestamp,
        });
    }

    /// Add milestone to job (client only, before assignment)
    ///
    /// Validates JobCap, adds milestone with amount validation
    public fun add_milestone(
        job: &mut Job,
        cap: &JobCap,
        description: vector<u8>,
        amount: u64,
        _ctx: &mut TxContext
    ) {
        // Validation
        verify_cap(job, cap);
        assert!(job.state == STATE_OPEN, EInvalidState);
        assert!(amount > 0 && amount <= job.budget, EInvalidMilestone);

        // Validate total milestones don't exceed budget
        let mut total_milestone_amount = amount;
        let mut i = 0;
        while (i < job.milestone_count) {
            let milestone = table::borrow(&job.milestones, i);
            total_milestone_amount = total_milestone_amount + milestone.amount;
            i = i + 1;
        };
        assert!(total_milestone_amount <= job.budget, EInvalidMilestone);

        // Create milestone with empty deliverable fields
        let milestone = Milestone {
            id: job.milestone_count,
            description,
            amount,
            completed: false,
            approved: false,
            submission_blob_id: option::none(),
            preview_url: option::none(),
            deliverable_escrow_id: option::none(),
            whitelist_id: option::none(),
            nonce: option::none(),
            original_file_name: option::none(),
            submitted_at: option::none(),
            approved_at: option::none(),
        };

        // Add to table
        table::add(&mut job.milestones, job.milestone_count, milestone);
        job.milestone_count = job.milestone_count + 1;
    }

    /// Cancel job and refund (client only, before IN_PROGRESS, OPEN state - no freelancer)
    ///
    /// Validates JobCap, refunds escrow to client, transitions to CANCELLED
    public fun cancel_job(
        job: &mut Job,
        cap: &JobCap,
        client_profile: &mut Profile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let timestamp = clock::timestamp_ms(clock);
        let job_id = object::id(job);

        // Validation
        verify_cap(job, cap);
        assert!(job.state == STATE_OPEN, EInvalidState);
        assert!(profile_nft::get_owner(client_profile) == job.client, ENotAuthorized);

        let old_state = job.state;
        job.state = STATE_CANCELLED;

        // Refund escrow to client
        let refund_amount = balance::value(&job.escrow);
        let refund = coin::take(&mut job.escrow, refund_amount, ctx);
        transfer::public_transfer(refund, job.client);

        // Remove job from client profile
        profile_nft::remove_active_job(client_profile, job_id, clock);

        // Emit events
        event::emit(FundsReleased {
            job_id,
            recipient: job.client,
            amount: refund_amount,
            reason: 2,  // 2 = refund
            timestamp,
        });

        event::emit(JobCancelled {
            job_id,
            client: job.client,
            refund_amount,
            cancelled_state: old_state,
            timestamp,
        });

        event::emit(JobStateChanged {
            job_id: object::id(job),
            old_state,
            new_state: STATE_CANCELLED,
            freelancer: job.freelancer,
            timestamp,
        });
    }

    /// Cancel job with freelancer assigned (client only, ASSIGNED state)
    ///
    /// Validates JobCap, refunds escrow to client, transitions to CANCELLED
    public fun cancel_job_with_freelancer(
        job: &mut Job,
        cap: &JobCap,
        client_profile: &mut Profile,
        freelancer_profile: &mut Profile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let timestamp = clock::timestamp_ms(clock);
        let job_id = object::id(job);

        // Validation
        verify_cap(job, cap);
        assert!(job.state == STATE_ASSIGNED, EInvalidState);
        assert!(profile_nft::get_owner(client_profile) == job.client, ENotAuthorized);

        // Validate freelancer profile
        assert!(option::is_some(&job.freelancer), EInvalidState);
        let freelancer = *option::borrow(&job.freelancer);
        assert!(profile_nft::get_owner(freelancer_profile) == freelancer, ENotAuthorized);

        let old_state = job.state;
        job.state = STATE_CANCELLED;

        // Refund escrow to client
        let refund_amount = balance::value(&job.escrow);
        let refund = coin::take(&mut job.escrow, refund_amount, ctx);
        transfer::public_transfer(refund, job.client);

        // Remove job from both profiles
        profile_nft::remove_active_job(client_profile, job_id, clock);
        profile_nft::remove_active_job(freelancer_profile, job_id, clock);

        // Emit events
        event::emit(FundsReleased {
            job_id,
            recipient: job.client,
            amount: refund_amount,
            reason: 2,  // 2 = refund
            timestamp,
        });

        event::emit(JobCancelled {
            job_id,
            client: job.client,
            refund_amount,
            cancelled_state: old_state,
            timestamp,
        });

        event::emit(JobStateChanged {
            job_id: object::id(job),
            old_state,
            new_state: STATE_CANCELLED,
            freelancer: job.freelancer,
            timestamp,
        });
    }

    /// Claim job completion (freelancer only)
    ///
    /// Called by freelancer after client approves final milestone.
    /// Updates freelancer's profile with job completion stats.
    /// This solves the ownership issue where client cannot mutate freelancer's profile.
    public fun claim_job_completion(
        job: &mut Job,
        freelancer_profile: &mut Profile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        let timestamp = clock::timestamp_ms(clock);

        // Validation
        assert!(job.state == STATE_COMPLETED, EInvalidState);
        assert!(option::is_some(&job.freelancer), EFreelancerNotAssigned);
        assert!(option::is_some(&job.pending_freelancer_completion), ENoPendingCompletion);

        let freelancer = *option::borrow(&job.freelancer);
        assert!(sender == freelancer, ENotAuthorized);
        assert!(profile_nft::get_owner(freelancer_profile) == freelancer, ENotAuthorized);

        // Get and clear pending completion
        let total_paid = option::extract(&mut job.pending_freelancer_completion);

        // Update freelancer profile
        profile_nft::record_job_completion(freelancer_profile, object::id(job), total_paid, clock);

        // Emit event
        event::emit(FreelancerCompletionClaimed {
            job_id: object::id(job),
            freelancer,
            total_paid,
            timestamp,
        });
    }

    // ======== Internal Helper Functions ========

    /// Complete job - client side (internal, called when all milestones approved)
    ///
    /// Transitions job to COMPLETED, updates client profile, sets pending for freelancer.
    /// Freelancer must call claim_job_completion() to update their profile.
    fun complete_job_client_side(
        job: &mut Job,
        client_profile: &mut Profile,
        clock: &Clock,
    ) {
        let timestamp = clock::timestamp_ms(clock);

        // State transition
        let old_state = job.state;
        job.state = STATE_COMPLETED;

        let freelancer = *option::borrow(&job.freelancer);
        let job_id = object::id(job);

        // Calculate total paid
        let mut total_paid = 0;
        let mut i = 0;
        while (i < job.milestone_count) {
            let milestone = table::borrow(&job.milestones, i);
            total_paid = total_paid + milestone.amount;
            i = i + 1;
        };

        // Update client profile - record completion
        profile_nft::record_job_completion(client_profile, job_id, total_paid, clock);

        // Set pending freelancer completion (freelancer will claim later)
        job.pending_freelancer_completion = option::some(total_paid);

        // Emit events
        event::emit(JobCompleted {
            job_id,
            client: job.client,
            freelancer,
            total_paid,
            timestamp,
        });

        event::emit(FreelancerCompletionPending {
            job_id,
            freelancer,
            total_paid,
            timestamp,
        });

        event::emit(JobStateChanged {
            job_id: object::id(job),
            old_state,
            new_state: STATE_COMPLETED,
            freelancer: job.freelancer,
            timestamp,
        });
    }

    // ======== Getter Functions ========

    /// Get job state
    public fun get_state(job: &Job): u8 {
        job.state
    }

    /// Get job client
    public fun get_client(job: &Job): address {
        job.client
    }

    /// Get assigned freelancer
    public fun get_freelancer(job: &Job): Option<address> {
        job.freelancer
    }

    /// Get job budget
    public fun get_budget(job: &Job): u64 {
        job.budget
    }

    /// Get job deadline
    public fun get_deadline(job: &Job): u64 {
        job.deadline
    }

    /// Get milestone count
    public fun get_milestone_count(job: &Job): u64 {
        job.milestone_count
    }

    /// Check if address is in applicants
    public fun is_applicant(job: &Job, addr: address): bool {
        vector::contains(&job.applicants, &addr)
    }

    /// Get JobCap's linked job ID
    public fun get_cap_job_id(cap: &JobCap): ID {
        cap.job_id
    }

    /// Get job title
    public fun get_title(job: &Job): vector<u8> {
        job.title
    }

    /// Get description blob ID
    public fun get_description_blob_id(job: &Job): vector<u8> {
        job.description_blob_id
    }

    /// Get escrow balance
    public fun get_escrow_balance(job: &Job): u64 {
        balance::value(&job.escrow)
    }

    /// Get applicant count
    public fun get_applicant_count(job: &Job): u64 {
        vector::length(&job.applicants)
    }

    /// Get created timestamp
    public fun get_created_at(job: &Job): u64 {
        job.created_at
    }

    /// Get deliverable blob IDs count
    public fun get_deliverable_count(job: &Job): u64 {
        vector::length(&job.deliverable_blob_ids)
    }

    /// Check if freelancer has pending completion to claim
    public fun has_pending_freelancer_completion(job: &Job): bool {
        option::is_some(&job.pending_freelancer_completion)
    }

    /// Get pending freelancer completion amount (if any)
    public fun get_pending_freelancer_completion(job: &Job): Option<u64> {
        job.pending_freelancer_completion
    }

    /// Get milestone (returns reference to milestone)
    public fun get_milestone(job: &Job, milestone_id: u64): &Milestone {
        table::borrow(&job.milestones, milestone_id)
    }

    /// Milestone getters
    public fun milestone_get_id(milestone: &Milestone): u64 {
        milestone.id
    }

    public fun milestone_get_description(milestone: &Milestone): vector<u8> {
        milestone.description
    }

    public fun milestone_get_amount(milestone: &Milestone): u64 {
        milestone.amount
    }

    public fun milestone_is_completed(milestone: &Milestone): bool {
        milestone.completed
    }

    public fun milestone_is_approved(milestone: &Milestone): bool {
        milestone.approved
    }

    public fun milestone_get_submission_blob_id(milestone: &Milestone): Option<vector<u8>> {
        milestone.submission_blob_id
    }

    public fun milestone_get_submitted_at(milestone: &Milestone): Option<u64> {
        milestone.submitted_at
    }

    public fun milestone_get_approved_at(milestone: &Milestone): Option<u64> {
        milestone.approved_at
    }

    public fun milestone_get_preview_url(milestone: &Milestone): Option<vector<u8>> {
        milestone.preview_url
    }

    public fun milestone_get_whitelist_id(milestone: &Milestone): Option<ID> {
        milestone.whitelist_id
    }

    public fun milestone_get_nonce(milestone: &Milestone): Option<vector<u8>> {
        milestone.nonce
    }

    public fun milestone_get_original_file_name(milestone: &Milestone): Option<vector<u8>> {
        milestone.original_file_name
    }

    public fun milestone_get_deliverable_escrow_id(milestone: &Milestone): Option<ID> {
        milestone.deliverable_escrow_id
    }

    public fun milestone_has_deliverable_escrow(milestone: &Milestone): bool {
        option::is_some(&milestone.deliverable_escrow_id)
    }

    // ======== Helper Functions ========

    /// Verify JobCap matches Job
    fun verify_cap(job: &Job, cap: &JobCap) {
        assert!(object::id(job) == cap.job_id, ENotAuthorized);
    }

    /// Check if deadline has passed
    fun is_deadline_passed(job: &Job, clock: &Clock): bool {
        clock::timestamp_ms(clock) > job.deadline
    }

    // /// Validate state transition
    // fun can_transition(from: u8, to: u8): bool {
    //     // OPEN → ASSIGNED or CANCELLED
    //     if (from == STATE_OPEN) {
    //         return to == STATE_ASSIGNED || to == STATE_CANCELLED
    //     };

    //     // ASSIGNED → IN_PROGRESS or CANCELLED
    //     if (from == STATE_ASSIGNED) {
    //         return to == STATE_IN_PROGRESS || to == STATE_CANCELLED
    //     };

    //     // IN_PROGRESS → SUBMITTED
    //     if (from == STATE_IN_PROGRESS) {
    //         return to == STATE_SUBMITTED
    //     };

    //     // SUBMITTED → AWAITING_REVIEW
    //     if (from == STATE_SUBMITTED) {
    //         return to == STATE_AWAITING_REVIEW
    //     };

    //     // AWAITING_REVIEW → IN_PROGRESS or COMPLETED
    //     if (from == STATE_AWAITING_REVIEW) {
    //         return to == STATE_IN_PROGRESS || to == STATE_COMPLETED
    //     };

    //     false
    // }

    /// Check if all milestones are approved
    fun all_milestones_approved(job: &Job): bool {
        if (job.milestone_count == 0) {
            return false
        };

        let mut i = 0;
        while (i < job.milestone_count) {
            let milestone = table::borrow(&job.milestones, i);
            if (!milestone.approved) {
                return false
            };
            i = i + 1;
        };
        true
    }

    // ======== Test Functions ========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        // Test initialization if needed
    }
}
