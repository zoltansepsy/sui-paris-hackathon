/**
 * Freelancer Job Detail View Component
 * Displays job details with freelancer-specific actions for managing assigned jobs
 *
 * Features:
 * - Job details display (title, budget, deadline, client, state)
 * - "Start Job" button for ASSIGNED state
 * - Milestone submission for IN_PROGRESS state
 * - State-based UI updates
 */

"use client";

import { useState, useMemo } from "react";
import { useJob, useCurrentProfile } from "@/hooks";
import { JobState } from "@/services/types";
import { createJobService } from "@/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  Target,
  Play,
  ArrowLeft,
  Loader2,
  Gift,
} from "lucide-react";
import { DeliverableUpload } from "./DeliverableUpload";
import { MilestoneCard } from "./MilestoneCard";
import type { DeliverableSubmission } from "@/services/deliverableService";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { useNetworkVariable } from "../../networkConfig";
import {
  formatSUI,
  formatDeadline,
  formatDate,
  shortenAddress,
  isDeadlineApproaching,
  isDeadlinePassed,
} from "@/utils";

interface FreelancerJobDetailViewProps {
  jobId: string;
  onBack: () => void;
}

export function FreelancerJobDetailView({ jobId, onBack }: FreelancerJobDetailViewProps) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const jobPackageId = useNetworkVariable("jobEscrowPackageId");
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const { job, isPending, error, refetch } = useJob(jobId);
  const { profile: freelancerProfile, isPending: profileLoading } = useCurrentProfile();

  // State for actions
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<DeliverableSubmission | null>(null);

  const jobService = useMemo(
    () => createJobService(suiClient, jobPackageId),
    [suiClient, jobPackageId]
  );

  // Check if current user is the assigned freelancer
  const isAssignedFreelancer = useMemo(() => {
    if (!job || !currentAccount) return false;
    return job.freelancer === currentAccount.address;
  }, [job, currentAccount]);

  // Handle starting the job
  const handleStartJob = async () => {
    if (!job || !currentAccount || !freelancerProfile) {
      setActionError("Missing required data to start job");
      return;
    }

    setIsStartingJob(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const tx = jobService.startJobTransaction(jobId, freelancerProfile.objectId);

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await suiClient.waitForTransaction({ digest });
            setIsStartingJob(false);
            setActionSuccess("Job started successfully! You can now begin working.");
            refetch(); // Refresh job data - state should now be IN_PROGRESS

            setTimeout(() => {
              setActionSuccess(null);
            }, 3000);
          },
          onError: (error) => {
            console.error("Error starting job:", error);
            setActionError(error.message || "Failed to start job");
            setIsStartingJob(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Error starting job:", error);
      setActionError(error.message || "Failed to start job");
      setIsStartingJob(false);
    }
  };

  // Handle upload complete - called when file is encrypted and uploaded to Walrus
  const handleUploadComplete = (submission: DeliverableSubmission) => {
    setPendingSubmission(submission);
    // Now submit the milestone to the blockchain
    handleSubmitMilestone(submission);
  };

  // Handle submitting milestone with encrypted deliverable
  const handleSubmitMilestone = async (submission: DeliverableSubmission) => {
    if (!job || !currentAccount || !freelancerProfile) {
      setActionError("Missing required data to submit milestone");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      // Submit milestone 0 (MVP: single milestone support) with full encrypted deliverable data
      const tx = jobService.submitMilestoneTransaction(
        jobId,
        0, // milestone ID
        submission.encryptedBlobId,
        submission.previewUrl,
        submission.whitelistCapId,
        submission.whitelistId,
        submission.nonce,
        submission.originalFileName
      );

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await suiClient.waitForTransaction({ digest });
            setIsSubmitting(false);
            setActionSuccess("Milestone submitted successfully! The client can now review your preview URL. After approval, they will be able to download the encrypted deliverable.");
            setPendingSubmission(null); // Clear pending submission
            refetch(); // Refresh job data - state should now be SUBMITTED

            setTimeout(() => {
              setActionSuccess(null);
            }, 8000);
          },
          onError: (error) => {
            console.error("Error submitting milestone:", error);
            setActionError(error.message || "Failed to submit milestone");
            setIsSubmitting(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Error submitting milestone:", error);
      setActionError(error.message || "Failed to submit milestone");
      setIsSubmitting(false);
    }
  };

  // Handle claiming job completion
  const handleClaimCompletion = async () => {
    if (!job || !currentAccount || !freelancerProfile) {
      setActionError("Missing required data to claim completion");
      return;
    }

    setIsClaiming(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const tx = jobService.claimJobCompletionTransaction(jobId, freelancerProfile.objectId);

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await suiClient.waitForTransaction({ digest });
            setIsClaiming(false);
            setActionSuccess(`Job completion claimed! Your profile has been updated with ${formatSUI(job.pendingFreelancerCompletion || job.budget)} earned.`);
            refetch(); // Refresh job data

            setTimeout(() => {
              setActionSuccess(null);
            }, 5000);
          },
          onError: (error) => {
            console.error("Error claiming completion:", error);
            setActionError(error.message || "Failed to claim completion");
            setIsClaiming(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Error claiming completion:", error);
      setActionError(error.message || "Failed to claim completion");
      setIsClaiming(false);
    }
  };

  // Get state badge - colors match header counters
  const getStateBadge = (state: JobState) => {
    switch (state) {
      case JobState.OPEN:
      case JobState.ASSIGNED:
        return { variant: "success" as const, label: JobState[state] }; // green
      case JobState.IN_PROGRESS:
      case JobState.SUBMITTED:
      case JobState.AWAITING_REVIEW:
        return { variant: "info" as const, label: state === JobState.IN_PROGRESS ? "IN PROGRESS" : "AWAITING REVIEW" }; // blue
      case JobState.COMPLETED:
        return { variant: "purple" as const, label: "COMPLETED" }; // purple
      case JobState.CANCELLED:
      case JobState.DISPUTED:
        return { variant: "danger" as const, label: JobState[state] }; // red
      default:
        return { variant: "default" as const, label: JobState[state] };
    }
  };

  if (isPending || profileLoading) {
    return (
      <div className="py-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Loading job details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Error loading job: {error.message}</AlertDescription>
        </Alert>
        <div className="mt-4 text-center">
          <Button onClick={() => refetch()} variant="outline">
            Retry
          </Button>
          <Button onClick={onBack} variant="ghost" className="ml-2">
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Job not found</p>
        <Button onClick={onBack} variant="outline" className="mt-4">
          Back
        </Button>
      </div>
    );
  }

  if (!isAssignedFreelancer) {
    return (
      <div className="py-8 text-center">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>You are not the assigned freelancer for this job</AlertDescription>
        </Alert>
        <Button onClick={onBack} variant="outline" className="mt-4">
          Back
        </Button>
      </div>
    );
  }

  const badge = getStateBadge(job.state);

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button onClick={onBack} variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to My Portfolio
        </Button>
      </div>

      {/* Job Title and Status */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">{job.title}</CardTitle>
              <CardDescription className="flex items-center gap-2 flex-wrap">
                <Badge variant={badge.variant}>
                  {badge.label}
                </Badge>
                {isDeadlineApproaching(job.deadline) && !isDeadlinePassed(job.deadline) && (
                  <Badge variant="warning">Urgent</Badge>
                )}
                {isDeadlinePassed(job.deadline) && (
                  <Badge variant="destructive">Deadline Passed</Badge>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Success/Error Messages */}
      {actionSuccess && (
        <Alert className="bg-green-500/10 border-green-500/50">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <AlertDescription className="text-green-400">{actionSuccess}</AlertDescription>
        </Alert>
      )}

      {actionError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Key Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Budget</p>
                <p className="text-xl font-bold">{formatSUI(job.budget)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Deadline</p>
                <p className="text-lg font-semibold">{formatDate(job.deadline)}</p>
                <p className="text-xs text-muted-foreground">{formatDeadline(job.deadline)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">Client</p>
                <p className="font-mono text-sm">{shortenAddress(job.client)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">Milestones</p>
                <p className="text-xl font-bold">{job.milestoneCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Job description
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p className="whitespace-pre-wrap text-foreground">
              {job.descriptionBlobId || "No description available"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* State-Specific Actions */}

      {/* ASSIGNED State: Show Start Job Button */}
      {job.state === JobState.ASSIGNED && (
        <Card className="border-blue-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-blue-500" />
              Ready to Start
            </CardTitle>
            <CardDescription>
              You have been assigned to this job. Start working to begin the milestone workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleStartJob}
              disabled={isStartingJob || !freelancerProfile}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isStartingJob ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting Job...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Job
                </>
              )}
            </Button>
            {!freelancerProfile && (
              <p className="text-sm text-muted-foreground mt-2">
                You need a profile to start this job.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* IN_PROGRESS State: Show Encrypted Deliverable Upload */}
      {job.state === JobState.IN_PROGRESS && (
        <div className="space-y-4">
          <Card className="border-yellow-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                Work in Progress
              </CardTitle>
              <CardDescription>
                You are actively working on this job. Upload your deliverable and submit for review when ready.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Milestone List */}
          {job.milestones && job.milestones.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Project Milestones
                </CardTitle>
                <CardDescription>
                  Track your progress through each milestone
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {job.milestones.map((milestone) => (
                  <MilestoneCard
                    key={milestone.id}
                    milestone={milestone}
                    variant="compact"
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Encrypted Deliverable Upload Component */}
          <DeliverableUpload
            onUploadComplete={handleUploadComplete}
            disabled={isSubmitting || !freelancerProfile}
          />

          {!freelancerProfile && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You need a profile to submit milestones.
              </AlertDescription>
            </Alert>
          )}

          {isSubmitting && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Submitting milestone to blockchain...
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* SUBMITTED/AWAITING_REVIEW State */}
      {(job.state === JobState.SUBMITTED || job.state === JobState.AWAITING_REVIEW) && (
        <Card className="border-orange-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Awaiting Client Review
            </CardTitle>
            <CardDescription>
              Your milestone has been submitted. Waiting for client approval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                The client is reviewing your submission. You will be notified when they respond.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* COMPLETED State */}
      {job.state === JobState.COMPLETED && (
        <Card className="border-green-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Job Completed
            </CardTitle>
            <CardDescription>
              Congratulations! This job has been completed and payment has been released.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-purple-500/10 border-purple-500/30">
              <CheckCircle className="h-4 w-4 text-purple-400" />
              <AlertDescription className="text-purple-300">
                Payment of {formatSUI(job.budget)} has been released to your wallet.
              </AlertDescription>
            </Alert>

            {/* Show claim button if pending completion exists */}
            {job.pendingFreelancerCompletion !== undefined && (
              <div className="space-y-2">
                <Alert>
                  <Gift className="h-4 w-4" />
                  <AlertDescription>
                    Claim your job completion to update your profile stats.
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={handleClaimCompletion}
                  disabled={isClaiming || !freelancerProfile}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isClaiming ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Claiming...
                    </>
                  ) : (
                    <>
                      <Gift className="h-4 w-4 mr-2" />
                      Claim Completion
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Show already claimed message */}
            {job.pendingFreelancerCompletion === undefined && (
              <p className="text-sm text-muted-foreground">
                Your profile has been updated with this completed job.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* CANCELLED State */}
      {job.state === JobState.CANCELLED && (
        <Card className="border-red-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Job Cancelled
            </CardTitle>
            <CardDescription>
              This job has been cancelled.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
