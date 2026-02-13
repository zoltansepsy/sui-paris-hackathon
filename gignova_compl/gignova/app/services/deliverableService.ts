/**
 * Deliverable Service
 *
 * Orchestrates the upload, encryption, download, and decryption of job deliverables
 * using Walrus (decentralized storage) and Seal (identity-based encryption).
 *
 * Flow:
 * 1. Freelancer creates whitelist (owns the Cap)
 * 2. Freelancer encrypts file with Seal using whitelist
 * 3. Freelancer uploads encrypted data to Walrus
 * 4. Freelancer submits milestone with all metadata (Cap transferred to DeliverableEscrow)
 * 5. Client reviews preview URL
 * 6. Client approves milestone → Contract auto-adds client to whitelist
 * 7. Client can now decrypt and download the deliverable
 */

import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { SessionKey, EncryptedObject } from "@mysten/seal";
import { v4 as uuidv4 } from "uuid";
import { WalrusService, createWalrusService } from "./walrusServiceSDK";
import { SealService, createSealService, SEAL_TESTNET_SERVERS, SEAL_MAINNET_SERVERS } from "./sealService";
import { WhitelistService, createWhitelistService } from "./whitelistService";

// Performance timing utility for debugging download delays
const withTiming = async <T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  const start = performance.now();
  console.log(`[DELIVERABLE TIMING] ${operation} - START`);
  try {
    const result = await fn();
    const duration = (performance.now() - start).toFixed(0);
    console.log(`[DELIVERABLE TIMING] ${operation} - SUCCESS (${duration}ms)`);
    return result;
  } catch (error: any) {
    const duration = (performance.now() - start).toFixed(0);
    console.error(`[DELIVERABLE TIMING] ${operation} - FAILED (${duration}ms)`, {
      error: error?.message,
      type: error?.constructor?.name,
    });
    throw error;
  }
};

/**
 * Deliverable submission data stored on-chain in the milestone
 */
export interface DeliverableSubmission {
  /** Encrypted blob ID on Walrus */
  encryptedBlobId: string;
  /** Preview URL for client review (e.g., deployed application URL) */
  previewUrl: string;
  /** Whitelist object ID for Seal access control */
  whitelistId: string;
  /** Whitelist Cap object ID (transferred to DeliverableEscrow) */
  whitelistCapId: string;
  /** Encryption nonce (unique per submission) */
  nonce: string;
  /** Original file name for display */
  originalFileName: string;
  /** Original file size in bytes */
  originalFileSize: number;
}

/**
 * Result from the upload and encrypt flow
 */
export interface UploadResult {
  submission: DeliverableSubmission;
  /** Transaction to submit the milestone (caller executes this) */
  submitMilestoneTx?: Transaction;
}

/**
 * Progress callback for upload/download operations
 */
export type ProgressCallback = (stage: string, progress: number) => void;

/**
 * Deliverable Service Configuration
 */
export interface DeliverableServiceConfig {
  network?: "testnet" | "mainnet";
  packageId: string;
  sealServerName?: keyof typeof SEAL_TESTNET_SERVERS | keyof typeof SEAL_MAINNET_SERVERS;
}

/**
 * Deliverable Service
 *
 * Orchestrates Walrus storage and Seal encryption for secure job deliverables.
 */
export class DeliverableService {
  private walrusService: WalrusService;
  private _sealService: SealService | null = null;
  private whitelistService: WhitelistService;
  private suiClient: SuiClient;
  private packageId: string;
  private network: "testnet" | "mainnet";
  private sealServerObjectId: string;

