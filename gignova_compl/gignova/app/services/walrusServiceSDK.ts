/**
 * Walrus Service - Official SDK Version with Upload Relay
 *
 * This service uses the official @mysten/walrus TypeScript SDK with Upload Relay support.
 * Upload relay bypasses individual storage nodes and uses Mysten Labs' aggregator service,
 * which handles node failures, certificate issues, and routing automatically.
 *
 * Documentation: https://sdk.mystenlabs.com/walrus
 * Upload Relay Blog: https://www.walrus.xyz/blog/typescript-sdk-upload-relay-upgrade
 *
 * Installation:
 * pnpm install @mysten/walrus@^0.8.6 @mysten/sui
 */

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { WalrusFile, WalrusClient } from "@mysten/walrus";

// Walrus Aggregator URL for direct blob downloads (same as CLI uses)
const WALRUS_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space/v1";

// Performance timing utility for debugging download delays
const withTiming = async <T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  const start = performance.now();
  console.log(`[WALRUS TIMING] ${operation} - START`);
  try {
    const result = await fn();
    const duration = (performance.now() - start).toFixed(0);
    console.log(`[WALRUS TIMING] ${operation} - SUCCESS (${duration}ms)`);
    return result;
  } catch (error: any) {
    const duration = (performance.now() - start).toFixed(0);
    console.error(`[WALRUS TIMING] ${operation} - FAILED (${duration}ms)`, {
      error,
      errorType: error?.constructor?.name,
      errorMessage: error?.message,
      stack: error?.stack,
    });
    throw error;
  }
};

export interface WalrusConfig {
  network?: "testnet" | "mainnet";
  epochs?: number;
  deletable?: boolean;
}

/**
 * Walrus Service using Official SDK
 *
 * Follows the official pattern from https://sdk.mystenlabs.com/walrus
 * IMPORTANT: Must use SuiJsonRpcClient (not SuiClient) and include network property
 */
export class WalrusService {
  private client: any; // SuiJsonRpcClient extended with walrus()
  private defaultEpochs: number;
  private defaultDeletable: boolean;

  constructor(config?: WalrusConfig) {
    const network = config?.network || "testnet";

    console.log("[WALRUS] Initializing WalrusService with Upload Relay:", {
      network,
      rpcUrl: getFullnodeUrl(network),
      wasmUrl: "https://unpkg.com/@mysten/walrus-wasm@0.1.1/web/walrus_wasm_bg.wasm",
      uploadRelay: "https://upload-relay.testnet.walrus.space",
      relayTipMax: "1000 MIST (0.000001 SUI)",
    });

    // Create client with Walrus extension using Upload Relay
    // From official docs: https://sdk.mystenlabs.com/walrus
    // Using WalrusClient.experimental_asClientExtension for upload relay support
    this.client = new SuiClient({
      url: getFullnodeUrl(network),
    }).$extend(
      WalrusClient.experimental_asClientExtension({
        network: network,
        wasmUrl:
          "https://unpkg.com/@mysten/walrus-wasm@0.1.1/web/walrus_wasm_bg.wasm",
        // Upload relay configuration - handles node failures automatically
        uploadRelay: {
          host: "https://upload-relay.testnet.walrus.space",
          sendTip: {
            max: 1_000, // 1000 MIST = 0.000001 SUI tip for relay service
          },
        },
        // Add storage node client options for debugging and better error handling
        storageNodeClientOptions: {
          timeout: 60_000, // Increase timeout to 60 seconds
          onError: (error: Error) => {
            console.error("[WALRUS] Storage node error:", {
              message: error.message,
              name: error.name,
              // Capture URL if available (for network errors)
              url: (error as any).url || (error as any).input || "unknown",
              cause: (error as any).cause,
              timestamp: new Date().toISOString(),
            });
          },
        },
      }),
    );

    this.defaultEpochs = config?.epochs || 5;
    this.defaultDeletable =
      config?.deletable !== undefined ? config.deletable : true;
  }

  /**
   * Write a blob directly (low-level API)
   * From official docs: https://sdk.mystenlabs.com/walrus
   */
  async writeBlob(
    blob: Uint8Array,
    options: {
      epochs?: number;
      deletable?: boolean;
      signer: any;
    },
  ): Promise<{ blobId: string; id: string }> {
    const result = await this.client.walrus.writeBlob({
      blob,
      deletable:
        options.deletable !== undefined
          ? options.deletable
          : this.defaultDeletable,
      epochs: options.epochs || this.defaultEpochs,
      signer: options.signer,
    });

    return {
      blobId: result.blobId,
      id: result.id || result.blobId,
    };
  }

