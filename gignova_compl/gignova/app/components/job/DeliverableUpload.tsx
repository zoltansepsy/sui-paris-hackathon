/**
 * Deliverable Upload Component
 *
 * Allows freelancers to upload encrypted deliverables with a preview URL.
 * Uses Walrus for storage and Seal for identity-based encryption.
 *
 * Flow:
 * 1. Freelancer enters preview URL (deployed application)
 * 2. Freelancer selects file to upload
 * 3. Component creates whitelist, encrypts file, uploads to Walrus
 * 4. Returns submission data for milestone submission
 */

"use client";

import { useState, useCallback, useMemo } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient, useSuiClientContext } from "@mysten/dapp-kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileUp,
  Link,
  Lock,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  File,
} from "lucide-react";
import { useNetworkVariable } from "@/networkConfig";
import {
  createDeliverableService,
  DeliverableService,
  DeliverableSubmission,
} from "@/services/deliverableService";

interface DeliverableUploadProps {
  /** Callback when upload completes successfully */
  onUploadComplete: (submission: DeliverableSubmission) => void;
  /** Callback when upload is cancelled */
  onCancel?: () => void;
  /** Optional: disable the component */
  disabled?: boolean;
}

export function DeliverableUpload({
  onUploadComplete,
  onCancel,
  disabled = false,
}: DeliverableUploadProps) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { network } = useSuiClientContext();
  const packageId = useNetworkVariable("jobEscrowPackageId");
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  // Form state
  const [previewUrl, setPreviewUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Initialize deliverable service (only on client-side to avoid SSR WASM issues)
  const deliverableService = useMemo(() => {
    if (typeof window === "undefined") {
      return null as any;
    }
    return createDeliverableService(suiClient, {
      packageId,
      network: network as "testnet" | "mainnet",
      sealServerName: network === "mainnet" ? "Mysten Mainnet 1" : "Mysten Testnet 1",
    });
  }, [suiClient, packageId, network]);

  // Handle file selection
  const handleFileSelect = useCallback((file: File | null) => {
    setSelectedFile(file);
    setError(null);
  }, []);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // Clear selected file
  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setError(null);
  }, []);

  // Validate preview URL
  const isValidUrl = useCallback((url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Progress callback
  const handleProgress = useCallback((stage: string, progress: number) => {
    setUploadStage(stage);
    setUploadProgress(progress);
  }, []);

  // Handle upload
  const handleUpload = async () => {
    if (!currentAccount || !selectedFile || !previewUrl.trim()) {
      setError("Please fill in all required fields");
      return;
    }

    if (!isValidUrl(previewUrl)) {
      setError("Please enter a valid URL (e.g., https://my-app.vercel.app)");
      return;
    }

    if (!deliverableService) {
      setError("Service not initialized. Please refresh the page.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);
    setUploadStage("Preparing");

    try {
      // Create a wrapper that uses callback-style for proper transaction confirmation
      // This matches the working pattern from WalrusUpload.tsx
      // CRITICAL: The callback-style mutate with Promise wrapper ensures proper
      // synchronization with React Query's mutation lifecycle, avoiding 400 errors
      // from Walrus storage nodes that occur when transactions aren't fully propagated
      let transactionCount = 0;
      const executeTransaction = async (params: { transaction: any }): Promise<{ digest: string }> => {
        transactionCount++;
        const txNumber = transactionCount;
        const txStartTime = Date.now();

        console.log(`[TX #${txNumber}] ========== Starting Transaction ==========`);
        console.log(`[TX #${txNumber}] Timestamp:`, new Date().toISOString());

        return new Promise((resolve, reject) => {
          signAndExecute(
            { transaction: params.transaction },
            {
              onSuccess: async ({ digest }) => {
                const submitDuration = Date.now() - txStartTime;
                console.log(`[TX #${txNumber}] Transaction submitted to network:`, {
                  digest,
                  digestLength: digest.length,
                  submitDuration: `${submitDuration}ms`,
                });

                try {
                  // Wait for transaction to be fully confirmed on-chain
                  const waitStart = Date.now();
                  console.log(`[TX #${txNumber}] Waiting for on-chain confirmation...`);

                  const result = await suiClient.waitForTransaction({
                    digest,
                    options: { showEffects: true, showEvents: true },
                  });

                  const waitDuration = Date.now() - waitStart;
                  const totalDuration = Date.now() - txStartTime;

                  console.log(`[TX #${txNumber}] Transaction CONFIRMED:`, {
                    digest,
                    waitDuration: `${waitDuration}ms`,
                    totalDuration: `${totalDuration}ms`,
                    status: result.effects?.status,
                    eventsCount: result.events?.length || 0,
                    timestamp: new Date().toISOString(),
                  });

                  // Log specific events for debugging
                  if (result.events && result.events.length > 0) {
                    console.log(`[TX #${txNumber}] Transaction events:`, result.events.map(e => ({
                      type: e.type,
                      parsedJson: e.parsedJson,
                    })));
                  }

                  // Check for BlobRegistered event specifically
                  const blobEvent = result.events?.find(e => e.type.includes("BlobRegistered"));
                  if (blobEvent) {
                    console.log(`[TX #${txNumber}] BlobRegistered event found:`, blobEvent.parsedJson);
                  }

                  console.log(`[TX #${txNumber}] ========== Transaction Complete ==========`);
                  resolve({ digest });
                } catch (err) {
                  console.error(`[TX #${txNumber}] waitForTransaction FAILED:`, {
                    digest,
                    error: err,
                    errorMessage: err instanceof Error ? err.message : String(err),
                    duration: `${Date.now() - txStartTime}ms`,
                  });
                  reject(err);
                }
              },
              onError: (err) => {
                console.error(`[TX #${txNumber}] Transaction execution FAILED:`, {
                  error: err,
                  errorMessage: err instanceof Error ? err.message : String(err),
                  duration: `${Date.now() - txStartTime}ms`,
                });
                reject(err);
              },
            }
          );
        });
      };

      console.log("[UPLOAD] Starting deliverableService.uploadAndEncrypt...");
      const uploadStart = Date.now();

      const { submission } = await deliverableService.uploadAndEncrypt(
        selectedFile,
        previewUrl.trim(),
        currentAccount.address,
        executeTransaction,
        handleProgress,
      );

      console.log("[UPLOAD] uploadAndEncrypt completed successfully:", {
        totalDuration: `${Date.now() - uploadStart}ms`,
        transactionCount,
        blobId: submission.encryptedBlobId,
      });

      // Success - call callback
      onUploadComplete(submission);
    } catch (err: any) {
      console.error("[UPLOAD] ========== UPLOAD ERROR ==========");
      console.error("[UPLOAD] Error details:", {
        message: err.message,
        name: err.name,
        stack: err.stack,
      });
      setError(err.message || "Failed to upload deliverable");
      setIsUploading(false);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Check if ready to upload
  const canUpload = Boolean(
    currentAccount &&
    selectedFile &&
    previewUrl.trim() &&
    isValidUrl(previewUrl) &&
    !isUploading &&
    !disabled
  );

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          Submit Deliverable
        </CardTitle>
        <CardDescription>
          Upload your work securely. The file will be encrypted and only accessible to the client after approval.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Preview URL Input */}
        <div className="space-y-2">
          <label htmlFor="previewUrl" className="text-sm font-medium flex items-center gap-2">
            <Link className="h-4 w-4" />
            Preview URL
            <span className="text-red-500">*</span>
          </label>
          <Input
            id="previewUrl"
            type="url"
            placeholder="https://my-deployed-app.vercel.app"
            value={previewUrl}
            onChange={(e) => setPreviewUrl(e.target.value)}
            disabled={isUploading || disabled}
            className={!isValidUrl(previewUrl) && previewUrl.trim() ? "border-red-500" : ""}
          />
          <p className="text-xs text-muted-foreground">
            URL where the client can preview your work (e.g., deployed application, demo link)
          </p>
          {previewUrl.trim() && !isValidUrl(previewUrl) && (
            <p className="text-xs text-red-500">Please enter a valid URL</p>
          )}
        </div>

        {/* File Upload Area */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            Deliverable File
            <span className="text-red-500">*</span>
          </label>

          {!selectedFile ? (
            <div
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors duration-200
                ${isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
                ${disabled || isUploading ? "opacity-50 cursor-not-allowed" : ""}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                if (!disabled && !isUploading) {
                  document.getElementById("file-input")?.click();
                }
              }}
            >
              <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">
                Any file type supported
              </p>
              <input
                id="file-input"
                type="file"
                className="hidden"
                onChange={handleFileInputChange}
                disabled={disabled || isUploading}
              />
            </div>
          ) : (
            <div className="border rounded-lg p-4 flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <File className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm font-medium truncate max-w-[200px]">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFile}
                disabled={isUploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{uploadStage}</span>
              <span className="font-medium">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Info Box */}
        <Alert className="bg-blue-500/10 border-blue-500/30">
          <Lock className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-200">
            Your file will be encrypted using Seal encryption. The client can only decrypt and download it after approving this milestone.
          </AlertDescription>
        </Alert>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleUpload}
            disabled={!canUpload}
            className="flex-1 bg-primary hover:bg-primary/90"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Encrypting & Uploading...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 mr-2" />
                Encrypt & Submit
              </>
            )}
          </Button>

          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isUploading}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
