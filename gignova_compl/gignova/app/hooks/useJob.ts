/**
 * useJob Hook
 * Custom hook for fetching and caching job data
 *
 * DEV 3 TODO:
 * 1. Implement with @tanstack/react-query
 * 2. Add automatic refetching on relevant events
 * 3. Add optimistic updates for state changes
 * 4. Test with real job data
 */

"use client";

import { useSuiClient } from "@mysten/dapp-kit";
import { useNetworkVariable } from "../networkConfig";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createJobService } from "../services";

/**
 * Hook to fetch job details by ID
 * Uses @tanstack/react-query for caching and automatic refetching
 *
 * @param jobId Job object ID
 * @returns Job data, loading state, error, and refetch function
 */
export function useJob(jobId: string | undefined) {
  const suiClient = useSuiClient();
  const jobPackageId = useNetworkVariable("jobEscrowPackageId");

  const jobService = useMemo(
    () => createJobService(suiClient, jobPackageId),
    [suiClient, jobPackageId]
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => jobService.getJob(jobId!),
    enabled: !!jobId,
    staleTime: 0, // REDUCED: Always fetch fresh data to show current state immediately
    refetchInterval: 10000, // INCREASED: Refetch every 10 seconds (reduced from 30s)
  });

  return {
    job: data || null,
    isPending,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch jobs posted by a client
 * Uses event-based indexing to discover jobs
 *
 * @param clientAddress Client's address
 * @returns Array of jobs, loading state, error
 */
export function useJobsByClient(clientAddress: string | undefined) {
  const suiClient = useSuiClient();
  const jobPackageId = useNetworkVariable("jobEscrowPackageId");

  const jobService = useMemo(
    () => createJobService(suiClient, jobPackageId),
    [suiClient, jobPackageId]
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["jobs", "client", clientAddress],
    queryFn: () => jobService.getJobsByClient(clientAddress!),
    enabled: !!clientAddress,
    staleTime: 0, // Always fetch fresh data
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  return {
    jobs: data || [],
    isPending,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch jobs assigned to a freelancer
 * Uses FreelancerAssigned events to discover assigned jobs
 *
 * @param freelancerAddress Freelancer's address
 * @returns Array of jobs, loading state, error
 */
export function useJobsByFreelancer(freelancerAddress: string | undefined) {
  const suiClient = useSuiClient();
  const jobPackageId = useNetworkVariable("jobEscrowPackageId");

  const jobService = useMemo(
    () => createJobService(suiClient, jobPackageId),
    [suiClient, jobPackageId]
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["jobs", "freelancer", freelancerAddress],
    queryFn: () => jobService.getJobsByFreelancer(freelancerAddress!),
    enabled: !!freelancerAddress,
    staleTime: 0, // Always fetch fresh data
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  return {
    jobs: data || [],
    isPending,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch open jobs for marketplace
 * Uses event-based indexing to discover jobs filtered by OPEN state
 *
 * @param limit Maximum number of jobs to fetch (default: 50)
 * @returns Array of open jobs, loading state, error
 */
export function useOpenJobs(limit: number = 50) {
  const suiClient = useSuiClient();
  const jobPackageId = useNetworkVariable("jobEscrowPackageId");

  const jobService = useMemo(
    () => createJobService(suiClient, jobPackageId),
    [suiClient, jobPackageId]
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["jobs", "open", limit],
    queryFn: () => jobService.getOpenJobs(limit),
    staleTime: 0, // REDUCED: Always fetch fresh data to catch state changes immediately
    refetchInterval: 10000, // INCREASED: Auto-refresh marketplace every 10 seconds (reduced from 30s)
  });

  return {
    jobs: data || [],
    isPending,
    error: error as Error | null,
    refetch,
  };
}