  constructor(suiClient: SuiClient, config: DeliverableServiceConfig) {
    this.network = config.network || "testnet";
    this.packageId = config.packageId;
    this.suiClient = suiClient;

    // Store Seal config for lazy initialization - select servers based on network
    const serverMap = this.network === "mainnet" ? SEAL_MAINNET_SERVERS : SEAL_TESTNET_SERVERS;

    console.log("[DELIVERABLE] Seal server configuration:", {
      network: this.network,
      requestedServerName: config.sealServerName,
      availableServers: Object.keys(serverMap),
    });

    this.sealServerObjectId = config.sealServerName
      ? serverMap[config.sealServerName as keyof typeof serverMap]
      : (this.network === "mainnet" ? SEAL_MAINNET_SERVERS["Mysten Mainnet 1"] : SEAL_TESTNET_SERVERS["Mysten Testnet 1"]);

    // Enhanced validation
    if (!this.sealServerObjectId || typeof this.sealServerObjectId !== 'string') {
      throw new Error(
        `Invalid Seal server configuration: ${config.sealServerName || 'undefined'}. ` +
        `Network: ${this.network}. ` +
        `Must be one of: ${Object.keys(serverMap).join(', ')}`
      );
    }

    // Check for placeholder values
    if (this.sealServerObjectId.includes("TODO")) {
      throw new Error(
        `Seal server ID is a placeholder value: ${this.sealServerObjectId}. ` +
        `Network: ${this.network}. ` +
        `Server name: ${config.sealServerName || 'default'}. ` +
        `Please configure actual server IDs for ${this.network}.`
      );
    }

    // Validate Sui object ID format (0x followed by 64 hex chars)
    const objectIdRegex = /^0x[a-fA-F0-9]{64}$/;
    if (!objectIdRegex.test(this.sealServerObjectId)) {
      throw new Error(
        `Invalid Sui object ID format for Seal server: ${this.sealServerObjectId}. ` +
        `Network: ${this.network}. ` +
        `Server name: ${config.sealServerName || 'default'}.`
      );
    }

    console.log("[DELIVERABLE] Selected Seal server:", {
      serverId: this.sealServerObjectId,
      serverName: config.sealServerName || 'default',
    });

    // Initialize Walrus service
    this.walrusService = createWalrusService({
      network: this.network,
      epochs: 10, // ~30 days on testnet
      deletable: false, // Deliverables should be permanent
    });

    // Initialize Whitelist service
    this.whitelistService = createWhitelistService(suiClient, config.packageId);

    // Note: SealService is lazily initialized to avoid WASM loading issues during SSR/component mount
  }

  /**
   * Get SealService with lazy initialization
   * This defers WASM loading until encryption/decryption is actually needed
   *
   * NOTE: We no longer pass serverObjectIds here. The SealService will use
   * the canonical server list by default (CANONICAL_SEAL_SERVERS_TESTNET/MAINNET).
   * For decryption, the service dynamically creates a client based on the
   * encrypted object's server metadata.
   */
  private get sealService(): SealService {
    if (!this._sealService) {
      console.log("[DELIVERABLE] Lazy initializing SealService:", {
        network: this.network,
        packageId: this.packageId,
      });

      // Use canonical servers - no need to pass serverObjectIds
      // SealService will use CANONICAL_SEAL_SERVERS by default
      this._sealService = createSealService({
        network: this.network,
        whitelistPackageId: this.packageId,
        // serverObjectIds omitted - will use canonical list from constants
      });
    }
    return this._sealService;
  }

