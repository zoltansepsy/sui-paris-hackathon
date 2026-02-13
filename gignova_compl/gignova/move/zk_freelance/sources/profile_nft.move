/// Profile NFT Module
/// Dynamic NFTs for freelancers and clients with reputation tracking
/// NOW WITH zkLogin SUPPORT for email-based authentication
///
/// IMPLEMENTED:
/// ✓ Profile creation with type enum (Freelancer/Client)
/// ✓ zkLogin integration with OAuth subject ID and email
/// ✓ Identity Registry for profile lookup by zklogin_sub
/// ✓ Profile information updates with capability checks
/// ✓ Dynamic reputation system with weighted average ratings
/// ✓ Job completion tracking and statistics
/// ✓ Active job management with VecSet
/// ✓ Verification status system
///
/// zkLogin Features:
/// - Profiles persist across zkLogin sessions using OAuth subject ID
/// - zkLogin addresses are deterministic and permanent (derived from OAuth sub + iss + aud + salt)
/// - No ownership transfer needed - users get the same zkLogin address each session
/// - Email-based profile lookup and verification
/// - One profile per zklogin_sub (prevents duplicates)
///
/// TODO for Future:
/// - Add admin capability for verification function
/// - Add profile deletion/deactivation
/// - Add email update function with verification
/// - Consider account recovery mechanism for edge cases (lost salt, wallet migration)

module zk_freelance::profile_nft {
    use std::string::{Self, String};
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::vec_set::{Self, VecSet};
    use sui::table::{Self, Table};

    // ======== Constants ========

    /// Profile types
    const PROFILE_TYPE_FREELANCER: u8 = 0;
    const PROFILE_TYPE_CLIENT: u8 = 1;

    /// Error codes
    const EInvalidProfileType: u64 = 0;
    const ENotProfileOwner: u64 = 1;
    #[allow(unused_const)]
    const EProfileAlreadyExists: u64 = 2;
    const EInvalidRating: u64 = 3;
    #[allow(unused_const)]
    const EInvalidUpdate: u64 = 4;
    const EZkLoginSubAlreadyRegistered: u64 = 5;
    const ECannotChangeTypeWithActiveJobs: u64 = 6;

    // ======== Structs ========

    /// Profile NFT - owned by user
    public struct Profile has key, store {
        id: UID,
        /// Owner address (persistent zkLogin address derived from OAuth credentials)
        owner: address,
        /// zkLogin OAuth subject ID (stable OAuth identifier - never changes)
        zklogin_sub: String,
        /// User's email address
        email: String,
        /// Profile type (Freelancer or Client)
        profile_type: u8,
        /// Username (display name)
        username: String,
        /// Real name (optional, can be empty)
        real_name: String,
        /// Bio / description
        bio: String,
        /// Skills (for freelancers) or Industry (for clients)
        tags: vector<String>,
        /// Profile picture URL (could be Walrus blob ID)
        avatar_url: String,
        /// Creation timestamp
        created_at: u64,
        /// Last updated timestamp
        updated_at: u64,
        /// Completed jobs count
        completed_jobs: u64,
        /// Jobs posted (for clients) or applied to (for freelancers)
        total_jobs: u64,
        /// Average rating (scaled by 100, e.g., 450 = 4.50 stars)
        rating: u64,
        /// Number of ratings received
        rating_count: u64,
        /// Total amount earned (freelancers) or spent (clients)
        total_amount: u64,
        /// Verification status
        verified: bool,
        /// Active job IDs
        active_jobs: VecSet<ID>,
    }

    /// Capability for profile owner to update profile
    public struct ProfileCap has key, store {
        id: UID,
        profile_id: ID,
    }

    /// Identity Registry - maps zkLogin subject IDs to Profile IDs
    /// Shared object for global profile lookup
    public struct IdentityRegistry has key {
        id: UID,
        /// Mapping from zklogin_sub to Profile ID
        zklogin_to_profile: Table<String, ID>,
    }

    // ======== Events ========

    public struct ProfileCreated has copy, drop {
        profile_id: ID,
        owner: address,
        profile_type: u8,
        username: String,
        timestamp: u64,
    }

    public struct ProfileUpdated has copy, drop {
        profile_id: ID,
        field: String,
        timestamp: u64,
    }

    public struct ReputationUpdated has copy, drop {
        profile_id: ID,
        new_rating: u64,
        rating_count: u64,
        timestamp: u64,
    }

    public struct JobCompleted has copy, drop {
        profile_id: ID,
        job_id: ID,
        amount: u64,
        timestamp: u64,
    }

