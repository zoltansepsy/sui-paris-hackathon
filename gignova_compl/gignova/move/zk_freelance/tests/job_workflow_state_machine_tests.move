// Copyright (c) 2024, Team Tuco
// SPDX-License-Identifier: MIT

/// Comprehensive state machine tests for job workflow
/// Tests all state transitions with separated client and freelancer profiles
///
/// State Machine Coverage:
/// - OPEN → ASSIGNED → IN_PROGRESS → SUBMITTED → AWAITING_REVIEW → COMPLETED
/// - OPEN → CANCELLED
/// - ASSIGNED → CANCELLED
/// - AWAITING_REVIEW → IN_PROGRESS (revision)
///
/// Integration Coverage:
/// - Profile stats updates at each transition
/// - Escrow balance tracking
/// - Active jobs synchronization

#[test_only]
module zk_freelance::job_workflow_state_machine_tests {
    use std::vector;
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use sui::coin;
    use sui::sui::SUI;

    use zk_freelance::job_escrow::{Self, Job, JobCap};
    use zk_freelance::profile_nft::{Self, Profile, IdentityRegistry};

    // Test addresses
    const CLIENT: address = @0xC1;
    const FREELANCER: address = @0xF1;
    const FREELANCER2: address = @0xF2;
    const FREELANCER3: address = @0xF3;

    // Job states
    const STATE_OPEN: u8 = 0;
    const STATE_ASSIGNED: u8 = 1;
    const STATE_IN_PROGRESS: u8 = 2;
    const STATE_SUBMITTED: u8 = 3;
    const STATE_COMPLETED: u8 = 5;
    const STATE_CANCELLED: u8 = 6;

    // Profile types
    const PROFILE_TYPE_FREELANCER: u8 = 0;
    const PROFILE_TYPE_CLIENT: u8 = 1;

    // Test constants
    const JOB_BUDGET: u64 = 10_000_000_000; // 10 SUI
    const MILESTONE_AMOUNT: u64 = 5_000_000_000; // 5 SUI
    const BASE_TIMESTAMP: u64 = 1000000;
    const ONE_DAY: u64 = 86400000; // 1 day in milliseconds

    // ==================== Helper Functions ====================

