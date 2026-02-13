/**
 * Job Escrow Service
 * Handles job creation, management, milestone tracking, and escrow operations
 *
 * DEV 2 TODO:
 * 1. Implement all transaction builder methods
 * 2. Add query methods for job discovery (by state, client, freelancer)
 * 3. Implement milestone parsing from job object
 * 4. Add event parsing for job creation confirmation
 * 5. Test all methods with deployed contracts
 * 6. Add comprehensive error handling
 */

import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import {
  JobData,
  JobCapData,
  JobState,
  MilestoneData,
  getJobFields,
  vectorU8ToString,
} from "./types";
import { createJobEventIndexer } from "./jobEventIndexer";

export class JobService {
  private suiClient: SuiClient;
  private packageId: string;

  constructor(suiClient: SuiClient, packageId: string) {
    this.suiClient = suiClient;
    this.packageId = packageId;
  }

  // ======== Transaction Builders ========

  /**
   * Create a new job with escrow funding
   * Creates a Job object and JobCap, deposits budget into escrow.
   * The client's profile is updated with the active job.
   *
   * @param clientProfileId Client's Profile object ID (mutable - will be updated)
   * @param title Job title
   * @param descriptionBlobId Walrus blob ID for job description
   * @param budgetAmount Budget in MIST (smallest SUI unit)
   * @param deadline Unix timestamp in milliseconds
   * @returns Transaction to sign and execute by the client
   * @note State transition: Creates job in OPEN state
   * @note Client profile updated: active_jobs incremented
   */
  createJobTransaction(
    clientProfileId: string,
    title: string,
    descriptionBlobId: string,
    budgetAmount: number,
    deadline: number
  ): Transaction {
    const tx = new Transaction();

    // Split coins for exact budget
    const [coin] = tx.splitCoins(tx.gas, [budgetAmount]);

    tx.moveCall({
      arguments: [
        tx.object(clientProfileId), // Client's Profile
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(title))),
        tx.pure.vector(
          "u8",
          Array.from(new TextEncoder().encode(descriptionBlobId))
        ),
        coin,
        tx.pure.u64(deadline),
        tx.object("0x6"), // Clock object
      ],
      target: `${this.packageId}::job_escrow::create_job`,
    });

    return tx;
  }

  /**
   * Apply for a job as freelancer
   * The freelancer profile is used for ownership validation (read-only).
   * Profile updates happen later in start_job, not during application.
   *
   * @param jobId Job object ID
   * @param freelancerProfileId Freelancer's Profile object ID (for validation)
   * @returns Transaction to sign and execute by the freelancer
   */
  applyForJobTransaction(jobId: string, freelancerProfileId: string): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        tx.object(jobId),
        tx.object(freelancerProfileId), // Freelancer's Profile (read-only validation)
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::job_escrow::apply_for_job`,
    });

    return tx;
  }

  /**
   * Assign freelancer to job (client only)
   * Selects a freelancer from applicants. No profile objects needed due to ownership fix.
   * The freelancer will update their own profile later when calling start_job.
   *
   * @param jobId Job object ID
   * @param jobCapId JobCap object ID (proves client owns the job)
   * @param freelancerAddress Address of the freelancer to assign
   * @returns Transaction to sign and execute by the client
   * @note State transition: OPEN → ASSIGNED
   * @note No profile updates at this stage (deferred to start_job)
   * @note Requires freelancer to be in applicants list
   */
  assignFreelancerTransaction(
    jobId: string,
    jobCapId: string,
    freelancerAddress: string
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        tx.object(jobId),
        tx.object(jobCapId),
        tx.pure.address(freelancerAddress),
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::job_escrow::assign_freelancer`,
    });

    return tx;
  }

  /**
   * Start work on job (freelancer only)
   * Freelancer provides their own profile for self-update via increment_own_total_jobs().
   * This is where profile stats are updated (total_jobs, active_jobs).
   *
   * @param jobId Job object ID
   * @param freelancerProfileId Freelancer's Profile object ID (mutable - will be updated)
   * @returns Transaction to sign and execute by the freelancer
   * @note State transition: ASSIGNED → IN_PROGRESS
   * @note Freelancer profile updated: total_jobs +1, active_jobs includes this job
   * @note Ownership validated via ctx.sender() in Move contract
   */
  startJobTransaction(jobId: string, freelancerProfileId: string): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        tx.object(jobId),
        tx.object(freelancerProfileId), // Freelancer's Profile
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::job_escrow::start_job`,
    });

    return tx;
  }

  /**
   * Submit milestone completion with encrypted deliverable (freelancer only)
   *
   * This is the new Walrus + Seal integration:
   * 1. Freelancer creates a whitelist and encrypts the deliverable with Seal
   * 2. Encrypted deliverable is uploaded to Walrus
   * 3. Whitelist Cap is transferred to a DeliverableEscrow (stored in contract)
   * 4. When client approves, the contract uses the Cap to grant client access
   *
   * @param jobId Job object ID
   * @param milestoneId Milestone number (0-indexed)
   * @param proofBlobId Walrus blob ID for encrypted deliverable
   * @param previewUrl URL where client can preview the work (e.g., deployed app)
   * @param whitelistCapId Whitelist Cap object ID (will be transferred to escrow)
   * @param whitelistId Whitelist object ID (for Seal decryption)
   * @param nonce Encryption nonce (for Seal decryption)
   * @param originalFileName Original file name for display
   * @returns Transaction to sign and execute by the freelancer
   * @note State transition: IN_PROGRESS → SUBMITTED
   * @note Creates a DeliverableEscrow shared object to hold the whitelist Cap
   * @note Cap is transferred to escrow - freelancer loses direct control
   */
  submitMilestoneTransaction(
    jobId: string,
    milestoneId: number,
    proofBlobId: string,
    previewUrl: string,
    whitelistCapId: string,
    whitelistId: string,
    nonce: string,
    originalFileName: string
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        tx.object(jobId),
        tx.pure.u64(milestoneId),
        tx.pure.vector(
          "u8",
          Array.from(new TextEncoder().encode(proofBlobId))
        ),
        tx.pure.vector(
          "u8",
          Array.from(new TextEncoder().encode(previewUrl))
        ),
        tx.object(whitelistCapId), // Whitelist Cap (transferred to escrow)
        tx.pure.id(whitelistId), // Whitelist object ID
        tx.pure.vector(
          "u8",
          Array.from(new TextEncoder().encode(nonce))
        ),
        tx.pure.vector(
          "u8",
          Array.from(new TextEncoder().encode(originalFileName))
        ),
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::job_escrow::submit_milestone`,
    });

    return tx;
  }

  /**
   * Approve milestone, release funds, and grant client access to encrypted deliverable (client only)
   *
   * This is the new Walrus + Seal integration:
   * 1. Client reviews the preview URL
   * 2. Client approves the milestone
   * 3. Contract automatically adds client to the whitelist (using stored Cap)
   * 4. Client can now decrypt and download the full deliverable
   *
   * Uses "Split Operation" pattern:
   * - Client approves milestone → updates client profile, sets pending completion
   * - Freelancer calls claim_job_completion → updates freelancer profile
   *
   * @param jobId Job object ID
   * @param jobCapId JobCap object ID (proves client owns the job)
   * @param milestoneId Milestone number (0-indexed)
   * @param deliverableEscrowId DeliverableEscrow object ID (holds the whitelist Cap)
   * @param whitelistId Whitelist object ID (client will be added to this)
   * @param clientProfileId Client's Profile object ID (mutable - updated on completion)
   * @returns Transaction to sign and execute by the client
   * @note State transition: SUBMITTED → IN_PROGRESS (more milestones) or COMPLETED (final milestone)
   * @note On approval: client is added to whitelist, can now decrypt deliverable
   * @note On job completion: client profile updated, freelancer must call claim_job_completion
   */
  approveMilestoneTransaction(
    jobId: string,
    jobCapId: string,
    milestoneId: number,
    deliverableEscrowId: string,
    whitelistId: string,
    clientProfileId: string
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        tx.object(jobId),
        tx.object(jobCapId),
        tx.pure.u64(milestoneId),
        tx.object(deliverableEscrowId), // DeliverableEscrow (holds whitelist Cap)
        tx.object(whitelistId), // Whitelist (client will be added)
        tx.object(clientProfileId), // Client's Profile
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::job_escrow::approve_milestone`,
    });

    return tx;
  }

  /**
   * Request revision on a submitted milestone (client only)
   * Resets the milestone for freelancer to resubmit, job returns to IN_PROGRESS.
   * Escrow funds remain locked. Feedback is required.
   *
   * @param jobId Job object ID
   * @param jobCapId JobCap object ID (proves client owns the job)
   * @param milestoneId Milestone number (0-indexed)
   * @param reasonBlobId Feedback text or Walrus blob ID (required)
   * @returns Transaction to sign and execute by the client
   * @note State transition: SUBMITTED → IN_PROGRESS
   * @note Milestone reset: completed=false, submission cleared
   * @note No funds released - escrow unchanged
   */
  requestRevisionTransaction(
    jobId: string,
    jobCapId: string,
    milestoneId: number,
    reasonBlobId: string
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        tx.object(jobId),
        tx.object(jobCapId),
        tx.pure.u64(milestoneId),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(reasonBlobId))),
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::job_escrow::request_revision`,
    });

    return tx;
  }

  /**
   * Add milestone to job (client only, before assignment)
   * Can only add milestones while job is in OPEN state (before freelancer assigned).
   * No profile updates occur.
   *
   * @param jobId Job object ID
   * @param jobCapId JobCap object ID (proves client owns the job)
   * @param description Milestone description
   * @param amount Amount in MIST for this milestone
   * @param jobSharedObjectRef Optional shared object reference for newly created jobs.
   *        Required when adding milestones immediately after job creation to avoid
   *        TypeMismatch errors. Pass { objectId, initialSharedVersion, mutable: true }
   * @returns Transaction to sign and execute by the client
   * @note Can only be called in OPEN state (before freelancer assignment)
   * @note No profile updates
   * @note Total milestone amounts should not exceed job budget
   */
  addMilestoneTransaction(
    jobId: string,
    jobCapId: string,
    description: string,
    amount: number,
    jobSharedObjectRef?: {
      objectId: string;
      initialSharedVersion: string | number;
      mutable: boolean;
    }
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        jobSharedObjectRef
          ? tx.sharedObjectRef(jobSharedObjectRef)
          : tx.object(jobId),
        tx.object(jobCapId),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(description))),
        tx.pure.u64(amount),
      ],
      target: `${this.packageId}::job_escrow::add_milestone`,
    });

    return tx;
  }

  /**
   * Cancel job and refund escrow (client only, OPEN state only)
   * Use this when no freelancer has been assigned yet.
   * Escrow funds returned to client, job removed from client profile.
   *
   * @param jobId Job object ID
   * @param jobCapId JobCap object ID (proves client owns the job)
   * @param clientProfileId Client's Profile object ID (mutable - active job removed)
   * @returns Transaction to sign and execute by the client
   * @note State transition: OPEN → CANCELLED
   * @note Only works in OPEN state (no freelancer assigned)
   * @note Client profile updated: active job removed
   * @note Use cancelJobWithFreelancerTransaction if freelancer already assigned
   */
  cancelJobTransaction(
    jobId: string,
    jobCapId: string,
    clientProfileId: string
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        tx.object(jobId),
        tx.object(jobCapId),
        tx.object(clientProfileId), // Client's Profile
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::job_escrow::cancel_job`,
    });

    return tx;
  }

  /**
   * Cancel job with freelancer assigned (client only, ASSIGNED state only)
   * Use this when a freelancer has been assigned but work hasn't started yet.
   * Escrow refunded to client, job removed from both profiles.
   *
   * @param jobId Job object ID
   * @param jobCapId JobCap object ID (proves client owns the job)
   * @param clientProfileId Client's Profile object ID (mutable - active job removed)
   * @param freelancerProfileId Freelancer's Profile object ID (mutable - active job removed)
   * @returns Transaction to sign and execute by the client
   * @note State transition: ASSIGNED → CANCELLED
   * @note Only works in ASSIGNED state (freelancer assigned but not started)
   * @note Both profiles updated: active job removed from both
   * @note Use cancelJobTransaction if no freelancer assigned yet
   */
  cancelJobWithFreelancerTransaction(
    jobId: string,
    jobCapId: string,
    clientProfileId: string,
    freelancerProfileId: string
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        tx.object(jobId),
        tx.object(jobCapId),
        tx.object(clientProfileId), // Client's Profile
        tx.object(freelancerProfileId), // Freelancer's Profile
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::job_escrow::cancel_job_with_freelancer`,
    });

    return tx;
  }

  /**
   * Claim job completion as freelancer
   * Called after client approves final milestone to update freelancer's profile stats.
   * This is part of the "Split Operation" pattern to solve Sui ownership constraints.
   *
   * @param jobId Job object ID
   * @param freelancerProfileId Freelancer's Profile object ID (mutable - will be updated)
   * @returns Transaction to sign and execute by the freelancer
   * @note Can only be called when job is COMPLETED and has pending_freelancer_completion
   * @note Updates freelancer profile: completed_jobs++, total_amount updated
   * @note Clears pending_freelancer_completion after claim
   */
  claimJobCompletionTransaction(
    jobId: string,
    freelancerProfileId: string
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        tx.object(jobId),
        tx.object(freelancerProfileId), // Freelancer's Profile
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::job_escrow::claim_job_completion`,
    });

    return tx;
  }

  // ======== Query Methods ========

  /**
   * Fetch milestones from a Table dynamic field
   *
   * Milestones are stored in a Table<u64, Milestone> which requires
   * separate queries to fetch each entry using getDynamicFieldObject.
   *
   * @param milestonesTableId The table's object ID
   * @param milestoneCount Number of milestones to fetch
   * @returns Array of milestone data
   */
  private async getMilestones(
    milestonesTableId: string,
    milestoneCount: number
  ): Promise<MilestoneData[]> {
    const milestones: MilestoneData[] = [];

    console.log(`🔍 Fetching ${milestoneCount} milestone(s) from Table ${milestonesTableId.slice(0, 10)}...`);

    for (let i = 0; i < milestoneCount; i++) {
      try {
        // Log the exact query being made
        const query = {
          parentId: milestonesTableId,
          name: { type: "u64", value: i.toString() },
        };
        console.log(`  📦 Querying milestone ${i} with:`, JSON.stringify(query));

        const milestone = await this.suiClient.getDynamicFieldObject(query);

        console.log(`  ✅ Milestone ${i} raw response:`, milestone);

        if (milestone.data?.content?.dataType === "moveObject") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dynamicFieldWrapper = (milestone.data.content as any).fields as any;
          console.log(`  🔍 Raw milestone fields:`, JSON.stringify(dynamicFieldWrapper, null, 2));

          // Dynamic fields wrap the actual data in fields.value.fields
          const fields = dynamicFieldWrapper.value.fields;

          const parsedMilestone = {
            id: Number(fields.id),
            description: vectorU8ToString(fields.description),
            amount: Number(fields.amount),
            completed: fields.completed,
            approved: fields.approved,
            submissionBlobId: fields.submission_blob_id
              ? vectorU8ToString(fields.submission_blob_id)
              : undefined,
            previewUrl: fields.preview_url
              ? vectorU8ToString(fields.preview_url)
              : undefined,
            deliverableEscrowId: fields.deliverable_escrow_id
              ? fields.deliverable_escrow_id
              : undefined,
            whitelistId: fields.whitelist_id
              ? fields.whitelist_id
              : undefined,
            nonce: fields.nonce
              ? vectorU8ToString(fields.nonce)
              : undefined,
            originalFileName: fields.original_file_name
              ? vectorU8ToString(fields.original_file_name)
              : undefined,
            submittedAt: fields.submitted_at
              ? Number(fields.submitted_at)
              : undefined,
            approvedAt: fields.approved_at
              ? Number(fields.approved_at)
              : undefined,
          };
          milestones.push(parsedMilestone);
          console.log(`  ✅ Milestone ${i} parsed successfully:`, {
            id: parsedMilestone.id,
            completed: parsedMilestone.completed,
            approved: parsedMilestone.approved,
            hasDeliverableEscrow: !!parsedMilestone.deliverableEscrowId,
            hasWhitelist: !!parsedMilestone.whitelistId,
            hasPreview: !!parsedMilestone.previewUrl,
            hasFileName: !!parsedMilestone.originalFileName,
          });
        } else {
          console.error(`  ❌ Milestone ${i} has unexpected data type:`, milestone.data?.content?.dataType);
        }
      } catch (error) {
        console.error(`  ❌ Error fetching milestone ${i}:`, error);
        console.error(`  📋 Error details:`, {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    console.log(`📊 Milestone fetch summary: ${milestones.length}/${milestoneCount} fetched successfully`);

    if (milestones.length === 0 && milestoneCount > 0) {
      console.error(`⚠️  CRITICAL: Expected ${milestoneCount} milestones but fetched 0! Check dynamic field query format.`);
    }

    return milestones;
  }

  /**
   * Get job details by ID
   *
   * @param jobId Job object ID
   * @returns Job data or null if not found
   */
  async getJob(jobId: string): Promise<JobData | null> {
    try {
      const object = await this.suiClient.getObject({
        id: jobId,
        options: { showContent: true, showOwner: true },
      });

      if (!object.data) {
        return null;
      }

      const fields = getJobFields(object.data);
      if (!fields) {
        return null;
      }

      // Parse pending_freelancer_completion (Option<u64>)
      let pendingFreelancerCompletion: number | undefined;
      if (fields.pending_freelancer_completion !== null && fields.pending_freelancer_completion !== undefined) {
        pendingFreelancerCompletion = Number(fields.pending_freelancer_completion);
      }

      // Fetch milestones from the Table dynamic field
      const milestoneCount = Number(fields.milestone_count);
      const milestonesTableId = fields.milestones?.fields?.id?.id;
      let milestones: MilestoneData[] = [];

      if (milestonesTableId && milestoneCount > 0) {
        milestones = await this.getMilestones(milestonesTableId, milestoneCount);
      }

      const jobData: JobData = {
        objectId: jobId,
        client: fields.client,
        freelancer: fields.freelancer,
        title: vectorU8ToString(fields.title),
        descriptionBlobId: vectorU8ToString(fields.description_blob_id),
        budget: Number(fields.budget),
        state: fields.state as JobState,
        milestones,
        milestoneCount,
        applicants: fields.applicants || [],
        createdAt: Number(fields.created_at),
        deadline: Number(fields.deadline),
        deliverableBlobIds: fields.deliverable_blob_ids.map(vectorU8ToString),
        pendingFreelancerCompletion,
      };

      // Debug log to verify correct state is fetched
      console.log(`📋 Job ${jobId.slice(0, 8)}... state: ${JobState[jobData.state]} (${jobData.state})${pendingFreelancerCompletion !== undefined ? `, pending completion: ${pendingFreelancerCompletion}` : ''}`);

      return jobData;
    } catch (error) {
      console.error("Error fetching job:", error);
      return null;
    }
  }

  /**
   * Get all jobs posted by a client
   * Uses event-based indexing to discover jobs
   *
   * @param clientAddress Client's address
   * @returns Array of job data
   */
  async getJobsByClient(clientAddress: string): Promise<JobData[]> {
    try {
      console.log(`🔍 getJobsByClient: Fetching jobs for client ${clientAddress.slice(0, 8)}...`);

      // Use event indexer to query jobs by client
      const indexer = createJobEventIndexer(this.suiClient, this.packageId);
      const jobEvents = await indexer.queryJobsByClient(clientAddress);

      console.log(`📋 getJobsByClient: Found ${jobEvents.length} jobs from events`);

      // Fetch actual Job objects to get current state (events only show creation state)
      const jobs: JobData[] = [];
      for (const event of jobEvents) {
        try {
          const jobData = await this.getJob(event.jobId);
          if (jobData) {
            jobs.push(jobData);
            console.log(`✅ Job ${event.jobId.slice(0, 8)}... fetched with state: ${JobState[jobData.state]}`);
          } else {
            console.warn(`⚠️ Job ${event.jobId.slice(0, 8)}... not found, using event data`);
            // Fallback to event data if job object not found
            jobs.push({
              objectId: event.jobId,
              client: event.client,
              freelancer: event.freelancer || undefined,
              title: event.title,
              descriptionBlobId: event.descriptionBlobId,
              budget: event.budget,
              state: event.state,
              milestones: [],
              milestoneCount: event.milestoneCount,
              applicants: [],
              createdAt: event.timestamp,
              deadline: event.deadline,
              deliverableBlobIds: [],
            });
          }
        } catch (error) {
          console.error(`❌ Error fetching job ${event.jobId.slice(0, 8)}...:`, error);
          // Fallback to event data
          jobs.push({
            objectId: event.jobId,
            client: event.client,
            freelancer: event.freelancer || undefined,
            title: event.title,
            descriptionBlobId: event.descriptionBlobId,
            budget: event.budget,
            state: event.state,
            milestones: [],
            milestoneCount: event.milestoneCount,
            applicants: [],
            createdAt: event.timestamp,
            deadline: event.deadline,
            deliverableBlobIds: [],
          });
        }
      }

      console.log(`✅ getJobsByClient: Returning ${jobs.length} jobs`);
      return jobs;
    } catch (error) {
      console.error("Error fetching client jobs:", error);
      return [];
    }
  }

  /**
   * Get all jobs assigned to a freelancer
   * Uses event-based indexing via FreelancerAssigned events
   *
   * @param freelancerAddress Freelancer's address
   * @returns Array of job data
   */
  async getJobsByFreelancer(freelancerAddress: string): Promise<JobData[]> {
    try {
      // Use event indexer to get job IDs assigned to this freelancer
      const indexer = createJobEventIndexer(this.suiClient, this.packageId);
      const jobIds = await indexer.queryJobsByFreelancer(freelancerAddress);

      // Fetch full job details for each job ID
      const jobs: JobData[] = [];
      for (const jobId of jobIds) {
        const job = await this.getJob(jobId);
        if (job) {
          jobs.push(job);
        }
      }

      return jobs;
    } catch (error) {
      console.error("Error fetching freelancer jobs:", error);
      return [];
    }
  }

  /**
   * Get all open jobs (for marketplace)
   * Uses event-based indexing to discover jobs and filter by state
   *
   * @param limit Maximum number of jobs to return (default: 50)
   * @returns Array of open jobs
   */
  async getOpenJobs(limit: number = 50): Promise<JobData[]> {
    try {
      // Use event indexer to query open jobs
      const indexer = createJobEventIndexer(this.suiClient, this.packageId);
      const jobEvents = await indexer.queryOpenJobs(limit);

      // Convert event data to full JobData
      const jobs: JobData[] = jobEvents.map((event) => ({
        objectId: event.jobId,
        client: event.client,
        freelancer: event.freelancer || undefined,
        title: event.title,
        descriptionBlobId: event.descriptionBlobId,
        budget: event.budget,
        state: event.state,
        milestones: [],
        milestoneCount: event.milestoneCount,
        applicants: event.applicants || [], // Use applicants from verified job data
        createdAt: event.timestamp,
        deadline: event.deadline,
        deliverableBlobIds: [],
      }));

      return jobs;
    } catch (error) {
      console.error("Error fetching open jobs:", error);
      return [];
    }
  }

  /**
   * Get JobCap details
   *
   * TODO: Implement
   *
   * @param capId JobCap object ID
   * @returns JobCap data or null
   */
  async getJobCap(capId: string): Promise<JobCapData | null> {
    try {
      const object = await this.suiClient.getObject({
        id: capId,
        options: { showContent: true },
      });

      if (
        !object.data ||
        object.data.content?.dataType !== "moveObject"
      ) {
        return null;
      }

      const fields = object.data.content.fields as any;
      return {
        objectId: capId,
        jobId: fields.job_id,
      };
    } catch (error) {
      console.error("Error fetching JobCap:", error);
      return null;
    }
  }

  /**
   * Get all JobCaps owned by address
   *
   * TODO: Implement
   *
   * @param ownerAddress Owner's address
   * @returns Array of JobCap data
   */
  async getJobCapsByOwner(ownerAddress: string): Promise<JobCapData[]> {
    try {
      const objects = await this.suiClient.getOwnedObjects({
        owner: ownerAddress,
        options: { showContent: true, showType: true },
        filter: { StructType: `${this.packageId}::job_escrow::JobCap` },
      });

      const caps: JobCapData[] = [];
      for (const obj of objects.data) {
        if (obj.data?.content?.dataType === "moveObject") {
          const fields = obj.data.content.fields as any;
          caps.push({
            objectId: obj.data.objectId,
            jobId: fields.job_id,
          });
        }
      }

      return caps;
    } catch (error) {
      console.error("Error fetching JobCaps:", error);
      return [];
    }
  }

  // ======== Helper Methods ========

  /**
   * Wait for transaction and extract created Job and JobCap IDs
   *
   * Uses objectChanges which provides objectId and objectType directly
   *
   * @param digest Transaction digest
   * @returns Object with jobId and jobCapId
   */
  async waitForTransactionAndGetCreatedObjects(
    digest: string
  ): Promise<{
    jobId: string;
    jobCapId: string;
    jobSharedObjectRef: {
      objectId: string;
      initialSharedVersion: string;
      mutable: boolean;
    };
  } | null> {
    try {
      const result = await this.suiClient.waitForTransaction({
        digest,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      if (!result.objectChanges) {
        console.error("No objectChanges in transaction result");
        return null;
      }

      // Find Job object (shared)
      const jobChange = result.objectChanges.find(
        (change) =>
          change.type === "created" &&
          "objectType" in change &&
          change.objectType.endsWith("::job_escrow::Job")
      );

      // Find JobCap object (owned)
      const capChange = result.objectChanges.find(
        (change) =>
          change.type === "created" &&
          "objectType" in change &&
          change.objectType.includes("::job_escrow::JobCap")
      );

      if (
        !jobChange ||
        jobChange.type !== "created" ||
        !("objectId" in jobChange)
      ) {
        console.error("Could not find Job in objectChanges");
        return null;
      }

      // Extract the owner field from jobChange to get initial shared version
      console.log("🔍 DEBUG: Full jobChange object:", JSON.stringify(jobChange, null, 2));

      if (!("owner" in jobChange)) {
        console.error("❌ Job object change missing owner field");
        console.error("Available fields:", Object.keys(jobChange));
        return null;
      }

      const owner = jobChange.owner;
      console.log("🔍 DEBUG: Owner field value:", JSON.stringify(owner, null, 2));
      console.log("🔍 DEBUG: Owner type:", typeof owner);
      console.log("🔍 DEBUG: Owner is null?:", owner === null);
      if (typeof owner === "object" && owner !== null) {
        console.log("🔍 DEBUG: Owner keys:", Object.keys(owner));
        console.log("🔍 DEBUG: Has 'Shared' key?:", "Shared" in owner);
      }

      // Extract initial shared version with proper type handling
      let initialSharedVersion: string | null = null;

      if (!owner) {
        console.error("❌ Owner is null or undefined");
      } else if (typeof owner === "string") {
        // Owner is string literal like 'Immutable'
        console.error("❌ Owner is string literal (not shared):", owner);
      } else if (typeof owner === "object") {
        // Owner is object - check which variant
        if ("Shared" in owner && owner.Shared && typeof owner.Shared === "object") {
          const sharedObj = owner.Shared as { initial_shared_version: string };
          initialSharedVersion = sharedObj.initial_shared_version;
          console.log("✅ Extracted initialSharedVersion from objectChanges:", initialSharedVersion);
        } else if ("AddressOwner" in owner) {
          console.error("❌ Job has AddressOwner (should be Shared):", owner.AddressOwner);
        } else if ("ObjectOwner" in owner) {
          console.error("❌ Job has ObjectOwner (should be Shared):", owner.ObjectOwner);
        } else if ("ConsensusAddressOwner" in owner) {
          console.error("❌ Job has ConsensusAddressOwner (should be Shared)");
        } else {
          console.error("❌ Unknown owner structure:", owner);
        }
      } else {
        console.error("❌ Unexpected owner type:", typeof owner);
      }

      // Fallback: Query the object if we couldn't extract from objectChanges
      if (!initialSharedVersion) {
        console.warn("⚠️  Could not extract initialSharedVersion from objectChanges");
        console.warn("⚠️  Attempting fallback: querying object directly...");

        try {
          const jobObject = await this.suiClient.getObject({
            id: jobChange.objectId,
            options: { showOwner: true }
          });

          console.log("🔍 DEBUG: Queried job object:", JSON.stringify(jobObject, null, 2));

          if (jobObject.data?.owner && typeof jobObject.data.owner === "object") {
            const queriedOwner = jobObject.data.owner;
            if ("Shared" in queriedOwner && queriedOwner.Shared) {
              const sharedObj = queriedOwner.Shared as { initial_shared_version: string };
              initialSharedVersion = sharedObj.initial_shared_version;
              console.log("✅ Extracted initialSharedVersion from object query:", initialSharedVersion);
            }
          }
        } catch (queryError) {
          console.error("❌ Failed to query job object:", queryError);
        }

        // If still no version after fallback, this is critical
        if (!initialSharedVersion) {
          console.error("❌ CRITICAL: Cannot determine initialSharedVersion for Job object");
          console.error("❌ Job creation succeeded but milestone addition will fail");
          console.error("❌ Returning null to trigger error handling in caller");
          return null;
        }
      }


      if (
        !capChange ||
        capChange.type !== "created" ||
        !("objectId" in capChange)
      ) {
        console.error("Could not find JobCap in objectChanges");
        return null;
      }

      return {
        jobId: jobChange.objectId,
        jobCapId: capChange.objectId,
        jobSharedObjectRef: {
          objectId: jobChange.objectId,
          initialSharedVersion: initialSharedVersion,
          mutable: true,
        },
      };
    } catch (error) {
      console.error("Error waiting for transaction:", error);
      return null;
    }
  }

  /**
   * Get initial shared version for a shared object by querying it.
   * This is a utility method that can be used when objectChanges don't
   * provide the information or as a fallback.
   *
   * @param objectId Object ID of the shared object
   * @returns Initial shared version string or null if object is not shared
   */
  async getInitialSharedVersion(objectId: string): Promise<string | null> {
    try {
      const object = await this.suiClient.getObject({
        id: objectId,
        options: { showOwner: true }
      });

      if (!object.data?.owner) {
        console.error("Object has no owner information");
        return null;
      }

      const owner = object.data.owner;

      if (typeof owner === "object" && owner !== null && "Shared" in owner) {
        const sharedObj = owner.Shared as { initial_shared_version: string };
        return sharedObj.initial_shared_version;
      }

      console.error("Object is not a shared object, owner:", owner);
      return null;
    } catch (error) {
      console.error("Error getting initial shared version:", error);
      return null;
    }
  }

  /**
   * Wait for transaction completion
   *
   * @param digest Transaction digest
   */
  async waitForTransaction(digest: string): Promise<void> {
    await this.suiClient.waitForTransaction({ digest });
  }

  /**
   * Get job state as human-readable string
   *
   * @param state Job state enum value
   * @returns State name
   */
  getJobStateName(state: JobState): string {
    return JobState[state] || "UNKNOWN";
  }
}

/**
 * Factory function to create JobService instance
 *
 * @param suiClient Sui client instance
 * @param packageId Job escrow package ID
 * @returns JobService instance
 */
export function createJobService(
  suiClient: SuiClient,
  packageId: string
): JobService {
  return new JobService(suiClient, packageId);
}