  /**
   * Upload and encrypt a deliverable file
   *
   * This creates a whitelist, encrypts the file with Seal, uploads to Walrus,
   * and returns all the data needed to submit the milestone.
   *
   * @param file - The file to upload
   * @param previewUrl - Preview URL for client review (e.g., https://my-app.vercel.app)
   * @param ownerAddress - Freelancer's Sui address (whitelist owner)
   * @param signAndExecute - Function to sign and execute transactions
   * @param onProgress - Optional progress callback
   * @returns Upload result with submission data
   */
  async uploadAndEncrypt(
    file: File,
    previewUrl: string,
    ownerAddress: string,
    signAndExecute: (params: { transaction: Transaction }) => Promise<{ digest: string }>,
    onProgress?: ProgressCallback,
  ): Promise<UploadResult> {
    const totalStartTime = Date.now();

    console.log("[DELIVERABLE] ========================================");
    console.log("[DELIVERABLE] Starting uploadAndEncrypt flow");
    console.log("[DELIVERABLE] ========================================");
    console.log("[DELIVERABLE] Input parameters:", {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      previewUrl,
      ownerAddress,
      timestamp: new Date().toISOString(),
    });

    onProgress?.("Creating whitelist", 10);

    // Step 1: Create whitelist (freelancer owns the Cap)
    console.log("[DELIVERABLE] Step 1: Creating whitelist...");
    const whitelistStart = Date.now();
    const createWhitelistTx = this.whitelistService.createWhitelistTransaction();
    const { digest: createDigest } = await signAndExecute({ transaction: createWhitelistTx });

    // Wait for whitelist creation and get object IDs
    const { capId, whitelistId } = await this.whitelistService.waitForTransactionAndGetCreatedObjects(createDigest);
    console.log("[DELIVERABLE] Whitelist created:", {
      capId,
      whitelistId,
      duration: `${Date.now() - whitelistStart}ms`,
    });

    if (!capId || !whitelistId) {
      throw new Error("Failed to create whitelist: could not find Cap or Whitelist objects");
    }

    onProgress?.("Reading file", 20);

    // Step 2: Read file contents
    console.log("[DELIVERABLE] Step 2: Reading file...");
    const readStart = Date.now();
    const fileData = await this.readFileAsBytes(file);
    console.log("[DELIVERABLE] File read complete:", {
      bytesRead: fileData.length,
      duration: `${Date.now() - readStart}ms`,
    });

    onProgress?.("Encrypting file", 30);

    // Step 3: Generate unique nonce and encrypt with Seal
    console.log("[DELIVERABLE] Step 3: Encrypting with Seal...");
    const encryptStart = Date.now();
    const nonce = uuidv4();
    console.log("[DELIVERABLE] Generated nonce:", nonce);
    const { encryptedBytes } = await this.sealService.encrypt(whitelistId, nonce, fileData);
    console.log("[DELIVERABLE] Encryption complete:", {
      originalSize: fileData.length,
      encryptedSize: encryptedBytes.length,
      duration: `${Date.now() - encryptStart}ms`,
    });

    onProgress?.("Uploading to Walrus", 50);

    // Step 4: Upload encrypted data to Walrus using flow (browser-safe)
    console.log("[DELIVERABLE] Step 4: Starting Walrus upload...");
    const encryptedBlobId = await this.uploadToWalrus(
      encryptedBytes,
      file.name,
      signAndExecute,
      ownerAddress,
      onProgress,
    );

    onProgress?.("Complete", 100);

    // Return submission data
    const submission: DeliverableSubmission = {
      encryptedBlobId,
      previewUrl,
      whitelistId,
      whitelistCapId: capId,
      nonce,
      originalFileName: file.name,
      originalFileSize: file.size,
    };

    console.log("[DELIVERABLE] ========================================");
    console.log("[DELIVERABLE] uploadAndEncrypt COMPLETE");
    console.log("[DELIVERABLE] ========================================");
    console.log("[DELIVERABLE] Final submission:", {
      encryptedBlobId,
      whitelistId,
      nonce,
      totalDuration: `${Date.now() - totalStartTime}ms`,
      timestamp: new Date().toISOString(),
    });

    return { submission };
  }