  /**
   * Read a blob directly (low-level API)
   * From official docs: https://sdk.mystenlabs.com/walrus
   */
  async readBlob(blobId: string): Promise<Uint8Array> {
    return await this.client.walrus.readBlob({ blobId });
  }

  /**
   * Upload a file using WalrusFile API
   * From official docs: https://sdk.mystenlabs.com/walrus
   *
   * For browser environments, use uploadWithFlow instead to avoid popup blocking
   */
  async upload(
    contents: Uint8Array | Blob | string,
    options: {
      identifier?: string;
      tags?: Record<string, string>;
      epochs?: number;
      deletable?: boolean;
      signer: any;
    },
  ): Promise<{ blobId: string; id: string }> {
    // Convert string to Uint8Array
    const fileContents =
      typeof contents === "string"
        ? new TextEncoder().encode(contents)
        : contents;

    // Create WalrusFile - identifier and tags are optional
    const fileConfig: any = { contents: fileContents };
    if (options.identifier) fileConfig.identifier = options.identifier;
    if (options.tags) fileConfig.tags = options.tags;

    const file = WalrusFile.from(fileConfig);

    // Write using official SDK
    const results = await this.client.walrus.writeFiles({
      files: [file],
      epochs: options.epochs || this.defaultEpochs,
      deletable:
        options.deletable !== undefined
          ? options.deletable
          : this.defaultDeletable,
      signer: options.signer,
    });

    return {
      blobId: results[0].blobId,
      id: results[0].id,
    };
  }

  /**
   * Upload using writeFilesFlow for browser environments
   * This breaks the upload into steps to avoid popup blocking
   * From official docs: https://sdk.mystenlabs.com/walrus
   *
   * Returns a flow object with methods:
   * - encode(): Encodes files (returns Promise<void>)
   * - register(options): Returns transaction to register the blob (needs owner, epochs, deletable)
   * - upload(options): Uploads blob data to storage nodes (needs digest from register)
   * - certify(): Returns transaction to certify the blob after upload
   * - listFiles(): Returns array with blobId and id after completion
   */
  uploadWithFlow(
    files: Array<{
      contents: Uint8Array | Blob | string;
      identifier?: string;
      tags?: Record<string, string>;
    }>,
    options: {
      epochs?: number;
      deletable?: boolean;
    },
  ) {
    // Log flow creation for debugging
    console.log("[WALRUS] Creating upload flow:", {
      fileCount: files.length,
      epochs: options.epochs,
      deletable: options.deletable,
      filesInfo: files.map((f) => ({
        size:
          typeof f.contents === "string"
            ? f.contents.length
            : f.contents instanceof Uint8Array
              ? f.contents.length
              : "blob",
        identifier: f.identifier,
        tags: f.tags,
      })),
      timestamp: new Date().toISOString(),
    });

    // Convert files to WalrusFile format
    const walrusFiles = files.map((file) => {
      const contents =
        typeof file.contents === "string"
          ? new TextEncoder().encode(file.contents)
          : file.contents;

      const fileConfig: any = { contents };
      if (file.identifier) fileConfig.identifier = file.identifier;
      if (file.tags) fileConfig.tags = file.tags;

      return WalrusFile.from(fileConfig);
    });

    // Use writeFilesFlow from Walrus SDK
    const flow = this.client.walrus.writeFilesFlow({
      files: walrusFiles,
    });

    console.log("[WALRUS] Upload flow created successfully");
    return flow;
  }

  /**
   * Upload multiple files to Walrus (more efficient as a single quilt)
   */
  async uploadFiles(
    files: Array<{
      contents: Uint8Array | Blob | string;
      identifier?: string;
      tags?: Record<string, string>;
    }>,
    options: {
      epochs?: number;
      deletable?: boolean;
      signer: any;
    },
  ): Promise<{ blobId: string; id: string }[]> {
    const walrusFiles = files.map((file) => {
      const contents =
        typeof file.contents === "string"
          ? new TextEncoder().encode(file.contents)
          : file.contents;

      const fileConfig: any = { contents };
      if (file.identifier) fileConfig.identifier = file.identifier;
      if (file.tags) fileConfig.tags = file.tags;

      return WalrusFile.from(fileConfig);
    });

    return await this.client.walrus.writeFiles({
      files: walrusFiles,
      epochs: options?.epochs || this.defaultEpochs,
      deletable:
        options?.deletable !== undefined
          ? options.deletable
          : this.defaultDeletable,
      signer: options.signer,
    });
  }

