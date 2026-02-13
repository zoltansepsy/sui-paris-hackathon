/**
 * useWallet Hook
 * Utility hook for wallet-related operations
 *
 * DEV 3 TODO:
 * 1. Add coin balance fetching
 * 2. Add coin splitting utilities
 * 3. Add transaction helpers
 * 4. Test wallet connection flows
 */

"use client";

import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useState, useEffect } from "react";

/**
 * Hook for SUI balance
 *
 * @returns SUI balance in MIST, formatted balance, loading state, refetch function
 */
export function useSuiBalance() {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [isPending, setIsPending] = useState(true);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  useEffect(() => {
    if (!currentAccount?.address) {
      setBalance(BigInt(0));
      setIsPending(false);
      return;
    }

    const fetchBalance = async () => {
      setIsPending(true);
      try {
        const { totalBalance } = await suiClient.getBalance({
          owner: currentAccount.address,
          coinType: "0x2::sui::SUI",
        });
        setBalance(BigInt(totalBalance));
      } catch (error) {
        console.error("Error fetching balance:", error);
      } finally {
        setIsPending(false);
      }
    };

    fetchBalance();
  }, [currentAccount?.address, suiClient, fetchTrigger]);

  const formatBalance = (decimals: number = 9): string => {
    return (Number(balance) / Math.pow(10, decimals)).toFixed(4);
  };

  const refetch = () => {
    setFetchTrigger((prev) => prev + 1);
  };

  return {
    balance,
    formattedBalance: formatBalance(),
    isPending,
    refetch,
  };
}

/**
 * Hook to check if wallet has sufficient balance
 *
 * TODO: Implement
 *
 * @param requiredAmount Amount required in MIST
 * @returns Boolean indicating if balance is sufficient
 */
export function useHasSufficientBalance(requiredAmount: number) {
  const { balance } = useSuiBalance();

  return balance >= BigInt(requiredAmount);
}

/**
 * Hook for wallet address shortening
 *
 * @param address Full address
 * @param prefixLength Length of prefix (default 6)
 * @param suffixLength Length of suffix (default 4)
 * @returns Shortened address (e.g., "0x1234...5678")
 */
export function useShortenAddress(
  address: string | undefined,
  prefixLength: number = 6,
  suffixLength: number = 4
): string {
  if (!address) return "";

  if (address.length <= prefixLength + suffixLength) {
    return address;
  }

  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}

/**
 * Hook to check if current user is profile owner
 *
 * @param ownerAddress Owner's address
 * @returns Boolean indicating ownership
 */
export function useIsOwner(ownerAddress: string | undefined): boolean {
  const currentAccount = useCurrentAccount();

  if (!currentAccount?.address || !ownerAddress) {
    return false;
  }

  return currentAccount.address === ownerAddress;
}
