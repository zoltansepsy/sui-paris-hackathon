/**
 * useProfile Hook
 * Custom hook for fetching and caching profile data
 *
 * DEV 3 TODO:
 * 1. Implement with @tanstack/react-query
 * 2. Add profile creation check
 * 3. Add optimistic updates for profile edits
 * 4. Test with real profile data
 */

"use client";

import { useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";
import { useNetworkVariable } from "../networkConfig";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createProfileService } from "../services";

/**
 * Hook to fetch profile by ID
 *
 * @param profileId Profile object ID
 * @returns Profile data, loading state, error, and refetch function
 */
export function useProfile(profileId: string | undefined) {
  const suiClient = useSuiClient();
  const profilePackageId = useNetworkVariable("profileNftPackageId");

  const profileService = useMemo(
    () => createProfileService(suiClient, profilePackageId),
    [suiClient, profilePackageId]
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["profile", profileId],
    queryFn: () => profileService.getProfile(profileId!),
    enabled: !!profileId,
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  return {
    profile: data || null,
    isPending,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch current user's profile
 *
 * @returns Current user's profile, hasProfile flag, loading state
 */
export function useCurrentProfile() {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const profilePackageId = useNetworkVariable("profileNftPackageId");

  const profileService = useMemo(
    () => createProfileService(suiClient, profilePackageId),
    [suiClient, profilePackageId]
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["profile", "current", currentAccount?.address],
    queryFn: () => profileService.getProfileByOwner(currentAccount!.address),
    enabled: !!currentAccount?.address,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  return {
    profile: data || null,
    hasProfile: !!data,
    isPending,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch profile by owner address
 *
 * @param ownerAddress Owner's address
 * @returns Profile data, loading state, error
 */
export function useProfileByOwner(ownerAddress: string | undefined) {
  const suiClient = useSuiClient();
  const profilePackageId = useNetworkVariable("profileNftPackageId");

  const profileService = useMemo(
    () => createProfileService(suiClient, profilePackageId),
    [suiClient, profilePackageId]
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["profile", "owner", ownerAddress],
    queryFn: () => profileService.getProfileByOwner(ownerAddress!),
    enabled: !!ownerAddress,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  return {
    profile: data || null,
    isPending,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch top-rated freelancers
 *
 * @param limit Number of profiles to fetch
 * @returns Array of top profiles, loading state, error
 */
export function useTopFreelancers(limit: number = 10) {
  const suiClient = useSuiClient();
  const profilePackageId = useNetworkVariable("profileNftPackageId");

  const profileService = useMemo(
    () => createProfileService(suiClient, profilePackageId),
    [suiClient, profilePackageId]
  );

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["profiles", "top", limit],
    queryFn: () => profileService.getTopFreelancers(limit),
    staleTime: 60000, // Consider data fresh for 60 seconds
    refetchInterval: 120000, // Refetch every 2 minutes
  });

  return {
    profiles: data || [],
    isPending,
    error: error as Error | null,
    refetch,
  };
}
