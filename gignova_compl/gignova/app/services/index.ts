/**
 * Service Layer
 *
 * This module exports all blockchain and storage services.
 * Services handle all external API calls and blockchain interactions,
 * keeping components clean and focused on UI logic.
 */

// Storage services
export {
  WalrusService,
  createWalrusService,
  type WalrusConfig,
} from "./walrusServiceSDK";

// Encryption services
export { SealService, createSealService, SEAL_TESTNET_SERVERS } from "./sealService";
export {
  WhitelistService,
  createWhitelistService,
  type WhitelistData,
  type CapData,
} from "./whitelistService";

// Freelance platform services
export { JobService, createJobService } from "./jobService";
export { JobEventIndexer, createJobEventIndexer } from "./jobEventIndexer";
export { ProfileService, createProfileService } from "./profileService";
export { ReputationService, createReputationService } from "./reputationService";

// Types
export { getJobFields, getProfileFields, vectorU8ToString } from "./types";

// Enums (must be exported as values, not types)
export { JobState, ProfileType, BadgeTier } from "./types";

// Type-only exports
export type {
  JobData,
  JobCapData,
  MilestoneData,
  ProfileData,
  ProfileCapData,
  RatingData,
  BadgeData,
} from "./types";
export type {
  JobEventData,
  JobEventQueryResult,
  JobCreatedEvent,
  JobStateChangedEvent,
  FreelancerAssignedEvent,
} from "./jobEventIndexer";