  /**
   * Upload encrypted bytes to Walrus using the flow API (browser-safe)
   *
   * IMPORTANT: Must wait for transaction confirmation before proceeding to upload step.
   * Storage nodes verify the blob is registered on-chain before accepting data.
   */
  private async uploadToWalrus(
    encryptedBytes: Uint8Array,
    fileName: string,
    signAndExecute: (params: { transaction: Transaction }) => Promise<{ digest: string }>,
    ownerAddress: string,
    onProgress?: ProgressCallback,
  ): Promise<string> {
    const uploadStartTime = Date.now();

    console.log("[DELIVERABLE] ========== Starting Walrus Upload ==========");
    console.log("[DELIVERABLE] Upload parameters:", {
      fileName,
      bytesSize: encryptedBytes.length,
      ownerAddress,
      timestamp: new Date().toISOString(),
    });

    // Use uploadWithFlow for browser environment to avoid popup blocking
    const flow = this.walrusService.uploadWithFlow(
      [
        {
          contents: encryptedBytes,
          identifier: fileName,
          tags: {
            "content-type": "application/octet-stream",
            encrypted: "seal",
          },
        },
      ],
      {
        epochs: 10,
        deletable: false,
      },
    );

    // Step 1: Encode the file
    console.log("[DELIVERABLE] Step 1: Encoding file...");
    onProgress?.("Encoding file", 55);
    const encodeStart = Date.now();
    await flow.encode();
    console.log("[DELIVERABLE] Encode complete:", {
      duration: `${Date.now() - encodeStart}ms`,
    });

    // Step 2: Register the blob (requires transaction)
    console.log("[DELIVERABLE] Step 2: Creating register transaction...");
    onProgress?.("Registering blob", 60);
    const registerTx = flow.register({
      owner: ownerAddress,
      epochs: 10,
      deletable: false,
    });
    console.log("[DELIVERABLE] Register transaction created, executing...");

    const txStart = Date.now();
    const { digest: registerDigest } = await signAndExecute({ transaction: registerTx });
    // Transaction is confirmed when signAndExecute returns (wrapper includes waitForTransaction)

    console.log("[DELIVERABLE] Register transaction confirmed:", {
      digest: registerDigest,
      digestLength: registerDigest?.length,
      duration: `${Date.now() - txStart}ms`,
      timestamp: new Date().toISOString(),
    });

    // Verify the transaction is visible on-chain via our client
    console.log("[DELIVERABLE] Verifying blob registration on-chain...");
    try {
      const txDetails = await this.suiClient.getTransactionBlock({
        digest: registerDigest,
        options: { showEffects: true, showEvents: true, showObjectChanges: true },
      });
      console.log("[DELIVERABLE] Transaction verified on-chain:", {
        digest: registerDigest,
        status: txDetails.effects?.status,
        gasUsed: txDetails.effects?.gasUsed,
        objectChangesCount: txDetails.objectChanges?.length || 0,
        eventsCount: txDetails.events?.length || 0,
        events: txDetails.events?.map((e) => ({
          type: e.type,
          parsedJson: e.parsedJson,
        })),
      });
    } catch (verifyErr) {
      console.error("[DELIVERABLE] Failed to verify transaction on-chain:", {
        error: verifyErr,
        digest: registerDigest,
      });
    }

    // Add propagation delay to allow transaction to sync across all RPC nodes
    // This is necessary because the Walrus SDK uses its own SuiJsonRpcClient internally
    // which may be connected to a different RPC node than the one used for waitForTransaction
    const NETWORK_SYNC_DELAY = 5000; // Increased from 3s to 5s
    console.log("[DELIVERABLE] Step 3: Waiting for network sync...");
    console.log(`[DELIVERABLE] Delay: ${NETWORK_SYNC_DELAY}ms to allow RPC propagation across nodes`);
    onProgress?.("Waiting for network sync", 65);
    await new Promise((resolve) => setTimeout(resolve, NETWORK_SYNC_DELAY));
    console.log("[DELIVERABLE] Sync delay complete");

    // Step 4: Upload to storage nodes (blob is now registered on-chain)
    console.log("[DELIVERABLE] Step 4: Uploading to storage nodes...");
    console.log("[DELIVERABLE] Upload parameters:", {
      digest: registerDigest,
      digestType: typeof registerDigest,
      digestLength: registerDigest?.length,
      digestFirstChars: registerDigest?.substring(0, 20) + "...",
    });
    onProgress?.("Uploading to storage nodes", 70);

    const uploadToNodesStart = Date.now();
    try {
      await flow.upload({ digest: registerDigest });
      console.log("[DELIVERABLE] Upload to storage nodes SUCCESS:", {
        duration: `${Date.now() - uploadToNodesStart}ms`,
        timestamp: new Date().toISOString(),
      });
    } catch (uploadErr) {
      console.error("[DELIVERABLE] ========== UPLOAD FAILED ==========");
      console.error("[DELIVERABLE] Upload to storage nodes FAILED:", {
        duration: `${Date.now() - uploadToNodesStart}ms`,
        error: uploadErr,
        errorMessage: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
        errorName: uploadErr instanceof Error ? uploadErr.name : "unknown",
        errorStack: uploadErr instanceof Error ? uploadErr.stack : undefined,
        digest: registerDigest,
        timeSinceStart: `${Date.now() - uploadStartTime}ms`,
        timestamp: new Date().toISOString(),
      });
      throw new Error(
        `Failed to upload to Walrus storage nodes: ${uploadErr instanceof Error ? uploadErr.message : "Unknown error"}`,
      );
    }

    // Step 5: Certify the blob (requires transaction)
    console.log("[DELIVERABLE] Step 5: Creating certify transaction...");
    onProgress?.("Certifying blob", 85);
    const certifyStart = Date.now();
    const certifyTx = flow.certify();
    console.log("[DELIVERABLE] Certify transaction created, executing...");
    await signAndExecute({ transaction: certifyTx });
    // Transaction is confirmed when signAndExecute returns (wrapper includes waitForTransaction)
    console.log("[DELIVERABLE] Certify transaction confirmed:", {
      duration: `${Date.now() - certifyStart}ms`,
    });

    // Step 6: Get the blob ID
    console.log("[DELIVERABLE] Step 6: Getting blob ID...");
    onProgress?.("Finalizing", 95);
    const files = await flow.listFiles();

    if (!files || files.length === 0) {
      console.error("[DELIVERABLE] No files returned from listFiles()");
      throw new Error("Failed to upload to Walrus: no files returned");
    }

    const blobId = files[0].blobId;
    console.log("[DELIVERABLE] ========== Upload Complete ==========");
    console.log("[DELIVERABLE] Final result:", {
      blobId,
      totalDuration: `${Date.now() - uploadStartTime}ms`,
      timestamp: new Date().toISOString(),
    });

    return blobId;
  }

