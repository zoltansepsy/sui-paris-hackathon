/**
 * Deliverable Download Component
 *
 * Allows clients to download and decrypt deliverables after milestone approval.
 * Uses Seal for decryption and Walrus for storage retrieval.
 *
 * Flow:
 * 1. Client clicks download
 * 2. If no session key, prompts user to sign for decryption rights
 * 3. Downloads encrypted blob from Walrus
 * 4. Decrypts using Seal with session key
 * 5. Triggers browser download of decrypted file
 */

"use client";

import { useState, useMemo, useCallback } from "react";
import { useCurrentAccount, useSignPersonalMessage, useSuiClient, useSuiClientContext } from "@mysten/dapp-kit";
import { SessionKey } from "@mysten/seal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  Lock,
  Unlock,
  File,
  CheckCircle,
  AlertCircle,
  Loader2,
  Key,
} from "lucide-react";
import { useNetworkVariable } from "@/networkConfig";
import {
  createDeliverableService,
  DeliverableService,
} from "@/services/deliverableService";
import type { MilestoneData } from "@/services/types";

interface DeliverableDownloadProps {
  /** Milestone data containing deliverable information */
  milestone: MilestoneData;
  /** Callback when download completes */
  onDownloadComplete?: () => void;
  /** Optional: disable the component */
  disabled?: boolean;
}

