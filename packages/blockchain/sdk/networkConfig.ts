import { getFullnodeUrl } from "@mysten/sui/client";
import { createNetworkConfig } from "@mysten/dapp-kit";

const { networkConfig, useNetworkVariable, useNetworkVariables } =
  createNetworkConfig({
    devnet: {
      url: getFullnodeUrl("devnet"),
      variables: {
        // Add package IDs after deployment, e.g. packageId: "0x...",
      },
    },
    testnet: {
      url: getFullnodeUrl("testnet"),
      variables: {
        // Add package IDs after deployment, e.g. packageId: "0x...",
      },
    },
    mainnet: {
      url: getFullnodeUrl("mainnet"),
      variables: {
        // Add package IDs after deployment, e.g. packageId: "0x...",
      },
    },
  });

export { useNetworkVariable, useNetworkVariables, networkConfig };
