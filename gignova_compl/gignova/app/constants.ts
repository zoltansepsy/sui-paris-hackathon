//Keep whitelist

export const DEVNET_WHITELIST_PACKAGE_ID = "0xbc5b7be20d1aeb38db4b15b99192ad32ee0761b3262e0195470b27d8bb2d1c94";
export const TESTNET_WHITELIST_PACKAGE_ID = "0x06c9c48b286867ac7b63571eac42d2f91386658a41465a6185f6bbb6c169036d";
export const MAINNET_WHITELIST_PACKAGE_ID = "0xTODO";

/**
 * Canonical Seal Key Servers for Encryption/Decryption
 *
 * These servers are used for Seal's Identity-Based Encryption with threshold cryptography.
 * All users (freelancers and clients) must use the same server list for encryption/decryption
 * to work correctly. The encrypted data is tied to the specific servers used during encryption.
 *
 * Based on: https://seal-docs.wal.app
 */
export const CANONICAL_SEAL_SERVERS_TESTNET = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", // Mysten Testnet 1
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8", // Mysten Testnet 2
  "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2", // Studio Mirai
] as const;

export const CANONICAL_SEAL_SERVERS_MAINNET = [
  // TODO: Add mainnet servers once available
  // These will be added when deploying to mainnet
] as const;

/**
 * Seal Threshold for redundancy
 * 2-of-3 threshold means any 2 servers can decrypt data encrypted with 3 servers
 */
export const SEAL_THRESHOLD = 2;

/**
 * Job Escrow Package IDs
 * Deploy with: cd move/zk_freelance && sui client publish --gas-budget 100000000 .
 */
export const DEVNET_JOB_ESCROW_PACKAGE_ID = "0xbc5b7be20d1aeb38db4b15b99192ad32ee0761b3262e0195470b27d8bb2d1c94";
export const TESTNET_JOB_ESCROW_PACKAGE_ID = "0x06c9c48b286867ac7b63571eac42d2f91386658a41465a6185f6bbb6c169036d";
export const MAINNET_JOB_ESCROW_PACKAGE_ID = "0xTODO";

/**
 * Profile NFT Package IDs
 * Uses same package as job_escrow (part of zk_freelance package)
 */
export const DEVNET_PROFILE_NFT_PACKAGE_ID = "0xbc5b7be20d1aeb38db4b15b99192ad32ee0761b3262e0195470b27d8bb2d1c94";
export const TESTNET_PROFILE_NFT_PACKAGE_ID = "0x06c9c48b286867ac7b63571eac42d2f91386658a41465a6185f6bbb6c169036d";
export const MAINNET_PROFILE_NFT_PACKAGE_ID = "0xTODO";

/**
 * Reputation Package IDs
 * Uses same package as job_escrow (part of zk_freelance package)
 */
export const DEVNET_REPUTATION_PACKAGE_ID = "0xbc5b7be20d1aeb38db4b15b99192ad32ee0761b3262e0195470b27d8bb2d1c94";
export const TESTNET_REPUTATION_PACKAGE_ID = "0x06c9c48b286867ac7b63571eac42d2f91386658a41465a6185f6bbb6c169036d";
export const MAINNET_REPUTATION_PACKAGE_ID = "0xTODO";

/**
 * Identity Registry Object IDs
 * Shared object created during profile_nft module initialization (init function)
 * Maps zkLogin OAuth subject IDs to Profile IDs for global lookup
 *
 * IMPORTANT: After deployment, find the IdentityRegistry object ID from deployment output
 * Look for: "Created Objects" -> type ending in "::profile_nft::IdentityRegistry"
 */
export const DEVNET_IDENTITY_REGISTRY_ID = "0x9f81845c9a8cb2b262e3974ea07e4272841155c0ac254a95e2273b6bae4f628d";
export const TESTNET_IDENTITY_REGISTRY_ID = "0xf1e03196b7a513979d7f66fd60b5dcfb2141fcde328cddffb0f9024244789f60";
export const MAINNET_IDENTITY_REGISTRY_ID = "0xTODO";

// ======== Deployment Instructions ========
// 1. Deploy contracts: cd move/zk_freelance && sui client publish --gas-budget 100000000 .
// 2. Copy the package ID from the output
// 3. Update all package ID constants above with the same package ID
// 4. Find the IdentityRegistry shared object ID from "Created Objects" in deployment output
// 5. Update IDENTITY_REGISTRY_ID constants with the registry object ID
// 6. The package contains all modules: job_escrow, profile_nft, reputation, milestone

// ======== zkLogin Configuration ========

/**
 * Google OAuth Client ID
 * Get from: https://console.cloud.google.com/apis/credentials
 * Make sure to add http://localhost:3000/auth/callback to authorized redirect URIs
 *
 * IMPORTANT: Replace this with your actual Google OAuth Client ID
 * You can also set it via environment variable: NEXT_PUBLIC_GOOGLE_CLIENT_ID
 */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "414212044936-v5htej4oaapbrchs0uc1tlf60gqils4f.apps.googleusercontent.com";

/**
 * zkLogin Prover URL (Mysten's prover service for devnet)
 */
export const PROVER_URL = "https://prover-dev.mystenlabs.com/v1";

/**
 * OAuth Redirect URL (must match Google OAuth settings)
 * IMPORTANT: This must match the redirect URI configured in Google OAuth
 */
export const REDIRECT_URL = "http://localhost:3000/auth/callback";

/**
 * OpenID Provider URL for Google
 */
export const OPENID_PROVIDER_URL = "https://accounts.google.com/.well-known/openid-configuration";                       