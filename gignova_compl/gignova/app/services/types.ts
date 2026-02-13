import type { SuiObjectData } from "@mysten/sui/client";

/**
 * Walrus storage response
 */
export interface WalrusUploadResponse {
  blobId: string;
  url: string;
  size: number;
}

/**
 * Walrus configuration
 */
export interface WalrusConfig {
  publisherUrl: string;
  aggregatorUrl: string;
  epochs?: number;
}

// ======== Job Escrow Types ========

/**
 * Job states enum
 */
export enum JobState {
  OPEN = 0,
  ASSIGNED = 1,
  IN_PROGRESS = 2,
  SUBMITTED = 3,
  AWAITING_REVIEW = 4,
  COMPLETED = 5,
  CANCELLED = 6,
  DISPUTED = 7,
}

/**
 * Milestone data structure
 */
export interface MilestoneData {
  id: number;
  description: string;
  amount: number;
  completed: boolean;
  approved: boolean;
  /** Encrypted blob ID on Walrus */
  submissionBlobId?: string;
  /** Preview URL for client to review before approval */
  previewUrl?: string;
  /** DeliverableEscrow object ID (holds the whitelist Cap) */
  deliverableEscrowId?: string;
  /** Whitelist object ID for Seal decryption */
  whitelistId?: string;
  /** Encryption nonce for Seal decryption */
  nonce?: string;
  /** Original file name for display */
  originalFileName?: string;
  submittedAt?: number;
  approvedAt?: number;
}

/**
 * Job data from blockchain
 */
export interface JobData {
  objectId: string;
  client: string;
  freelancer?: string;
  title: string;
  descriptionBlobId: string;
  budget: number;
  state: JobState;
  milestones: MilestoneData[];
  milestoneCount: number;
  applicants: string[];
  createdAt: number;
  deadline: number;
  deliverableBlobIds: string[];
  /**
   * Pending freelancer completion amount (Option<u64> from contract).
   * Set when client approves final milestone, cleared when freelancer claims.
   * If set, freelancer needs to call claim_job_completion to update their profile.
   */
  pendingFreelancerCompletion?: number;
}

/**
 * Job fields as stored on-chain
 */
export interface JobFields {
  client: string;
  freelancer?: string;
  title: number[]; // vector<u8>
  description_blob_id: number[]; // vector<u8>
  budget: string;
  state: number;
  milestones: { fields: { id: { id: string } } }; // Table<u64, Milestone>
  milestone_count: string;
  applicants: string[];
  created_at: string;
  deadline: string;
  deliverable_blob_ids: number[][];
  pending_freelancer_completion?: string | null; // Option<u64>
}

/**
 * JobCap data
 */
export interface JobCapData {
  objectId: string;
  jobId: string;
}

/**
 * Extract job fields from Sui object data
 */
export function getJobFields(data: SuiObjectData): JobFields | null {
  if (data.content?.dataType !== "moveObject") {
    return null;
  }
  return data.content.fields as unknown as JobFields;
}

/**
 * Convert vector<u8> to string
 */
export function vectorU8ToString(vec: number[]): string {
  return new TextDecoder().decode(new Uint8Array(vec));
}

// ======== Profile NFT Types ========

/**
 * Profile types enum
 */
export enum ProfileType {
  FREELANCER = 0,
  CLIENT = 1,
}

/**
 * Profile data from blockchain
 */
export interface ProfileData {
  objectId: string;
  owner: string;
  profileType: ProfileType;
  username: string;
  realName: string;
  bio: string;
  tags: string[];
  avatarUrl: string;
  createdAt: number;
  updatedAt: number;
  completedJobs: number;
  totalJobs: number;
  rating: number; // Scaled by 100 (e.g., 450 = 4.50 stars)
  ratingCount: number;
  totalAmount: number;
  verified: boolean;
  activeJobsCount: number;
}

/**
 * Profile fields as stored on-chain
 */
export interface ProfileFields {
  owner: string;
  profile_type: number;
  username: string;
  real_name: string;
  bio: string;
  tags: string[];
  avatar_url: string;
  created_at: string;
  updated_at: string;
  completed_jobs: string;
  total_jobs: string;
  rating: string;
  rating_count: string;
  total_amount: string;
  verified: boolean;
  active_jobs: { contents: Array<{ key: string }> };
}

/**
 * ProfileCap data
 */
export interface ProfileCapData {
  objectId: string;
  profileId: string;
}

/**
 * Extract profile fields from Sui object data
 */
export function getProfileFields(data: SuiObjectData): ProfileFields | null {
  if (data.content?.dataType !== "moveObject") {
    return null;
  }
  return data.content.fields as unknown as ProfileFields;
}

// ======== Reputation Types ========

/**
 * Badge tiers enum
 */
export enum BadgeTier {
  NONE = 0,
  BRONZE = 1,
  SILVER = 2,
  GOLD = 3,
  PLATINUM = 4,
}

/**
 * Rating data
 */
export interface RatingData {
  objectId: string;
  jobId: string;
  rater: string;
  ratee: string;
  rating: number; // Scaled by 10 (e.g., 45 = 4.5 stars)
  review: string;
  createdAt: number;
  disputed: boolean;
}

/**
 * Badge data
 */
export interface BadgeData {
  objectId: string;
  owner: string;
  tier: BadgeTier;
  name: string;
  description: string;
  iconUrl: string;
  awardedAt: number;
}

// ======== Whitelist Types (existing, add for completeness) ========

/**
 * Cap data for whitelist
 */
export interface CapData {
  objectId: string;
  whitelistId: string;
}

/**
 * Whitelist data
 */
export interface WhitelistData {
  objectId: string;
  version: number;
  addresses: string[];
}
