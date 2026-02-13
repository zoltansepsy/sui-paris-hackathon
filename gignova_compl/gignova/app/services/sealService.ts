import { SuiClient } from "@mysten/sui/client";
import { getFullnodeUrl } from "@mysten/sui/client";
import { SealClient, SessionKey, EncryptedObject } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import {
  CANONICAL_SEAL_SERVERS_TESTNET,
  CANONICAL_SEAL_SERVERS_MAINNET,
  TESTNET_WHITELIST_PACKAGE_ID,
  MAINNET_WHITELIST_PACKAGE_ID,
} from "@/constants";

/**
 * Available Seal key server object IDs for testnet (open mode)
 */
export const SEAL_TESTNET_SERVERS = {
  "Mysten Testnet 1":
    "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "Mysten Testnet 2":
    "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
  "Studio Mirai":
    "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2",
  Overclock:
    "0x9c949e53c36ab7a9c484ed9e8b43267a77d4b8d70e79aa6b39042e3d4c434105",
  "H2O Nodes":
    "0x39cef09b24b667bc6ed54f7159d82352fe2d5dd97ca9a5beaa1d21aa774f25a2",
  "Ruby Nodes":
    "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
  NodeInfra:
    "0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007",
  RpcPool: "0x4cded1abeb52a22b6becb42a91d3686a4c901cf52eee16234214d0b5b2da4c46",
  Natsai: "0x3c93ec1474454e1b47cf485a4e5361a5878d722b9492daf10ef626a76adc3dad",
  "Mhax.io":
    "0x6a0726a1ea3d62ba2f2ae51104f2c3633c003fb75621d06fde47f04dc930ba06",
} as const;

/**
 * Available Seal key server object IDs for mainnet
 * Based on: https://www.mystenlabs.com/blog/seal-mainnet-launch-privacy-access-control
 * Servers include: Ruby Nodes, NodeInfra, Studio Mirai, Overclock, H2O Nodes, and Mysten Labs
 */
export const SEAL_MAINNET_SERVERS = {
  // TODO: Add actual mainnet object IDs once available
  // These need to be obtained from https://seal-docs.wal.app or the Seal team
  "Mysten Mainnet 1": "0xTODO_REPLACE_WITH_ACTUAL_MAINNET_SERVER_ID",
  "Ruby Nodes": "0xTODO_REPLACE_WITH_ACTUAL_MAINNET_SERVER_ID",
  "NodeInfra": "0xTODO_REPLACE_WITH_ACTUAL_MAINNET_SERVER_ID",
  "Studio Mirai": "0xTODO_REPLACE_WITH_ACTUAL_MAINNET_SERVER_ID",
  "Overclock": "0xTODO_REPLACE_WITH_ACTUAL_MAINNET_SERVER_ID",
  "H2O Nodes": "0xTODO_REPLACE_WITH_ACTUAL_MAINNET_SERVER_ID",
} as const;

export interface SealConfig {
  network?: "testnet" | "mainnet";
  serverObjectIds?: string[];
  whitelistPackageId?: string;
}

/**
 * Seal Service for encryption/decryption with whitelist access control
 * Based on: https://seal-docs.wal.app/Design/ and https://seal-docs.wal.app/UsingSeal/
 * Whitelist pattern: https://github.com/MystenLabs/seal/blob/main/move/patterns/sources/whitelist.move
 */
export class SealService {
  private client: SealClient;
  private suiClient: SuiClient;
  private whitelistPackageId: string;

  constructor(config?: SealConfig) {
    const network = config?.network || "testnet";
    console.log("[SEAL] Initializing SealService:", {
      network,
      configProvided: !!config,
      serverCount: config?.serverObjectIds?.length,
    });

    // Get RPC URL
    const rpcUrl = network === "mainnet"
      ? getFullnodeUrl("mainnet")
      : getFullnodeUrl("testnet");

    this.suiClient = new SuiClient({ url: rpcUrl });

    // Use canonical servers if not explicitly provided
    const serverObjectIds = config?.serverObjectIds || (
      network === "mainnet"
        ? Array.from(CANONICAL_SEAL_SERVERS_MAINNET)
        : Array.from(CANONICAL_SEAL_SERVERS_TESTNET)
    );

    // Validate
    if (!Array.isArray(serverObjectIds) || serverObjectIds.length === 0) {
      throw new Error(
        `No Seal servers configured for ${network}. ` +
        `Please add server IDs to CANONICAL_SEAL_SERVERS_${network.toUpperCase()}`
      );
    }

    console.log("[SEAL] Using canonical servers:", {
      network,
      serverCount: serverObjectIds.length,
      servers: serverObjectIds,
    });

    // Create server configs
    const serverConfigs = serverObjectIds.map((id) => ({
      objectId: id,
      weight: 1,
    }));

    // Initialize Seal client with canonical servers
    // NOTE: This client is used for ENCRYPTION
    // For DECRYPTION, we dynamically create a client based on encrypted object metadata
    this.client = new SealClient({
      suiClient: this.suiClient,
      serverConfigs,
      verifyKeyServers: false, // Set to false to avoid verification issues during init
    });

    // Set whitelist package ID
    this.whitelistPackageId = config?.whitelistPackageId
      || (network === "mainnet"
        ? MAINNET_WHITELIST_PACKAGE_ID
        : TESTNET_WHITELIST_PACKAGE_ID);

    console.log("[SEAL] SealService initialized:", {
      serverCount: serverConfigs.length,
      whitelistPackageId: this.whitelistPackageId,
      note: "Decryption will use dynamic server matching",
    });
  }