    public struct ProfileTypeChanged has copy, drop {
        profile_id: ID,
        old_type: u8,
        new_type: u8,
        timestamp: u64,
    }

    // ======== Init Function ========

    /// Initialize the Identity Registry (one-time setup)
    fun init(ctx: &mut TxContext) {
        let registry = IdentityRegistry {
            id: object::new(ctx),
            zklogin_to_profile: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    // ======== Public Functions ========

    /// Create a new profile
    ///
    /// Validates profile type and creates Profile NFT with ProfileCap
    /// Registers profile in IdentityRegistry with zkLogin subject ID
    #[allow(lint(self_transfer))]
    public fun create_profile(
        registry: &mut IdentityRegistry,
        profile_type: u8,
        zklogin_sub: vector<u8>,
        email: vector<u8>,
        username: vector<u8>,
        real_name: vector<u8>,
        bio: vector<u8>,
        tags: vector<vector<u8>>,
        avatar_url: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Validate profile type
        assert!(
            profile_type == PROFILE_TYPE_FREELANCER || profile_type == PROFILE_TYPE_CLIENT,
            EInvalidProfileType
        );

        // Convert zklogin_sub to String for lookup
        let zklogin_sub_str = string::utf8(zklogin_sub);

        // Check if zklogin_sub already has a profile
        assert!(
            !table::contains(&registry.zklogin_to_profile, zklogin_sub_str),
            EZkLoginSubAlreadyRegistered
        );

        let sender = ctx.sender();
        let timestamp = clock::timestamp_ms(clock);

        // Convert vector<u8> tags to vector<String>
        let mut string_tags = vector::empty<String>();
        let mut i = 0;
        let tags_len = vector::length(&tags);
        while (i < tags_len) {
            let tag = vector::borrow(&tags, i);
            vector::push_back(&mut string_tags, string::utf8(*tag));
            i = i + 1;
        };

        // Create Profile NFT
        let profile_uid = object::new(ctx);
        let profile_id = object::uid_to_inner(&profile_uid);

        let profile = Profile {
            id: profile_uid,
            owner: sender,
            zklogin_sub: zklogin_sub_str,
            email: string::utf8(email),
            profile_type,
            username: string::utf8(username),
            real_name: string::utf8(real_name),
            bio: string::utf8(bio),
            tags: string_tags,
            avatar_url: string::utf8(avatar_url),
            created_at: timestamp,
            updated_at: timestamp,
            completed_jobs: 0,
            total_jobs: 0,
            rating: 0,
            rating_count: 0,
            total_amount: 0,
            verified: false,
            active_jobs: vec_set::empty(),
        };

        // Register profile in identity registry
        table::add(&mut registry.zklogin_to_profile, zklogin_sub_str, profile_id);

        // Create ProfileCap
        let cap = ProfileCap {
            id: object::new(ctx),
            profile_id,
        };

        // Emit event
        event::emit(ProfileCreated {
            profile_id,
            owner: sender,
            profile_type,
            username: profile.username,
            timestamp,
        });

        // Transfer to sender
        transfer::transfer(profile, sender);
        transfer::transfer(cap, sender);
    }

    /// Update profile information (owner only)
    ///
    /// Updates profile fields and emits events for each change
    public fun update_profile_info(
        profile: &mut Profile,
        cap: &ProfileCap,
        mut username: Option<vector<u8>>,
        mut real_name: Option<vector<u8>>,
        mut bio: Option<vector<u8>>,
        mut tags: Option<vector<vector<u8>>>,
        mut avatar_url: Option<vector<u8>>,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        // Verify cap ownership
        verify_cap(profile, cap);

        let timestamp = clock::timestamp_ms(clock);
        profile.updated_at = timestamp;

        // Update username if provided
        if (option::is_some(&username)) {
            let username_val = option::extract(&mut username);
            profile.username = string::utf8(username_val);
            event::emit(ProfileUpdated {
                profile_id: object::id(profile),
                field: string::utf8(b"username"),
                timestamp,
            });
        };

        // Update real_name if provided
        if (option::is_some(&real_name)) {
            let real_name_val = option::extract(&mut real_name);
            profile.real_name = string::utf8(real_name_val);
            event::emit(ProfileUpdated {
                profile_id: object::id(profile),
                field: string::utf8(b"real_name"),
                timestamp,
            });
        };

        // Update bio if provided
        if (option::is_some(&bio)) {
            let bio_val = option::extract(&mut bio);
            profile.bio = string::utf8(bio_val);
            event::emit(ProfileUpdated {
                profile_id: object::id(profile),
                field: string::utf8(b"bio"),
                timestamp,
            });
        };

        // Update tags if provided
        if (option::is_some(&tags)) {
            let tags_val = option::extract(&mut tags);
            let mut string_tags = vector::empty<String>();
            let mut i = 0;
            let tags_len = vector::length(&tags_val);
            while (i < tags_len) {
                let tag = vector::borrow(&tags_val, i);
                vector::push_back(&mut string_tags, string::utf8(*tag));
                i = i + 1;
            };
            profile.tags = string_tags;
            event::emit(ProfileUpdated {
                profile_id: object::id(profile),
                field: string::utf8(b"tags"),
                timestamp,
            });
        };

        // Update avatar_url if provided
        if (option::is_some(&avatar_url)) {
            let avatar_url_val = option::extract(&mut avatar_url);
            profile.avatar_url = string::utf8(avatar_url_val);
            event::emit(ProfileUpdated {
                profile_id: object::id(profile),
                field: string::utf8(b"avatar_url"),
                timestamp,
            });
        };
    }

    /// Update profile type (switch between Freelancer and Client)
    ///
    /// Requirements:
    /// - Must own ProfileCap for this profile
    /// - Cannot change type if active_jobs is not empty
    /// - New type must be valid (0 or 1)
    public fun update_profile_type(
        profile: &mut Profile,
        cap: &ProfileCap,
        new_profile_type: u8,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        // Verify cap ownership
        verify_cap(profile, cap);

        // Validate new profile type
        assert!(
            new_profile_type == PROFILE_TYPE_FREELANCER || new_profile_type == PROFILE_TYPE_CLIENT,
            EInvalidProfileType
        );

        // Block change if there are active jobs
        assert!(
            vec_set::is_empty(&profile.active_jobs),
            ECannotChangeTypeWithActiveJobs
        );

        let old_type = profile.profile_type;
        let timestamp = clock::timestamp_ms(clock);

        // Only update and emit event if actually changing
        if (old_type != new_profile_type) {
            profile.profile_type = new_profile_type;
            profile.updated_at = timestamp;

            // Emit event
            event::emit(ProfileTypeChanged {
                profile_id: object::id(profile),
                old_type,
                new_type: new_profile_type,
                timestamp,
            });
        }
    }

    /// Get profile ID by zkLogin subject (returns none if not found)
    public fun get_profile_by_zklogin_sub(
        registry: &IdentityRegistry,
        zklogin_sub: String
    ): Option<ID> {
        if (table::contains(&registry.zklogin_to_profile, zklogin_sub)) {
            option::some(*table::borrow(&registry.zklogin_to_profile, zklogin_sub))
        } else {
            option::none()
        }
    }

    /// Check if a zklogin_sub already has a profile registered
    public fun has_profile(
        registry: &IdentityRegistry,
        zklogin_sub: String
    ): bool {
        table::contains(&registry.zklogin_to_profile, zklogin_sub)
    }

    /// Add rating to profile (called by job_escrow module)
    ///
    /// Validates rating and updates profile's average rating
    public fun add_rating(
        profile: &mut Profile,
        rating: u64,
        clock: &Clock,
    ) {
        // Validate rating (10-500, representing 0.1 to 5.0 stars)
        assert!(is_valid_rating(rating), EInvalidRating);

        // Calculate new average rating
        let new_avg_rating = calculate_new_rating(
            profile.rating,
            profile.rating_count,
            rating
        );

        profile.rating = new_avg_rating;
        profile.rating_count = profile.rating_count + 1;
        profile.updated_at = clock::timestamp_ms(clock);

        // Emit event
        event::emit(ReputationUpdated {
            profile_id: object::id(profile),
            new_rating: new_avg_rating,
            rating_count: profile.rating_count,
            timestamp: profile.updated_at,
        });
    }

    /// Record job completion (called by job_escrow module)
    ///
    /// Updates completed jobs count and total amount
    public fun record_job_completion(
        profile: &mut Profile,
        job_id: ID,
        amount: u64,
        clock: &Clock,
    ) {
        profile.completed_jobs = profile.completed_jobs + 1;
        profile.total_amount = profile.total_amount + amount;

        // Remove from active jobs if present
        if (vec_set::contains(&profile.active_jobs, &job_id)) {
            vec_set::remove(&mut profile.active_jobs, &job_id);
        };

        profile.updated_at = clock::timestamp_ms(clock);

        // Emit event
        event::emit(JobCompleted {
            profile_id: object::id(profile),
            job_id,
            amount,
            timestamp: profile.updated_at,
        });
    }

    /// Add job to active jobs (called when job assigned/created)
    ///
    /// Adds job to active jobs set (total_jobs incremented separately via capability)
    public fun add_active_job(
        profile: &mut Profile,
        job_id: ID,
        clock: &Clock,
    ) {
        vec_set::insert(&mut profile.active_jobs, job_id);
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Remove job from active jobs (called when job completed/cancelled)
    ///
    /// Removes job from active jobs set
    public fun remove_active_job(
        profile: &mut Profile,
        job_id: ID,
        clock: &Clock,
    ) {
        if (vec_set::contains(&profile.active_jobs, &job_id)) {
            vec_set::remove(&mut profile.active_jobs, &job_id);
        };
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Set verification status (admin only - implement permission check)
    ///
    /// Sets verification badge for profile
    /// TODO: Add admin capability in future version
    public fun set_verification(
        profile: &mut Profile,
        verified: bool,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        // TODO: Add admin capability check in future
        // For now, anyone can call this (will add AdminCap later)

        profile.verified = verified;
        profile.updated_at = clock::timestamp_ms(clock);

        event::emit(ProfileUpdated {
            profile_id: object::id(profile),
            field: string::utf8(b"verified"),
            timestamp: profile.updated_at,
        });
    }

    // ======== Getter Functions ========

    /// Get profile owner
    public fun get_owner(profile: &Profile): address {
        profile.owner
    }

    /// Get zkLogin subject ID
    public fun get_zklogin_sub(profile: &Profile): String {
        profile.zklogin_sub
    }

    /// Get email
    public fun get_email(profile: &Profile): String {
        profile.email
    }

    /// Get profile type
    public fun get_profile_type(profile: &Profile): u8 {
        profile.profile_type
    }

    /// Get username
    public fun get_username(profile: &Profile): String {
        profile.username
    }

    /// Get bio
    public fun get_bio(profile: &Profile): String {
        profile.bio
    }

    /// Get rating (scaled by 100)
    public fun get_rating(profile: &Profile): u64 {
        profile.rating
    }

    /// Get rating count
    public fun get_rating_count(profile: &Profile): u64 {
        profile.rating_count
    }

    /// Get completed jobs count
    public fun get_completed_jobs(profile: &Profile): u64 {
        profile.completed_jobs
    }

    /// Get total jobs
    public fun get_total_jobs(profile: &Profile): u64 {
        profile.total_jobs
    }

    /// Increment own total jobs counter (for self-updates without capability)
    ///
    /// Used when a profile owner updates their own stats (e.g., client creating a job)
    /// Validates the caller owns the profile via context
    public fun increment_own_total_jobs(
        profile: &mut Profile,
        clock: &Clock,
        ctx: &TxContext
    ) {
        // Verify caller owns the profile
        assert!(ctx.sender() == profile.owner, ENotProfileOwner);

        profile.total_jobs = profile.total_jobs + 1;
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Get total amount
    public fun get_total_amount(profile: &Profile): u64 {
        profile.total_amount
    }

    /// Check if verified
    public fun is_verified(profile: &Profile): bool {
        profile.verified
    }

    /// Get active jobs count
    public fun get_active_jobs_count(profile: &Profile): u64 {
        vec_set::length(&profile.active_jobs)
    }

    /// Check if job is active
    public fun is_job_active(profile: &Profile, job_id: ID): bool {
        vec_set::contains(&profile.active_jobs, &job_id)
    }

    /// Get ProfileCap's linked profile ID
    public fun get_cap_profile_id(cap: &ProfileCap): ID {
        cap.profile_id
    }

    // ======== Helper Functions ========

    /// Verify ProfileCap matches Profile
    fun verify_cap(profile: &Profile, cap: &ProfileCap) {
        assert!(object::id(profile) == cap.profile_id, ENotProfileOwner);
    }

    /// Calculate new average rating
    fun calculate_new_rating(old_rating: u64, old_count: u64, new_rating: u64): u64 {
        if (old_count == 0) {
            // First rating
            new_rating
        } else {
            // Calculate weighted average: (old_rating * old_count + new_rating) / (old_count + 1)
            let total_rating = (old_rating * old_count) + new_rating;
            let new_count = old_count + 1;
            total_rating / new_count
        }
    }

    /// Validate rating value (10-500, representing 0.1-5.0 stars)
    fun is_valid_rating(rating: u64): bool {
        rating >= 10 && rating <= 500
    }

    // ======== Test Functions ========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }

    #[test_only]
    public fun create_test_profile(
        profile_type: u8,
        ctx: &mut TxContext
    ): Profile {
        // TODO: Create test profile
        abort EInvalidProfileType
    }
}
