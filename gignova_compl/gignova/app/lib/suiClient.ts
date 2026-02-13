import { SuiClient } from '@mysten/sui/client';
import { networkConfig } from '../networkConfig';

const FULLNODE_URL = process.env.REACT_APP_FULLNODE_URL as string;
export const PACKAGE_ID = process.env.REACT_APP_PACKAGE_ID as string;

// Network storage helpers
const NETWORK_KEY = 'sui_network';
const DEFAULT_NETWORK = 'testnet';

export type NetworkType = 'devnet' | 'testnet' | 'mainnet';

export function getCurrentNetwork(): NetworkType {
  if (typeof window === 'undefined') return DEFAULT_NETWORK;
  return (localStorage.getItem(NETWORK_KEY) as NetworkType) || DEFAULT_NETWORK;
}

export function setCurrentNetwork(network: NetworkType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(NETWORK_KEY, network);
  }
}

export function getSuiClient(): SuiClient {
  const network = getCurrentNetwork();
  return new SuiClient({ url: networkConfig[network].url });
}

// Legacy export for backward compatibility - creates client on access
// Note: This is now dynamic based on localStorage
export const SUI_CLIENT = new SuiClient({ url: networkConfig[getCurrentNetwork()].url });