export function DeliverableDownload({
  milestone,
  onDownloadComplete,
  disabled = false,
}: DeliverableDownloadProps) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { network } = useSuiClientContext();
  const packageId = useNetworkVariable("jobEscrowPackageId");
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  // State
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const [isCreatingSessionKey, setIsCreatingSessionKey] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStage, setDownloadStage] = useState("");
  const [downloadDuration, setDownloadDuration] = useState(0);
  const [downloadPhase, setDownloadPhase] = useState<'downloading' | 'decrypting' | 'complete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadComplete, setDownloadComplete] = useState(false);

  // Initialize deliverable service
  const deliverableService = useMemo(() => {
    // Validate network is supported
    if (network !== "testnet" && network !== "mainnet") {
      console.error("[DELIVERABLE DOWNLOAD] Unsupported network:", network);
      throw new Error(`Unsupported network: ${network}. Must be testnet or mainnet.`);
    }

    // Select server based on network with validation
    const sealServerName = network === "mainnet"
      ? "Mysten Mainnet 1"  // TODO: This will fail on mainnet until real IDs are added
      : "Mysten Testnet 1";

    console.log("[DELIVERABLE DOWNLOAD] Creating service:", {
      network,
      packageId,
      sealServerName,
    });

    return createDeliverableService(suiClient, {
      packageId,
      network: network as "testnet" | "mainnet",
      sealServerName,
    });
  }, [suiClient, packageId, network]);

  // Check if we have all required data for download
  const canDownload = Boolean(
    milestone.submissionBlobId &&
    milestone.whitelistId &&
    milestone.nonce &&
    milestone.approved &&
    currentAccount &&
    !disabled
  );

  // Progress callback with phase detection
  const handleProgress = useCallback((stage: string, progress: number) => {
    setDownloadStage(stage);
    setDownloadProgress(progress);

    // Update phase based on stage message
    if (stage.includes('Download')) {
      setDownloadPhase('downloading');
    } else if (stage.includes('Decrypt')) {
      setDownloadPhase('decrypting');
    } else if (stage.includes('Complete')) {
      setDownloadPhase('complete');
    }
  }, []);

  // Create session key for decryption
  const handleCreateSessionKey = async () => {
    if (!currentAccount) {
      setError("Please connect your wallet");
      return;
    }

    setIsCreatingSessionKey(true);
    setError(null);

    try {
      const newSessionKey = await deliverableService.createSessionKey(
        currentAccount.address,
        signPersonalMessage,
      );
      setSessionKey(newSessionKey);
    } catch (err: any) {
      console.error("Error creating session key:", err);
      setError(err.message || "Failed to create session key. Please try again.");
    } finally {
      setIsCreatingSessionKey(false);
    }
  };

  // Handle download with real-time progress tracking
  const handleDownload = async () => {
    if (!canDownload) {
      setError("Missing required data for download");
      return;
    }

    // Check if we need a session key
    if (!sessionKey) {
      setError("Please create a session key first by clicking 'Authorize Decryption'");
      return;
    }

    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);
    setDownloadStage("Starting");
    setDownloadDuration(0);
    setDownloadPhase('downloading');
    setDownloadComplete(false);

    const startTime = Date.now();

    // Update duration every 100ms
    const intervalId = setInterval(() => {
      setDownloadDuration(Date.now() - startTime);
    }, 100);

    try {
      // Create submission object from milestone data
      const submission = {
        encryptedBlobId: milestone.submissionBlobId!,
        previewUrl: milestone.previewUrl || "",
        whitelistId: milestone.whitelistId!,
        whitelistCapId: "", // Not needed for download
        nonce: milestone.nonce!,
        originalFileName: milestone.originalFileName || "deliverable",
        originalFileSize: 0,
      };

      // Download and decrypt
      const decryptedBlob = await deliverableService.downloadAndDecrypt(
        submission,
        sessionKey,
        handleProgress,
      );

      // Trigger browser download
      DeliverableService.triggerDownload(decryptedBlob, submission.originalFileName);

      setDownloadComplete(true);
      setDownloadPhase('complete');
      onDownloadComplete?.();

      // Reset after a delay
      setTimeout(() => {
        setDownloadComplete(false);
        setDownloadPhase(null);
      }, 5000);
    } catch (err: any) {
      console.error("Download error:", err);
      setError(err.message || "Failed to download deliverable");

      // If session key expired, clear it so user can create a new one
      if (err.message?.includes("session") || err.message?.includes("expired")) {
        setSessionKey(null);
      }
    } finally {
      clearInterval(intervalId);
      setIsDownloading(false);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // If milestone is not approved or missing data, show locked state
  if (!milestone.approved) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Lock className="h-8 w-8 text-yellow-400" />
            <div>
              <p className="font-medium">Deliverable Locked</p>
              <p className="text-sm text-muted-foreground">
                Approve the milestone to unlock and download the deliverable
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If missing encryption data (legacy job), show warning
  if (!milestone.submissionBlobId || !milestone.whitelistId || !milestone.nonce) {
    return (
      <Card className="border-muted">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <File className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Deliverable</p>
              <p className="text-sm text-muted-foreground">
                {milestone.submissionBlobId || "No deliverable data available"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Unlock className="h-5 w-5 text-green-400" />
          Deliverable Ready
        </CardTitle>
        <CardDescription>
          Your deliverable is unlocked and ready for download
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* File Info */}
        <div className="flex items-center gap-4 p-4 bg-background/50 rounded-lg">
          <File className="h-10 w-10 text-green-400" />
          <div className="flex-1">
            <p className="font-medium">{milestone.originalFileName || "Deliverable"}</p>
            <p className="text-xs text-muted-foreground">
              Encrypted with Seal - Decryption authorized
            </p>
          </div>
          <CheckCircle className="h-5 w-5 text-green-400" />
        </div>

        {/* Session Key Status */}
        {!sessionKey && (
          <Alert className="bg-blue-500/10 border-blue-500/30">
            <Key className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-200">
              First-time decryption requires signing a message to create a session key (valid for 10 minutes).
            </AlertDescription>
          </Alert>
        )}

        {sessionKey && (
          <Alert className="bg-green-500/10 border-green-500/30">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <AlertDescription className="text-green-300">
              Session key active - Ready to download
            </AlertDescription>
          </Alert>
        )}

        {/* Download Progress with Real-time Duration */}
        {isDownloading && (
          <div className="space-y-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-3">
              {/* Phase-specific icon */}
              {downloadPhase === 'downloading' && (
                <Download className="h-5 w-5 text-blue-400 animate-pulse" />
              )}
              {downloadPhase === 'decrypting' && (
                <Lock className="h-5 w-5 text-purple-400 animate-pulse" />
              )}
              {downloadPhase === 'complete' && (
                <CheckCircle className="h-5 w-5 text-green-400" />
              )}

              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{downloadStage}</span>
                  <span className="text-sm font-mono text-blue-300">
                    {(downloadDuration / 1000).toFixed(1)}s
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    {downloadPhase === 'downloading' && 'Fetching from Walrus...'}
                    {downloadPhase === 'decrypting' && 'Decrypting with Seal...'}
                    {downloadPhase === 'complete' && 'Complete!'}
                  </span>
                  <span className="text-xs font-medium">{downloadProgress}%</span>
                </div>
              </div>
            </div>

            {/* Progress bar with phase-based color */}
            <Progress
              value={downloadProgress}
              className={`h-2 ${
                downloadPhase === 'downloading' ? 'bg-blue-200/20' :
                downloadPhase === 'decrypting' ? 'bg-purple-200/20' :
                'bg-green-200/20'
              }`}
            />

            {/* Performance indicator */}
            {downloadDuration > 0 && (
              <div className="text-xs text-center">
                {downloadDuration < 10000 ? (
                  <span className="text-green-400">✓ Fast download</span>
                ) : downloadDuration < 20000 ? (
                  <span className="text-yellow-400">○ Normal speed</span>
                ) : (
                  <span className="text-orange-400">⚠ Slower than expected</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Download Complete */}
        {downloadComplete && (
          <Alert className="bg-green-500/10 border-green-500/30">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <AlertDescription className="text-green-300">
              <div className="flex items-center justify-between">
                <span>Download complete! Check your downloads folder.</span>
                <span className="text-xs font-mono bg-green-500/20 px-2 py-1 rounded">
                  {(downloadDuration / 1000).toFixed(1)}s
                </span>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {!sessionKey ? (
            <Button
              onClick={handleCreateSessionKey}
              disabled={isCreatingSessionKey || disabled || !currentAccount}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isCreatingSessionKey ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Session Key...
                </>
              ) : (
                <>
                  <Key className="h-4 w-4 mr-2" />
                  Authorize Decryption
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleDownload}
              disabled={isDownloading || disabled}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Decrypting & Downloading...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download & Decrypt
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