  /**
   * Upload JSON data to Walrus
   *
   * Note: identifier is optional. If not provided, the JSON is stored without a specific identifier.
   */
  async uploadJson(
    data: any,
    options: {
      identifier?: string; // Optional - e.g., 'data.json'
      epochs?: number;
      deletable?: boolean;
      signer: any;
    },
  ): Promise<{ blobId: string; id: string }> {
    const jsonString = JSON.stringify(data);
    return this.upload(jsonString, {
      epochs: options.epochs,
      deletable: options.deletable,
      signer: options.signer,
      identifier: options.identifier, // Optional
      tags: { "content-type": "application/json" },
    });
  }

  /**
   * Get files using WalrusFile API
   * From official docs: https://sdk.mystenlabs.com/walrus
   */
  async getFiles(ids: string[]): Promise<any[]> {
    return await this.client.walrus.getFiles({ ids });
  }

  /**
   * Download and parse as text
   */
  async downloadAsText(id: string): Promise<string> {
    const [file] = await this.client.walrus.getFiles({ ids: [id] });
    return await file.text();
  }

  /**
   * Download and parse as JSON
   */
  async downloadAsJson<T = any>(id: string): Promise<T> {
    const [file] = await this.client.walrus.getFiles({ ids: [id] });
    return await file.json();
  }

  /**
   * Download as bytes
   * Uses aggregator-first approach (same as Walrus CLI) to avoid certificate errors
   */
  async downloadAsBytes(id: string): Promise<Uint8Array> {
    const url = `${WALRUS_AGGREGATOR_URL}/blobs/${id}`;
    console.log(`[WALRUS] downloadAsBytes START`, { id, url });

    return await withTiming(
      `fetch(aggregator/blobs/${id.substring(0, 8)}...)`,
      async () => {
        // Method 1: Aggregator endpoint (PRIMARY - same as CLI)
        try {
          console.log(`[WALRUS] Downloading blob ${id} via aggregator...`);
          const response = await fetch(url, {
            signal: AbortSignal.timeout(60000), // Make timeout explicit
          });

          if (!response.ok) {
            throw new Error(
              `Aggregator returned ${response.status}: ${response.statusText}`
            );
          }

          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          console.log(`[WALRUS] downloadAsBytes COMPLETE`, {
            id,
            bytesLength: bytes.length,
            firstByte: bytes[0]?.toString(16).padStart(2, "0"),
          });

          return bytes;
        } catch (aggregatorError: any) {
          console.error(`[WALRUS] downloadAsBytes ERROR`, {
            id,
            url,
            errorName: aggregatorError?.name,
            errorMessage: aggregatorError?.message,
            isNetworkError: aggregatorError?.message?.includes("fetch"),
            isTimeout: aggregatorError?.name === "TimeoutError",
          });

          // Method 2: SDK getFiles (FALLBACK - original approach)
          console.warn(
            "[WALRUS] Aggregator download failed, falling back to SDK:",
            aggregatorError
          );

          try {
            const [file] = await this.client.walrus.getFiles({ ids: [id] });
            const bytes = await file.bytes();
            console.log(`[WALRUS] ✅ Downloaded via SDK fallback`);
            return bytes;
          } catch (sdkError) {
            console.error("[WALRUS] Both aggregator and SDK failed:", {
              aggregatorError,
              sdkError,
            });
            throw new Error(
              `Failed to download blob: ${aggregatorError instanceof Error ? aggregatorError.message : String(aggregatorError)}`
            );
          }
        }
      }
    );
  }

  /**
   * Get a blob and check if it's a quilt
   */
  async getBlob(blobId: string) {
    return await this.client.walrus.getBlob({ blobId });
  }

