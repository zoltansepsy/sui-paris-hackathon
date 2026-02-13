/**
 * Profile NFT Service
 * Handles profile creation, updates, and reputation management
 *
 * DEV 2 TODO:
 * 1. Implement all transaction builder methods
 * 2. Add query methods for profile discovery
 * 3. Implement profile field parsing
 * 4. Add rating calculation helpers
 * 5. Test profile updates and reputation tracking
 * 6. Add comprehensive error handling
 */

import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import {
  ProfileData,
  ProfileCapData,
  ProfileType,
  getProfileFields,
} from "./types";

export class ProfileService {
  private suiClient: SuiClient;
  private packageId: string;

  constructor(suiClient: SuiClient, packageId: string) {
    this.suiClient = suiClient;
    this.packageId = packageId;
  }

  // ======== Transaction Builders ========

  /**
   * Create a new profile
   *
   * TODO: Implement
   *
   * @param profileType FREELANCER or CLIENT
   * @param username Display name
   * @param realName Real name (optional)
   * @param bio Profile bio
   * @param tags Skills (freelancer) or industries (client)
   * @param avatarUrl Avatar URL or Walrus blob ID
   * @returns Transaction to sign and execute
   */
  createProfileTransaction(
    profileType: ProfileType,
    zkloginSub: string,
    email: string,
    username: string,
    realName: string,
    bio: string,
    tags: string[],
    avatarUrl: string,
    registryId: string
  ): Transaction {
    const tx = new Transaction();

    // Encode tags as vector<vector<u8>> using BCS
    const encodedTags = tags.map((tag) =>
      Array.from(new TextEncoder().encode(tag))
    );
    const serializedTags = bcs.vector(bcs.vector(bcs.u8())).serialize(encodedTags);

    tx.moveCall({
      arguments: [
        tx.object(registryId), // IdentityRegistry shared object
        tx.pure.u8(profileType),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(zkloginSub))),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(email))),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(username))),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(realName))),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(bio))),
        tx.pure(serializedTags),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(avatarUrl))),
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::profile_nft::create_profile`,
    });

    return tx;
  }

  /**
   * Update profile information
   *
   * TODO: Implement
   * - Handle optional fields (pass None if not updating)
   *
   * @param profileId Profile object ID
   * @param profileCapId ProfileCap object ID
   * @param updates Object with optional fields to update
   * @returns Transaction to sign and execute
   */
  updateProfileTransaction(
    profileId: string,
    profileCapId: string,
    updates: {
      username?: string;
      realName?: string;
      bio?: string;
      tags?: string[];
      avatarUrl?: string;
    }
  ): Transaction {
    const tx = new Transaction();

    // Helper to create Option<vector<u8>> for string fields
    const encodeOptionalString = (value: string | undefined) => {
      if (value !== undefined) {
        return tx.pure.option(
          "vector<u8>",
          Array.from(new TextEncoder().encode(value))
        );
      }
      return tx.pure.option("vector<u8>", null);
    };

    // Helper to create Option<vector<vector<u8>>> for tags
    const encodeOptionalTags = (tags: string[] | undefined) => {
      if (tags !== undefined) {
        const encodedTags = tags.map((tag) =>
          Array.from(new TextEncoder().encode(tag))
        );
        return tx.pure.option("vector<vector<u8>>", encodedTags);
      }
      return tx.pure.option("vector<vector<u8>>", null);
    };

    tx.moveCall({
      arguments: [
        tx.object(profileId),
        tx.object(profileCapId),
        encodeOptionalString(updates.username),
        encodeOptionalString(updates.realName),
        encodeOptionalString(updates.bio),
        encodeOptionalTags(updates.tags),
        encodeOptionalString(updates.avatarUrl),
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::profile_nft::update_profile_info`,
    });

    return tx;
  }

  /**
   * Update profile type (switch between Freelancer and Client)
   *
   * NOTE: This will fail if the profile has active jobs.
   * The smart contract enforces this to prevent orphaned jobs.
   *
   * @param profileId Profile object ID
   * @param profileCapId ProfileCap object ID
   * @param newProfileType New profile type (0 = Freelancer, 1 = Client)
   * @returns Transaction to sign and execute
   */
  updateProfileTypeTransaction(
    profileId: string,
    profileCapId: string,
    newProfileType: ProfileType
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      arguments: [
        tx.object(profileId),
        tx.object(profileCapId),
        tx.pure.u8(newProfileType),
        tx.object("0x6"), // Clock
      ],
      target: `${this.packageId}::profile_nft::update_profile_type`,
    });

    return tx;
  }

  // ======== Query Methods ========

  /**
   * Get profile details by ID
   *
   * TODO: Implement
   * - Fetch profile object
   * - Parse all fields
   * - Handle dynamic fields (active_jobs)
   *
   * @param profileId Profile object ID
   * @returns Profile data or null
   */
  async getProfile(profileId: string): Promise<ProfileData | null> {
    try {
      const object = await this.suiClient.getObject({
        id: profileId,
        options: { showContent: true, showOwner: true },
      });

      if (!object.data) {
        return null;
      }

      const fields = getProfileFields(object.data);
      if (!fields) {
        return null;
      }

      // TODO: Parse all fields correctly
      return {
        objectId: profileId,
        owner: fields.owner,
        profileType: fields.profile_type as ProfileType,
        username: fields.username,
        realName: fields.real_name,
        bio: fields.bio,
        tags: fields.tags || [],
        avatarUrl: fields.avatar_url,
        createdAt: Number(fields.created_at),
        updatedAt: Number(fields.updated_at),
        completedJobs: Number(fields.completed_jobs),
        totalJobs: Number(fields.total_jobs),
        rating: Number(fields.rating),
        ratingCount: Number(fields.rating_count),
        totalAmount: Number(fields.total_amount),
        verified: fields.verified,
        activeJobsCount: fields.active_jobs?.contents?.length || 0,
      };
    } catch (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
  }

  /**
   * Get profile by owner address
   *
   * TODO: Implement
   * - Query owned objects with Profile type filter
   * - Should return single profile (users have one profile)
   *
   * @param ownerAddress Owner's address
   * @returns Profile data or null
   */
  async getProfileByOwner(ownerAddress: string): Promise<ProfileData | null> {
    try {
      const objects = await this.suiClient.getOwnedObjects({
        owner: ownerAddress,
        options: { showContent: true, showType: true },
        filter: { StructType: `${this.packageId}::profile_nft::Profile` },
      });

      if (objects.data.length === 0) {
        return null;
      }

      // Return first profile (should only be one)
      const profileId = objects.data[0].data?.objectId;
      if (!profileId) {
        return null;
      }

      return this.getProfile(profileId);
    } catch (error) {
      console.error("Error fetching profile by owner:", error);
      return null;
    }
  }

  /**
   * Check if a profile exists for a zkLogin sub
   * Queries the IdentityRegistry shared object to find profile by OAuth subject ID
   *
   * @param registryId IdentityRegistry shared object ID
   * @param zkloginSub OAuth subject ID from JWT
   * @returns Profile ID if exists, null otherwise
   */
  async getProfileIdByZkLoginSub(
    registryId: string,
    zkloginSub: string
  ): Promise<string | null> {
    try {
      // Get the IdentityRegistry object
      const registry = await this.suiClient.getObject({
        id: registryId,
        options: { showContent: true },
      });

      if (
        !registry.data ||
        registry.data.content?.dataType !== "moveObject"
      ) {
        console.error("IdentityRegistry not found or invalid");
        return null;
      }

      const fields = registry.data.content.fields as any;
      const tableField = fields.zklogin_to_profile;

      if (!tableField || !tableField.fields || !tableField.fields.id) {
        console.error("Invalid table structure in IdentityRegistry");
        return null;
      }

      const tableId = tableField.fields.id.id;

      // Query the dynamic field for this zkLogin sub
      // Dynamic field name for Table<String, ID> is the key itself (zkloginSub)
      try {
        const dynamicField = await this.suiClient.getDynamicFieldObject({
          parentId: tableId,
          name: {
            type: "0x1::string::String",
            value: zkloginSub,
          },
        });

        if (dynamicField.data?.content?.dataType === "moveObject") {
          const dfFields = dynamicField.data.content.fields as any;
          // The value field contains the Profile ID
          return dfFields.value || null;
        }
      } catch (dfError: any) {
        // Dynamic field not found means profile doesn't exist
        if (dfError.message?.includes("not found") || dfError.code === -32602) {
          console.log("No profile found for zkLogin sub:", zkloginSub);
          return null;
        }
        throw dfError;
      }

      return null;
    } catch (error) {
      console.error("Error checking zkLogin profile:", error);
      return null;
    }
  }

  /**
   * Get ProfileCap details
   *
   * TODO: Implement
   *
   * @param capId ProfileCap object ID
   * @returns ProfileCap data or null
   */
  async getProfileCap(capId: string): Promise<ProfileCapData | null> {
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
        profileId: fields.profile_id,
      };
    } catch (error) {
      console.error("Error fetching ProfileCap:", error);
      return null;
    }
  }

  /**
   * Get all ProfileCaps owned by address
   *
   * TODO: Implement
   *
   * @param ownerAddress Owner's address
   * @returns Array of ProfileCap data
   */
  async getProfileCapsByOwner(
    ownerAddress: string
  ): Promise<ProfileCapData[]> {
    try {
      const objects = await this.suiClient.getOwnedObjects({
        owner: ownerAddress,
        options: { showContent: true, showType: true },
        filter: { StructType: `${this.packageId}::profile_nft::ProfileCap` },
      });

      const caps: ProfileCapData[] = [];
      for (const obj of objects.data) {
        if (obj.data?.content?.dataType === "moveObject") {
          const fields = obj.data.content.fields as any;
          caps.push({
            objectId: obj.data.objectId,
            profileId: fields.profile_id,
          });
        }
      }

      return caps;
    } catch (error) {
      console.error("Error fetching ProfileCaps:", error);
      return [];
    }
  }

  /**
   * Get top freelancers by rating
   *
   * TODO: Implement
   * - Use event-based indexing or full scan
   * - Sort by rating and rating_count
   *
   * @param limit Number of profiles to return
   * @returns Array of top-rated profiles
   */
  async getTopFreelancers(limit: number = 10): Promise<ProfileData[]> {
    try {
      // TODO: Implement
      // This requires indexing or full scan
      // Consider using events or external indexer

      return [];
    } catch (error) {
      console.error("Error fetching top freelancers:", error);
      return [];
    }
  }

  // ======== Helper Methods ========

  /**
   * Wait for transaction and extract created Profile and ProfileCap IDs
   *
   * TODO: Implement
   *
   * @param digest Transaction digest
   * @returns Object with profileId and profileCapId
   */
  async waitForTransactionAndGetCreatedObjects(
    digest: string
  ): Promise<{ profileId: string; profileCapId: string } | null> {
    try {
      const result = await this.suiClient.waitForTransaction({
        digest,
        options: { showEffects: true, showObjectChanges: true },
      });

      if (!result.objectChanges) {
        return null;
      }

      // Find Profile object
      const profileObject = result.objectChanges.find(
        (change) =>
          change.type === "created" &&
          "objectType" in change &&
          change.objectType.includes("::profile_nft::Profile")
      );

      // Find ProfileCap object
      const capObject = result.objectChanges.find(
        (change) =>
          change.type === "created" &&
          "objectType" in change &&
          change.objectType.includes("::profile_nft::ProfileCap")
      );

      if (
        !profileObject ||
        profileObject.type !== "created" ||
        !("objectId" in profileObject)
      ) {
        return null;
      }

      if (
        !capObject ||
        capObject.type !== "created" ||
        !("objectId" in capObject)
      ) {
        return null;
      }

      return {
        profileId: profileObject.objectId,
        profileCapId: capObject.objectId,
      };
    } catch (error) {
      console.error("Error waiting for transaction:", error);
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
   * Format rating for display (e.g., 450 -> "4.5")
   *
   * @param rating Rating value (scaled by 100)
   * @returns Formatted rating string
   */
  formatRating(rating: number): string {
    return (rating / 100).toFixed(2);
  }

  /**
   * Get profile type as human-readable string
   *
   * @param profileType Profile type enum value
   * @returns Profile type name
   */
  getProfileTypeName(profileType: ProfileType): string {
    return profileType === ProfileType.FREELANCER ? "Freelancer" : "Client";
  }

  /**
   * Check if profile type can be changed
   * Profile type cannot be changed if there are active jobs
   *
   * @param profile Profile data
   * @returns true if type can be changed, false otherwise
   */
  canChangeProfileType(profile: ProfileData): boolean {
    return profile.activeJobsCount === 0;
  }

  /**
   * Get reason why profile type cannot be changed
   *
   * @param profile Profile data
   * @returns Human-readable reason or null if change is allowed
   */
  getProfileTypeChangeBlockReason(profile: ProfileData): string | null {
    if (profile.activeJobsCount > 0) {
      return `You have ${profile.activeJobsCount} active job(s). Complete or cancel them before changing your account type.`;
    }
    return null;
  }

  /**
   * Calculate rating percentage (for display)
   *
   * @param rating Rating value (scaled by 100)
   * @returns Percentage (0-100)
   */
  getRatingPercentage(rating: number): number {
    return (rating / 500) * 100; // Max rating is 500 (5.0 stars)
  }
}

/**
 * Factory function to create ProfileService instance
 *
 * @param suiClient Sui client instance
 * @param packageId Profile NFT package ID
 * @returns ProfileService instance
 */
export function createProfileService(
  suiClient: SuiClient,
  packageId: string
): ProfileService {
  return new ProfileService(suiClient, packageId);
}