  /**
   * Download and decrypt a deliverable
   *
   * This downloads the encrypted blob from Walrus and decrypts it using Seal.
   * Requires the client to be on the whitelist (added during milestone approval).
   *
   * @param submission - The deliverable submission data (from milestone)
   * @param sessionKey - User's Seal session key
   * @param onProgress - Optional progress callback
   * @returns Decrypted file as Blob
   */
  async downloadAndDecrypt(
    submission: DeliverableSubmission,
    sessionKey: SessionKey,
    onProgress?: ProgressCallback,
  ): Promise<Blob> {
    console.log(`[DELIVERABLE] downloadAndDecrypt START`, {
      blobId: submission.encryptedBlobId,
      fileName: submission.originalFileName,
      whitelistId: submission.whitelistId,
      nonce: submission.nonce,
    });

    const overallStart = performance.now();

    try {
      // Validate inputs
      if (!submission.encryptedBlobId || typeof submission.encryptedBlobId !== 'string') {
        throw new Error(`Invalid blob ID: ${submission.encryptedBlobId}`);
      }
      if (!submission.whitelistId || typeof submission.whitelistId !== 'string' || !submission.whitelistId.startsWith('0x')) {
        throw new Error(`Invalid whitelist ID: ${submission.whitelistId}`);
      }
      if (!submission.nonce || typeof submission.nonce !== 'string') {
        throw new Error(`Invalid nonce: ${submission.nonce}`);
      }
      if (!sessionKey) {
        throw new Error("Session key is required for decryption");
      }

      // PHASE 1: Download from Walrus (Direct HTTP - FAST!)
      onProgress?.("Downloading from Walrus", 20);

      const encryptedBytes = await withTiming(
        `getFileFromQuiltDirect(${submission.originalFileName})`,
        () => this.walrusService.getFileFromQuiltDirect(
          submission.encryptedBlobId,
          submission.originalFileName
        )
      );

      console.log(`[DELIVERABLE] Downloaded encrypted bytes (direct HTTP)`, {
        length: encryptedBytes.length,
        firstBytes: Array.from(encryptedBytes.slice(0, 16))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" "),
      });

      // PHASE 2: Verify parseable
      onProgress?.("Verifying encryption format", 40);

      try {
        const parsed = EncryptedObject.parse(encryptedBytes);
        console.log(`[DELIVERABLE] ✅ EncryptedObject parse successful`, {
          threshold: parsed.threshold,
          servicesCount: parsed.services.length,
        });
      } catch (parseError: any) {
        console.error(`[DELIVERABLE] ❌ EncryptedObject parse FAILED`, {
          error: parseError?.message,
          bytesLength: encryptedBytes.length,
          firstBytes: Array.from(encryptedBytes.slice(0, 32))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" "),
        });
        throw new Error(
          `Downloaded bytes are not valid EncryptedObject format: ${parseError?.message}`
        );
      }