  /**
   * Read files from a quilt by identifier
   */
  async getFilesFromQuilt(
    blobId: string,
    identifiers?: string[]
  ): Promise<WalrusFile[]> {
    console.log(`[WALRUS] getFilesFromQuilt START`, { blobId, identifiers });

    // Step 1: Fetch blob metadata
    const blob = await withTiming(
      `getBlob(${blobId.substring(0, 8)}...)`,
      () => this.getBlob(blobId)
    );

    // Step 2: Extract files from Quilt
    const files = (await withTiming(
      `blob.files({ identifiers: [${identifiers?.join(", ")}] })`,
      () => blob.files({ identifiers })
    )) as WalrusFile[];

    console.log(`[WALRUS] getFilesFromQuilt COMPLETE`, {
      blobId,
      filesFound: files.length,
      fileIdentifiers: files.map((f: WalrusFile) => f.getIdentifier()),
    });

    return files;
  }

  /**
   * Read files from a quilt by tags
   */
  async getFilesByTags(blobId: string, tags: Record<string, string>[]) {
    const blob = await this.getBlob(blobId);
    return await blob.files({ tags });
  }

  /**
   * Get file from Quilt using direct HTTP endpoint (FAST!)
   *
   * This method bypasses the SDK's two-step getBlob() → blob.files() process
   * and uses the aggregator's optimized direct file extraction endpoint.
   *
   * Expected performance: 1-3 seconds (vs 20-25s with SDK method)
   *
   * @param blobId - The Quilt blob ID
   * @param identifier - The file identifier within the Quilt
   * @param options - Optional timeout configuration
   * @returns Raw file bytes
   */
  async getFileFromQuiltDirect(
    blobId: string,
    identifier: string,
    options?: { timeout?: number }
  ): Promise<Uint8Array> {
    const url = `${WALRUS_AGGREGATOR_URL}/blobs/by-quilt-id/${blobId}/${identifier}`;
    const timeout = options?.timeout || 30000;

    console.log(`[WALRUS] Direct fetch START`, { blobId, identifier, url });

    return await withTiming(
      `getFileFromQuiltDirect(${identifier})`,
      async () => {
        try {
          // PRIMARY METHOD: Direct HTTP endpoint
          const response = await fetch(url, {
            signal: AbortSignal.timeout(timeout),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          // Log response headers for debugging (contains ETag for caching)
          const headers = {
            etag: response.headers.get("ETag"),
            contentLength: response.headers.get("Content-Length"),
            patchIdentifier: response.headers.get("X-Quilt-Patch-Identifier"),
          };
          console.log(`[WALRUS] Direct fetch response headers:`, headers);

          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          console.log(`[WALRUS] Direct fetch SUCCESS`, {
            bytesLength: bytes.length,
            firstByte: bytes[0]?.toString(16).padStart(2, "0"),
          });

          return bytes;
        } catch (error: any) {
          // FALLBACK: Use SDK method if HTTP fails
          console.warn(
            `[WALRUS] Direct fetch FAILED, falling back to SDK method:`,
            {
              error: error?.message,
              errorType: error?.constructor?.name,
              isTimeout: error?.name === "TimeoutError",
            }
          );

          // Fallback to existing SDK method
          const files = await this.getFilesFromQuilt(blobId, [identifier]);
          if (!files || files.length === 0) {
            throw new Error(`File "${identifier}" not found in quilt`);
          }
          return await files[0].bytes();
        }
      }
    );
  }
}

/**
 * Factory function to create WalrusService
 *
 * IMPORTANT: Uses SuiJsonRpcClient (not SuiClient) as required by Walrus SDK
 * See: https://sdk.mystenlabs.com/walrus
 *
 * @example
 * ```typescript
 * import { createWalrusService } from '@/services';
 *
 * const walrusService = createWalrusService({
 *   network: 'testnet',  // Required for Walrus SDK
 *   epochs: 10,
 *   deletable: true
 * });
 *
 * // Upload a file
 * const file = new TextEncoder().encode('Hello from Walrus!');
 * const { blobId } = await walrusService.writeBlob(file, {
 *   epochs: 10,
 *   deletable: true,
 *   signer: keypair,  // Required - signs blockchain transaction
 * });
 *
 * // Read a file
 * const data = await walrusService.readBlob(blobId);
 * ```
 */
export function createWalrusService(config?: WalrusConfig): WalrusService {
  return new WalrusService(config);
}