  /**
   * Encrypt data using Seal with whitelist access control
   * The ID format for whitelist: [packageId][whitelistObjectId][nonce]
   * Seal automatically prepends the packageId, so we pass [whitelistObjectId][nonce]
   * Based on whitelist.move: check_policy uses wl.id.to_bytes() as prefix
   * @param whitelistObjectId - The whitelist object ID (hex string)
   * @param nonce - Random nonce for this encryption
   * @param data - Data to encrypt
   * @returns Encrypted bytes and backup key
   */
  async encrypt(
    whitelistObjectId: string,
    nonce: string,
    data: Uint8Array,
  ): Promise<{ encryptedBytes: Uint8Array; backupKey: Uint8Array }> {
    console.log("[SEAL] Starting encrypt with canonical servers:", {
      dataLength: data.length,
      whitelistObjectId,
      nonce,
    });

    // Construct the ID: [whitelistObjectId][nonce] as bytes
    // Seal prepends packageId automatically
    // The Move code checks: wl.id.to_bytes() as prefix, so we use the object ID
    const cleanWhitelistObjectId = whitelistObjectId.startsWith("0x")
      ? whitelistObjectId.slice(2)
      : whitelistObjectId;

    // Convert whitelist object ID (hex) and nonce (string) to bytes
    const whitelistObjectIdBytes = fromHex(cleanWhitelistObjectId);
    const nonceBytes = new TextEncoder().encode(nonce);
    const idBytes = new Uint8Array([...whitelistObjectIdBytes, ...nonceBytes]);

    // Convert to hex string for Seal SDK
    const id = Array.from(idBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    console.log("[SEAL] Encrypting with canonical servers (threshold: 1)");

    const { encryptedObject: encryptedBytes, key: backupKey } =
      await this.client.encrypt({
        threshold: 1,
        packageId: this.whitelistPackageId,
        id: id,
        data,
      });

    console.log("[SEAL] Encrypt successful:", {
      encryptedLength: encryptedBytes.length,
      backupKeyLength: backupKey.length,
    });

    // ===== DIAGNOSTIC LOGGING FOR ENCRYPTION OUTPUT =====
    console.log("[SEAL] ===== ENCRYPTION OUTPUT ANALYSIS =====");
    console.log("[SEAL] Encrypted length:", encryptedBytes.length);
    console.log("[SEAL] First 32 bytes (hex):",
      Array.from(encryptedBytes.slice(0, 32))
        .map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log("[SEAL] Last 16 bytes (hex):",
      Array.from(encryptedBytes.slice(-16))
        .map(b => b.toString(16).padStart(2, '0')).join(' '));

    // Verify it can be parsed immediately after encryption
    try {
      const testParse = EncryptedObject.parse(encryptedBytes);
      console.log("[SEAL] ✅ Can parse immediately after encrypt");
      console.log("[SEAL] Parsed metadata:", {
        threshold: testParse.threshold,
        servicesCount: testParse.services.length,
      });
    } catch (parseErr) {
      console.error("[SEAL] ❌ CANNOT parse immediately after encrypt:", parseErr);
    }
    console.log("[SEAL] ========================================");

    return { encryptedBytes, backupKey };
  }

  /**
   * Create a session key for the user
   * The user must sign the personal message with their wallet
   * @param address - User's Sui address
   * @param signPersonalMessage - Function to sign personal message (from wallet)
   * @returns Session key
   */
  async createSessionKey(
    address: string,
    signPersonalMessage: (message: Uint8Array) => Promise<string>,
  ): Promise<SessionKey> {
    const sessionKey = await SessionKey.create({
      address: address,
      packageId: this.whitelistPackageId,
      ttlMin: 10, // TTL of 10 minutes
      suiClient: this.suiClient,
    });

    const message = sessionKey.getPersonalMessage();
    const signature = await signPersonalMessage(message);
    sessionKey.setPersonalMessageSignature(signature);

    return sessionKey;
  }

  /**
   * Decrypt data using Seal with whitelist access control
   *
   * IMPORTANT: This method dynamically creates a SealClient based on the servers
   * used during encryption. This ensures compatibility regardless of which servers
   * the freelancer used to encrypt the data.
   *
   * @param encryptedBytes - Encrypted data
   * @param sessionKey - User's session key
   * @param whitelistObjectId - The whitelist object ID (hex string)
   * @param nonce - Nonce used during encryption
   * @returns Decrypted bytes
   */
  async decrypt(
    encryptedBytes: Uint8Array,
    sessionKey: SessionKey,
    whitelistObjectId: string,
    nonce: string,
  ): Promise<Uint8Array> {
    console.log("[SEAL] Starting decrypt:", {
      encryptedBytesLength: encryptedBytes.length,
      whitelistObjectId,
      nonce,
    });

    // STEP 1: Parse encrypted object to discover which servers were used during encryption
    try {
      const encryptedObject = EncryptedObject.parse(encryptedBytes);
      const requiredServerIds = encryptedObject.services.map(([id, _]) => id);

      console.log("[SEAL] Encrypted object metadata:", {
        threshold: encryptedObject.threshold,
        requiredServers: requiredServerIds,
        requiredServerCount: requiredServerIds.length,
      });

      // STEP 2: Create a new SealClient with the exact servers from the encrypted object
      // This ensures we can decrypt regardless of which servers were used for encryption
      console.log("[SEAL] Creating decryption client with required servers");

      const decryptClient = new SealClient({
        suiClient: this.suiClient,
        serverConfigs: requiredServerIds.map(id => ({
          objectId: id,
          weight: 1
        })),
        verifyKeyServers: false, // Disable for now to avoid verification issues
      });

      // STEP 3: Construct ID bytes (same as in encrypt)
      // [whitelistObjectId][nonce] as bytes
      const cleanWhitelistObjectId = whitelistObjectId.startsWith("0x")
        ? whitelistObjectId.slice(2)
        : whitelistObjectId;

      const whitelistObjectIdBytes = fromHex(cleanWhitelistObjectId);
      const nonceBytes = new TextEncoder().encode(nonce);
      const idBytes = new Uint8Array([...whitelistObjectIdBytes, ...nonceBytes]);

      console.log("[SEAL] Constructed ID bytes:", {
        idLength: idBytes.length,
        idHex: Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join(''),
      });

      // STEP 4: Build seal_approve transaction
      // Based on whitelist.move: entry fun seal_approve(id: vector<u8>, wl: &Whitelist, ctx: &TxContext)
      const tx = new Transaction();
      tx.moveCall({
        target: `${this.whitelistPackageId}::whitelist::seal_approve`,
        arguments: [
          tx.pure.vector("u8", Array.from(idBytes)),
          tx.object(whitelistObjectId), // Whitelist shared object
        ],
      });

      const txBytes = await tx.build({
        client: this.suiClient,
        onlyTransactionKind: true,
      }) as any;

      console.log("[SEAL] Calling SealClient.decrypt() with dynamic client...");

      // STEP 5: Decrypt with the matched client
      const decryptedBytes = await decryptClient.decrypt({
        data: encryptedBytes,
        sessionKey,
        txBytes,
      });

      console.log("[SEAL] Decrypt successful, length:", decryptedBytes.length);
      return decryptedBytes;

    } catch (error) {
      console.error("[SEAL] Decrypt failed:", error);

      // ===== DIAGNOSTIC LOGGING FOR PARSE FAILURE =====
      console.error("[SEAL] ===== PARSE FAILURE ANALYSIS =====");
      console.error("[SEAL] Parse error:", error);
      console.error("[SEAL] Encrypted bytes length:", encryptedBytes.length);
      console.error("[SEAL] First 64 bytes (hex):",
        Array.from(encryptedBytes.slice(0, 64))
          .map(b => b.toString(16).padStart(2, '0')).join(' '));

      // Try to identify BCS length header value
      if (encryptedBytes.length >= 4) {
        const view = new DataView(encryptedBytes.buffer, encryptedBytes.byteOffset, 4);
        const possibleLength = view.getUint32(0, true); // little-endian
        console.error("[SEAL] First 4 bytes as u32 (little-endian):", possibleLength);
        console.error("[SEAL] This might be why it tried to allocate that many bytes");
      }
      console.error("[SEAL] =====================================");

      // Enhanced error message
      if (error instanceof Error && error.message.includes("Invalid threshold")) {
        throw new Error(
          `Seal decryption failed: Could not match encryption servers. ` +
          `This may happen if the encrypted data was created with different key servers. ` +
          `Original error: ${error.message}`
        );
      }

      throw error;
    }
  }

  /**
   * Get the Sui client
   */
  getSuiClient(): SuiClient {
    return this.suiClient;
  }

  /**
   * Get the whitelist package ID
   */
  getWhitelistPackageId(): string {
    return this.whitelistPackageId;
  }
}

/**
 * Factory function to create SealService
 */
export function createSealService(config?: SealConfig): SealService {
  return new SealService(config);
}