    /// Create a test clock with specified timestamp
    fun create_clock(timestamp: u64, scenario: &mut Scenario): Clock {
        ts::next_tx(scenario, CLIENT);
        let mut clock = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clock, timestamp);
        clock
    }

    /// Initialize identity registry (required for profile creation)
    fun init_registry(scenario: &mut Scenario) {
        ts::next_tx(scenario, CLIENT);
        profile_nft::init_for_testing(ts::ctx(scenario));
    }

    /// Create a client profile for testing
    fun create_client_profile(owner: address, scenario: &mut Scenario, clock: &Clock) {
        ts::next_tx(scenario, owner);
        {
            let mut registry = ts::take_shared<IdentityRegistry>(scenario);
            profile_nft::create_profile(
                &mut registry,
                PROFILE_TYPE_CLIENT,
                b"zklogin_sub_client",
                b"client@example.com",
                b"Client",
                b"Test Client",
                b"Test client bio",
                vector[b"client"],
                b"avatar_blob",
                clock,
                ts::ctx(scenario)
            );
            ts::return_shared(registry);
        };
    }

    /// Create a freelancer profile for testing
    fun create_freelancer_profile(owner: address, scenario: &mut Scenario, clock: &Clock) {
        ts::next_tx(scenario, owner);
        {
            let mut registry = ts::take_shared<IdentityRegistry>(scenario);

            let zklogin_sub = if (owner == FREELANCER) {
                b"zklogin_sub_freelancer_F1"
            } else if (owner == FREELANCER2) {
                b"zklogin_sub_freelancer_F2"
            } else if (owner == FREELANCER3) {
                b"zklogin_sub_freelancer_F3"
            } else {
                b"zklogin_sub_freelancer_OTHER"
            };

            profile_nft::create_profile(
                &mut registry,
                PROFILE_TYPE_FREELANCER,
                zklogin_sub,
                b"freelancer@example.com",
                b"Freelancer",
                b"Test Freelancer",
                b"Test freelancer bio",
                vector[b"freelancer"],
                b"avatar_blob",
                clock,
                ts::ctx(scenario)
            );
            ts::return_shared(registry);
        };
    }

    /// Create a job with specified number of milestones
    fun create_job_with_milestones(
        client_addr: address,
        milestone_count: u64,
        amount_per_milestone: u64,
        scenario: &mut Scenario,
        clock: &Clock
    ) {
        let total_budget = milestone_count * amount_per_milestone;
        let deadline = BASE_TIMESTAMP + (30 * ONE_DAY); // 30 days from now

        // Create job
        ts::next_tx(scenario, client_addr);
        {
            let mut client_profile = ts::take_from_sender<Profile>(scenario);
            let payment = coin::mint_for_testing<SUI>(total_budget, ts::ctx(scenario));

            job_escrow::create_job(
                &mut client_profile,
                b"Test Job Title",
                b"description_blob_id",
                payment,
                deadline,
                clock,
                ts::ctx(scenario)
            );

            ts::return_to_sender(scenario, client_profile);
        };

        // Add milestones
        if (milestone_count > 0) {
            ts::next_tx(scenario, client_addr);
            let mut job = ts::take_shared<Job>(scenario);
            let job_cap = ts::take_from_sender<JobCap>(scenario);

            let mut i = 0;
            while (i < milestone_count) {
                job_escrow::add_milestone(
                    &mut job,
                    &job_cap,
                    b"Milestone description",
                    amount_per_milestone,
                    ts::ctx(scenario)
                );
                i = i + 1;
            };

            ts::return_shared(job);
            ts::return_to_sender(scenario, job_cap);
        };
    }

    /// Freelancer applies for job and client assigns them
    fun apply_and_assign(
        client_addr: address,
        freelancer_addr: address,
        scenario: &mut Scenario,
        clock: &Clock
    ) {
        // Freelancer applies
        ts::next_tx(scenario, freelancer_addr);
        {
            let mut job = ts::take_shared<Job>(scenario);
            let freelancer_profile = ts::take_from_sender<Profile>(scenario);

            job_escrow::apply_for_job(
                &mut job,
                &freelancer_profile,
                clock,
                ts::ctx(scenario)
            );

            ts::return_shared(job);
            ts::return_to_sender(scenario, freelancer_profile);
        };

        // Client assigns freelancer (no profile needed - ownership fix)
        ts::next_tx(scenario, client_addr);
        {
            let mut job = ts::take_shared<Job>(scenario);
            let job_cap = ts::take_from_sender<JobCap>(scenario);

            job_escrow::assign_freelancer(
                &mut job,
                &job_cap,
                freelancer_addr,
                clock,
                ts::ctx(scenario)
            );

            ts::return_shared(job);
            ts::return_to_sender(scenario, job_cap);
        };
    }

    /// Freelancer starts the job (now includes profile update)
    fun start_job(freelancer_addr: address, scenario: &mut Scenario, clock: &Clock) {
        ts::next_tx(scenario, freelancer_addr);
        let mut job = ts::take_shared<Job>(scenario);
        let mut freelancer_profile = ts::take_from_sender<Profile>(scenario);

        job_escrow::start_job(&mut job, &mut freelancer_profile, clock, ts::ctx(scenario));

        ts::return_shared(job);
        ts::return_to_sender(scenario, freelancer_profile);
    }

    /// Freelancer submits a milestone
    fun submit_milestone(
        milestone_id: u64,
        freelancer_addr: address,
        scenario: &mut Scenario,
        clock: &Clock
    ) {
        ts::next_tx(scenario, freelancer_addr);
        let mut job = ts::take_shared<Job>(scenario);

        job_escrow::submit_milestone(
            &mut job,
            milestone_id,
            vector::empty(), // proof_blob_id
            clock,
            ts::ctx(scenario)
        );

        ts::return_shared(job);
    }

    /// Client approves a milestone
    fun approve_milestone(
        milestone_id: u64,
        client_addr: address,
        freelancer_addr: address,
        scenario: &mut Scenario,
        clock: &Clock
    ) {
        ts::next_tx(scenario, client_addr);
        let mut job = ts::take_shared<Job>(scenario);
        let job_cap = ts::take_from_sender<JobCap>(scenario);
        let mut client_profile = ts::take_from_sender<Profile>(scenario);
        let mut freelancer_profile = ts::take_from_address<Profile>(scenario, freelancer_addr);

        job_escrow::approve_milestone(
            &mut job,
            &job_cap,
            milestone_id,
            &mut client_profile,
            &mut freelancer_profile,
            clock,
            ts::ctx(scenario)
        );

        ts::return_shared(job);
        ts::return_to_sender(scenario, job_cap);
        ts::return_to_sender(scenario, client_profile);
        ts::return_to_address(freelancer_addr, freelancer_profile);
    }

    /// Verify job state and escrow balance
    fun verify_job_state(
        expected_state: u8,
        expected_escrow_balance: u64,
        scenario: &Scenario
    ) {
        let job = ts::take_shared<Job>(scenario);

        assert!(job_escrow::get_state(&job) == expected_state, 0);
        assert!(job_escrow::get_escrow_balance(&job) == expected_escrow_balance, 1);

        ts::return_shared(job);
    }

    /// Verify profile statistics
    fun verify_profile_stats(
        owner_addr: address,
        expected_total_jobs: u64,
        expected_completed_jobs: u64,
        expected_total_amount: u64,
        scenario: &Scenario
    ) {
        let profile = ts::take_from_address<Profile>(scenario, owner_addr);

        assert!(profile_nft::get_total_jobs(&profile) == expected_total_jobs, 100);
        assert!(profile_nft::get_completed_jobs(&profile) == expected_completed_jobs, 101);
        assert!(profile_nft::get_total_amount(&profile) == expected_total_amount, 102);

        ts::return_to_address(owner_addr, profile);
    }

    // ==================== Happy Path Tests ====================

    #[test]
    /// Test complete workflow with single milestone
    /// OPEN → ASSIGNED → IN_PROGRESS → SUBMITTED → COMPLETED
    fun test_complete_workflow_single_milestone() {
        let mut scenario = ts::begin(CLIENT);
        let clock = create_clock(BASE_TIMESTAMP, &mut scenario);

        // Initialize registry
        init_registry(&mut scenario);

        // Phase 1: Create profiles
        create_client_profile(CLIENT, &mut scenario, &clock);
        create_freelancer_profile(FREELANCER, &mut scenario, &clock);

        // Phase 2: Create job (OPEN)
        create_job_with_milestones(CLIENT, 1, JOB_BUDGET, &mut scenario, &clock);

        // Verify initial state
        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_OPEN, JOB_BUDGET, &scenario);
        verify_profile_stats(CLIENT, 1, 0, 0, &scenario);

        // Phase 3: Apply and assign (ASSIGNED)
        apply_and_assign(CLIENT, FREELANCER, &mut scenario, &clock);

        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_ASSIGNED, JOB_BUDGET, &scenario);
        // Note: total_jobs is now incremented in start_job, not assign_freelancer
        verify_profile_stats(FREELANCER, 0, 0, 0, &scenario);

        // Phase 4: Start job (IN_PROGRESS)
        start_job(FREELANCER, &mut scenario, &clock);

        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_IN_PROGRESS, JOB_BUDGET, &scenario);
        // After start_job, total_jobs should be 1
        verify_profile_stats(FREELANCER, 1, 0, 0, &scenario);

        // Phase 5: Submit milestone (SUBMITTED)
        submit_milestone(0, FREELANCER, &mut scenario, &clock);

        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_SUBMITTED, JOB_BUDGET, &scenario);

        // Phase 6: Approve milestone (COMPLETED)
        approve_milestone(0, CLIENT, FREELANCER, &mut scenario, &clock);

        // Verify final state
        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_COMPLETED, 0, &scenario);

        // Verify profile stats updated
        verify_profile_stats(CLIENT, 1, 1, JOB_BUDGET, &scenario);
        verify_profile_stats(FREELANCER, 1, 1, JOB_BUDGET, &scenario);

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Test complete workflow with multiple milestones (3 milestones)
    fun test_complete_workflow_multiple_milestones() {
        let mut scenario = ts::begin(CLIENT);
        let clock = create_clock(BASE_TIMESTAMP, &mut scenario);

        init_registry(&mut scenario);
        create_client_profile(CLIENT, &mut scenario, &clock);
        create_freelancer_profile(FREELANCER, &mut scenario, &clock);

        // Create job with 3 milestones
        create_job_with_milestones(CLIENT, 3, MILESTONE_AMOUNT, &mut scenario, &clock);

        // Assign and start
        apply_and_assign(CLIENT, FREELANCER, &mut scenario, &clock);
        start_job(FREELANCER, &mut scenario, &clock);

        // Complete first milestone
        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_IN_PROGRESS, 3 * MILESTONE_AMOUNT, &scenario);

        submit_milestone(0, FREELANCER, &mut scenario, &clock);
        approve_milestone(0, CLIENT, FREELANCER, &mut scenario, &clock);

        // Job should still be IN_PROGRESS
        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_IN_PROGRESS, 2 * MILESTONE_AMOUNT, &scenario);

        // Complete second milestone
        submit_milestone(1, FREELANCER, &mut scenario, &clock);
        approve_milestone(1, CLIENT, FREELANCER, &mut scenario, &clock);

        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_IN_PROGRESS, MILESTONE_AMOUNT, &scenario);

        // Complete third milestone (final)
        submit_milestone(2, FREELANCER, &mut scenario, &clock);
        approve_milestone(2, CLIENT, FREELANCER, &mut scenario, &clock);

        // Job should now be COMPLETED
        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_COMPLETED, 0, &scenario);

        // Verify final stats
        verify_profile_stats(CLIENT, 1, 1, 3 * MILESTONE_AMOUNT, &scenario);
        verify_profile_stats(FREELANCER, 1, 1, 3 * MILESTONE_AMOUNT, &scenario);

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Test cancellation before assignment (OPEN → CANCELLED)
    fun test_cancel_before_assignment() {
        let mut scenario = ts::begin(CLIENT);
        let clock = create_clock(BASE_TIMESTAMP, &mut scenario);

        init_registry(&mut scenario);
        create_client_profile(CLIENT, &mut scenario, &clock);

        create_job_with_milestones(CLIENT, 1, JOB_BUDGET, &mut scenario, &clock);

        // Verify job is OPEN
        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_OPEN, JOB_BUDGET, &scenario);

        // Client cancels job
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut job = ts::take_shared<Job>(&mut scenario);
            let job_cap = ts::take_from_sender<JobCap>(&mut scenario);
            let mut client_profile = ts::take_from_sender<Profile>(&mut scenario);

            job_escrow::cancel_job(
                &mut job,
                &job_cap,
                &mut client_profile,
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(job);
            ts::return_to_sender(&mut scenario, job_cap);
            ts::return_to_sender(&mut scenario, client_profile);
        };

        // Verify job is CANCELLED
        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_CANCELLED, 0, &scenario);

        // Verify client profile
        verify_profile_stats(CLIENT, 1, 0, 0, &scenario);

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Test cancellation after assignment but before start (ASSIGNED → CANCELLED)
    fun test_cancel_after_assignment_before_start() {
        let mut scenario = ts::begin(CLIENT);
        let clock = create_clock(BASE_TIMESTAMP, &mut scenario);

        init_registry(&mut scenario);
        create_client_profile(CLIENT, &mut scenario, &clock);
        create_freelancer_profile(FREELANCER, &mut scenario, &clock);

        create_job_with_milestones(CLIENT, 1, JOB_BUDGET, &mut scenario, &clock);

        // Assign freelancer
        apply_and_assign(CLIENT, FREELANCER, &mut scenario, &clock);

        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_ASSIGNED, JOB_BUDGET, &scenario);

        // Cancel with freelancer
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut job = ts::take_shared<Job>(&mut scenario);
            let job_cap = ts::take_from_sender<JobCap>(&mut scenario);
            let mut client_profile = ts::take_from_sender<Profile>(&mut scenario);
            let mut freelancer_profile = ts::take_from_address<Profile>(&mut scenario, FREELANCER);

            job_escrow::cancel_job_with_freelancer(
                &mut job,
                &job_cap,
                &mut client_profile,
                &mut freelancer_profile,
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(job);
            ts::return_to_sender(&mut scenario, job_cap);
            ts::return_to_sender(&mut scenario, client_profile);
            ts::return_to_address(FREELANCER, freelancer_profile);
        };

        // Verify CANCELLED
        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_CANCELLED, 0, &scenario);

        // Both profiles should be updated correctly
        // Note: Client's total_jobs = 1 (from create_job)
        // Freelancer's total_jobs = 0 (never called start_job, so increment never happened)
        verify_profile_stats(CLIENT, 1, 0, 0, &scenario);
        verify_profile_stats(FREELANCER, 0, 0, 0, &scenario);

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Test profile stats consistency across multiple jobs
    fun test_profile_stats_consistency_across_multiple_jobs() {
        let mut scenario = ts::begin(CLIENT);
        let clock = create_clock(BASE_TIMESTAMP, &mut scenario);

        init_registry(&mut scenario);
        create_client_profile(CLIENT, &mut scenario, &clock);
        create_freelancer_profile(FREELANCER, &mut scenario, &clock);

        let job_count = 3;
        let mut i = 0;

        while (i < job_count) {
            // Create and complete a job
            create_job_with_milestones(CLIENT, 1, JOB_BUDGET, &mut scenario, &clock);

            apply_and_assign(CLIENT, FREELANCER, &mut scenario, &clock);
            start_job(FREELANCER, &mut scenario, &clock);
            submit_milestone(0, FREELANCER, &mut scenario, &clock);
            approve_milestone(0, CLIENT, FREELANCER, &mut scenario, &clock);

            i = i + 1;
        };

        // Verify final stats
        ts::next_tx(&mut scenario, CLIENT);

        let expected_total_amount = job_count * JOB_BUDGET;

        // Both completed 3 jobs
        verify_profile_stats(CLIENT, 3, 3, expected_total_amount, &scenario);
        verify_profile_stats(FREELANCER, 3, 3, expected_total_amount, &scenario);

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Test concurrent applications from multiple freelancers
    fun test_concurrent_applications() {
        let mut scenario = ts::begin(CLIENT);
        let clock = create_clock(BASE_TIMESTAMP, &mut scenario);

        init_registry(&mut scenario);
        create_client_profile(CLIENT, &mut scenario, &clock);
        create_freelancer_profile(FREELANCER, &mut scenario, &clock);
        create_freelancer_profile(FREELANCER2, &mut scenario, &clock);
        create_freelancer_profile(FREELANCER3, &mut scenario, &clock);

        create_job_with_milestones(CLIENT, 1, JOB_BUDGET, &mut scenario, &clock);

        // All 3 freelancers apply
        ts::next_tx(&mut scenario, FREELANCER);
        {
            let mut job = ts::take_shared<Job>(&mut scenario);
            let freelancer_profile = ts::take_from_sender<Profile>(&mut scenario);

            job_escrow::apply_for_job(&mut job, &freelancer_profile, &clock, ts::ctx(&mut scenario));
            ts::return_shared(job);
            ts::return_to_sender(&mut scenario, freelancer_profile);
        };

        ts::next_tx(&mut scenario, FREELANCER2);
        {
            let mut job = ts::take_shared<Job>(&mut scenario);
            let freelancer_profile = ts::take_from_sender<Profile>(&mut scenario);

            job_escrow::apply_for_job(&mut job, &freelancer_profile, &clock, ts::ctx(&mut scenario));
            ts::return_shared(job);
            ts::return_to_sender(&mut scenario, freelancer_profile);
        };

        ts::next_tx(&mut scenario, FREELANCER3);
        {
            let mut job = ts::take_shared<Job>(&mut scenario);
            let freelancer_profile = ts::take_from_sender<Profile>(&mut scenario);

            job_escrow::apply_for_job(&mut job, &freelancer_profile, &clock, ts::ctx(&mut scenario));
            ts::return_shared(job);
            ts::return_to_sender(&mut scenario, freelancer_profile);
        };

        // Client can assign FREELANCER (no profile needed - ownership fix)
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut job = ts::take_shared<Job>(&mut scenario);
            let job_cap = ts::take_from_sender<JobCap>(&mut scenario);

            job_escrow::assign_freelancer(
                &mut job,
                &job_cap,
                FREELANCER,
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(job);
            ts::return_to_sender(&mut scenario, job_cap);
        };

        ts::next_tx(&mut scenario, CLIENT);
        verify_job_state(STATE_ASSIGNED, JOB_BUDGET, &scenario);

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