      // PHASE 3: Decrypt
      onProgress?.("Decrypting", 60);

      const decryptedBytes = await withTiming(
        "sealService.decrypt",
        () => this.sealService.decrypt(
          encryptedBytes,
          sessionKey,
          submission.whitelistId,
          submission.nonce,
        )
      );

      console.log(`[DELIVERABLE] Decryption successful`, {
        decryptedLength: decryptedBytes.length,
        originalFileName: submission.originalFileName,
      });

      // PHASE 4: Create blob
      onProgress?.("Complete", 100);

      const blob = new Blob([new Uint8Array(decryptedBytes)], {
        type: this.getMimeType(submission.originalFileName),
      });

      const totalDuration = (performance.now() - overallStart).toFixed(0);
      console.log(`[DELIVERABLE] downloadAndDecrypt COMPLETE`, {
        totalDuration: `${totalDuration}ms`,
        totalSeconds: (parseFloat(totalDuration) / 1000).toFixed(1) + 's',
        phases: {
          download: "see WALRUS TIMING logs (getFileFromQuiltDirect)",
          verification: "~10ms (EncryptedObject.parse)",
          decrypt: "see DELIVERABLE TIMING logs (sealService.decrypt)",
        },
        performanceTarget: "< 10 seconds",
        performanceActual: parseFloat(totalDuration) < 10000 ? "✅ PASS" : "⚠️ SLOW",
      });

      return blob;

    } catch (error: any) {
      const totalDuration = (performance.now() - overallStart).toFixed(0);
      console.error(`[DELIVERABLE] downloadAndDecrypt FAILED`, {
        totalDuration: `${totalDuration}ms`,
        error: error?.message,
        errorType: error?.constructor?.name,
        stack: error?.stack,
      });
      throw error;
    }
  }

  /**
   * Create a session key for decryption
   *
   * The session key allows decryption for 10 minutes without repeated wallet signatures.
   *
   * @param address - User's Sui address
   * @param signPersonalMessage - Function to sign personal message (from wallet)
   * @returns Session key
   */
  async createSessionKey(
    address: string,
    signPersonalMessage: (params: { message: Uint8Array }) => Promise<{ signature: string }>,
  ): Promise<SessionKey> {
    // Wrapper to match SealService's expected signature
    const signWrapper = async (message: Uint8Array): Promise<string> => {
      const { signature } = await signPersonalMessage({ message });
      return signature;
    };

    return this.sealService.createSessionKey(address, signWrapper);
  }

  /**
   * Helper: Read a File as Uint8Array
   */
  private async readFileAsBytes(file: File): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(reader.result));
        } else {
          reject(new Error("Failed to read file as ArrayBuffer"));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Helper: Get MIME type from file extension
   */
  private getMimeType(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      zip: "application/zip",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      mp4: "video/mp4",
      mp3: "audio/mpeg",
      json: "application/json",
      txt: "text/plain",
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      ts: "application/typescript",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  }

  /**
   * Helper: Format file size for display
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  /**
   * Helper: Trigger browser download
   */
  static triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Factory function to create DeliverableService
 */
export function createDeliverableService(
  suiClient: SuiClient,
  config: DeliverableServiceConfig,
): DeliverableService {
  return new DeliverableService(suiClient, config);
}
