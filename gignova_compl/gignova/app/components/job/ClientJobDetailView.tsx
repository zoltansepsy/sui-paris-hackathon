/**
 * Client Job Detail View Component
 * Displays job details with client-specific actions for managing posted jobs
 *
 * Features:
 * - State-based action buttons (assign, approve, cancel)
 * - Applicant list with assignment functionality
 * - Milestone approval workflow
 * - Job cancellation
 * - Deliverable download (dummy for now)
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { useJob, useCurrentProfile } from "@/hooks";
import { JobData, JobState } from "@/services/types";
import { createJobService } from "@/services";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  FileText,
  Target,
  Download,
  UserCheck,
  ArrowLeft,
  ExternalLink,
  Lock,
  File,
  Loader2,
} from "lucide-react";
import { MilestoneCard } from "./MilestoneCard";
import { DeliverableService } from "@/services/deliverableService";
import { DeliverableDownload } from "./DeliverableDownload";
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

interface ClientJobDetailViewProps {
  jobId: string;
  onBack: () => void;
}

export function ClientJobDetailView({ jobId, onBack }: ClientJobDetailViewProps) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const jobPackageId = useNetworkVariable("jobEscrowPackageId");
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const { job, isPending, error, refetch } = useJob(jobId);
  const { profile: clientProfile, isPending: profileLoading } = useCurrentProfile();

  // State for actions
  const [assigningFreelancer, setAssigningFreelancer] = useState(false);
  const [selectedFreelancer, setSelectedFreelancer] = useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [jobCapId, setJobCapId] = useState<string | null>(null);
  const [loadingJobCap, setLoadingJobCap] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRequestingRevision, setIsRequestingRevision] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);

  const jobService = useMemo(
    () => createJobService(suiClient, jobPackageId),
    [suiClient, jobPackageId]
  );

  // Fetch JobCap for this job
  useEffect(() => {
    async function fetchJobCap() {
      if (!currentAccount || !job) return;

      setLoadingJobCap(true);
      try {
        const caps = await jobService.getJobCapsByOwner(currentAccount.address);
        const cap = caps.find((c) => c.jobId === jobId);
        if (cap) {
          setJobCapId(cap.objectId);
          console.log(`📋 Found JobCap for job ${jobId.slice(0, 8)}...`, cap.objectId.slice(0, 8));
        } else {
          console.warn(`⚠️ No JobCap found for job ${jobId.slice(0, 8)}...`);
        }
      } catch (error) {
        console.error("Error fetching JobCap:", error);
      } finally {
        setLoadingJobCap(false);
      }
    }

    fetchJobCap();
  }, [currentAccount, job, jobId, jobService]);

  // Check if current user is the client
  const isClient = useMemo(() => {
    if (!job || !currentAccount) return false;
    return job.client === currentAccount.address;
  }, [job, currentAccount]);

  // Handle freelancer assignment
  const handleAssignFreelancer = async (freelancerAddress: string) => {
    if (!job || !currentAccount || !clientProfile || !jobCapId) {
      setActionError("Missing required data for assignment");
      return;
    }

    setAssigningFreelancer(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      // No longer need freelancer profile - profile update now happens in start_job
      const tx = jobService.assignFreelancerTransaction(
        jobId,
        jobCapId,
        freelancerAddress
      );

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await suiClient.waitForTransaction({ digest });
            setAssigningFreelancer(false);
            setActionSuccess("Freelancer assigned successfully!");
            setShowAssignDialog(false);
            refetch(); // Refresh job data

            setTimeout(() => {
              setActionSuccess(null);
            }, 3000);
          },
          onError: (error) => {
            console.error("Error assigning freelancer:", error);
            setActionError(error.message || "Failed to assign freelancer");
            setAssigningFreelancer(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Error assigning freelancer:", error);
      setActionError(error.message || "Failed to assign freelancer");
      setAssigningFreelancer(false);
    }
  };

  // Handle cancel job
  const handleCancelJob = async () => {
    if (!job || !currentAccount || !clientProfile || !jobCapId) {
      setActionError("Missing required data for cancellation");
      return;
    }

    setActionError(null);
    setActionSuccess(null);

    try {
      const tx = job.freelancer
        ? jobService.cancelJobWithFreelancerTransaction(
            jobId,
            jobCapId,
            clientProfile.objectId,
            "0x0" // Placeholder for freelancer profile
          )
        : jobService.cancelJobTransaction(jobId, jobCapId, clientProfile.objectId);

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await suiClient.waitForTransaction({ digest });
            setActionSuccess("Job cancelled successfully!");
            refetch();

            setTimeout(() => {
              onBack();
            }, 2000);
          },
          onError: (error) => {
            console.error("Error cancelling job:", error);
            setActionError(error.message || "Failed to cancel job");
          },
        }
      );
    } catch (error: any) {
      console.error("Error cancelling job:", error);
      setActionError(error.message || "Failed to cancel job");
    }
  };

  // Handle approve milestone with encrypted deliverable access grant
  const handleApproveMilestone = async (milestoneId: number = 0) => {
    if (!job || !currentAccount || !clientProfile || !jobCapId) {
      setActionError("Missing required data for milestone approval");
      return;
    }

    // Get milestone data to find the deliverable escrow and whitelist IDs
    const milestone = job.milestones.find(m => m.id === milestoneId);
    if (!milestone) {
      setActionError("Milestone not found");
      return;
    }

    if (!milestone.deliverableEscrowId || !milestone.whitelistId) {
      setActionError("Milestone missing deliverable escrow or whitelist information");
      return;
    }

    setIsApproving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      // Use the updated approve milestone transaction with encrypted deliverable support
      const tx = jobService.approveMilestoneTransaction(
        jobId,
        jobCapId,
        milestoneId,
        milestone.deliverableEscrowId,
        milestone.whitelistId,
        clientProfile.objectId
      );

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await suiClient.waitForTransaction({ digest });
            setIsApproving(false);
            setActionSuccess("Milestone approved! Payment has been released and you can now download the encrypted deliverable.");
            refetch(); // Refresh job data - state may change to COMPLETED

            setTimeout(() => {
              setActionSuccess(null);
            }, 8000);
          },
          onError: (error) => {
            console.error("Error approving milestone:", error);
            setActionError(error.message || "Failed to approve milestone");
            setIsApproving(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Error approving milestone:", error);
      setActionError(error.message || "Failed to approve milestone");
      setIsApproving(false);
    }
  };

  // Handle request revision
  const handleRequestRevision = async (milestoneId: number = 0) => {
    if (!job || !currentAccount || !jobCapId) {
      setActionError("Missing required data for revision request");
      return;
    }

    if (!revisionReason.trim()) {
      setActionError("Please provide revision feedback");
      return;
    }

    setIsRequestingRevision(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const tx = jobService.requestRevisionTransaction(
        jobId,
        jobCapId,
        milestoneId,
        revisionReason.trim()
      );

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await suiClient.waitForTransaction({ digest });
            setIsRequestingRevision(false);
            setActionSuccess("Revision requested. The freelancer can now make changes and resubmit.");
            setShowRevisionDialog(false);
            setRevisionReason("");
            refetch();

            setTimeout(() => {
              setActionSuccess(null);
            }, 5000);
          },
          onError: (error) => {
            console.error("Error requesting revision:", error);
            setActionError(error.message || "Failed to request revision");
            setIsRequestingRevision(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Error requesting revision:", error);
      setActionError(error.message || "Failed to request revision");
      setIsRequestingRevision(false);
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
        return { variant: "info" as const, label: state === JobState.IN_PROGRESS ? "IN PROGRESS" : "NEEDS REVIEW" }; // blue
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

  if (!isClient) {
    return (
      <div className="py-8 text-center">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>You are not the client for this job</AlertDescription>
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
          Back to My Jobs
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
              <Users className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">Applicants</p>
                <p className="text-xl font-bold">{job.applicants.length}</p>
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
          <div className="prose prose-sm max-w-none">
            <p className="whitespace-pre-wrap text-foreground">
              {job.descriptionBlobId || "No description available"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* State-Specific Content */}

      {/* OPEN State: Show Applicants */}
      {job.state === JobState.OPEN && job.applicants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Applicants ({job.applicants.length})
            </CardTitle>
            <CardDescription>
              Review and assign a freelancer to your job
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {job.applicants.map((applicant, index) => (
                <div
                  key={applicant}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-600 flex items-center justify-center text-white font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-mono text-sm">{shortenAddress(applicant)}</p>
                      <p className="text-xs text-muted-foreground">Freelancer</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">
                      View Profile
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedFreelancer(applicant);
                        setShowAssignDialog(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={loadingJobCap || !jobCapId}
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Assign
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* OPEN State: No Applicants */}
      {job.state === JobState.OPEN && job.applicants.length === 0 && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            No applicants yet. Freelancers can apply from the marketplace.
          </AlertDescription>
        </Alert>
      )}

      {/* ASSIGNED/IN_PROGRESS: Show Freelancer */}
      {(job.state === JobState.ASSIGNED || job.state === JobState.IN_PROGRESS) && job.freelancer && (
        <Card className="border-blue-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-500" />
              Assigned Freelancer
            </CardTitle>
            <CardDescription>
              Work is {job.state === JobState.ASSIGNED ? "assigned" : "in progress"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="font-mono text-sm">{shortenAddress(job.freelancer)}</p>
            <Button size="sm" variant="outline">
              View Profile
            </Button>
          </CardContent>
        </Card>
      )}

      {/* SUBMITTED/AWAITING_REVIEW: Show Preview and Review Options */}
      {(job.state === JobState.SUBMITTED || job.state === JobState.AWAITING_REVIEW) && (() => {
        // Get the submitted milestone data
        console.log("🔍 Looking for submitted milestone in:", {
          milestones: job.milestones,
          milestoneCount: job.milestones.length,
        });
        const submittedMilestone = job.milestones.find(m => m.completed && !m.approved);
        console.log("📋 Found submitted milestone:", submittedMilestone);

        return (
          <Card className="border-orange-500/50 bg-orange-500/10">
            <CardHeader>
              <CardTitle className="text-orange-400">Milestone submitted for review</CardTitle>
              <CardDescription>Review the preview and approve to release payment and access the full deliverable</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Milestone Details */}
                {submittedMilestone && (
                  <MilestoneCard milestone={submittedMilestone} variant="detailed" />
                )}

                {/* Preview URL Section */}
                {submittedMilestone?.previewUrl && (
                  <div className="p-4 bg-background/50 rounded-lg border border-blue-500/30">
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <ExternalLink className="h-4 w-4 text-blue-400" />
                      Preview URL
                    </p>
                    <a
                      href={submittedMilestone.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline break-all"
                    >
                      {submittedMilestone.previewUrl}
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => window.open(submittedMilestone.previewUrl, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Preview in New Tab
                    </Button>
                  </div>
                )}

                {/* Encrypted Deliverable Info */}
                {submittedMilestone?.originalFileName && (
                  <div className="p-4 bg-background/50 rounded-lg border border-yellow-500/30">
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Lock className="h-4 w-4 text-yellow-400" />
                      Encrypted Deliverable
                    </p>
                    <div className="flex items-center gap-3">
                      <File className="h-8 w-8 text-yellow-400" />
                      <div>
                        <p className="text-sm font-medium">{submittedMilestone.originalFileName}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Encrypted - Will unlock after approval
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Legacy deliverable display (for jobs without encrypted deliverables) */}
                {!submittedMilestone?.originalFileName && job.deliverableBlobIds.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Deliverable:</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {job.deliverableBlobIds[0]}
                    </p>
                  </div>
                )}

                {/* Info Alert */}
                <Alert className="bg-blue-500/10 border-blue-500/30">
                  <AlertCircle className="h-4 w-4 text-blue-400" />
                  <AlertDescription className="text-blue-200">
                    Review the preview to verify the work quality. Approving will release payment and grant you access to download the full deliverable.
                  </AlertDescription>
                </Alert>

                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    disabled={loadingJobCap || !jobCapId || isApproving}
                    onClick={() => handleApproveMilestone(submittedMilestone?.id ?? 0)}
                  >
                    {isApproving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Approving & Granting Access...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve & Unlock Deliverable
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={loadingJobCap || !jobCapId || isApproving || isRequestingRevision}
                    onClick={() => setShowRevisionDialog(true)}
                  >
                    {isRequestingRevision ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Requesting...
                      </>
                    ) : (
                      "Request Revision"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* COMPLETED: Show Download */}
      {job.state === JobState.COMPLETED && (
        <div className="space-y-4">
          <Card className="border-purple-500/50 bg-purple-500/10">
            <CardHeader>
              <CardTitle className="text-purple-400">Job Completed!</CardTitle>
              <CardDescription>All milestones approved and payment released</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="bg-purple-500/10 border-purple-500/30">
                <CheckCircle className="h-4 w-4 text-purple-400" />
                <AlertDescription className="text-purple-300">
                  Job completed successfully. Payment has been released to the freelancer.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Deliverable Downloads */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Download className="h-5 w-5" />
              Your Deliverables
            </h3>
            {job.milestones.map((milestone) => (
              <div key={milestone.id} className="space-y-3">
                <MilestoneCard milestone={milestone} variant="compact" />
                <DeliverableDownload milestone={milestone} />
              </div>
            ))}
            {job.milestones.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No deliverables found for this job.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            {job.state === JobState.OPEN && (
              <Button
                variant="destructive"
                onClick={handleCancelJob}
                disabled={loadingJobCap || !jobCapId}
              >
                Cancel Job & Refund
              </Button>
            )}
            {(job.state === JobState.ASSIGNED || job.state === JobState.IN_PROGRESS) && (
              <Button
                variant="destructive"
                onClick={handleCancelJob}
                disabled={loadingJobCap || !jobCapId}
              >
                Cancel Job
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Assign Freelancer Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Freelancer</DialogTitle>
            <DialogDescription>
              Are you sure you want to assign this freelancer to your job?
            </DialogDescription>
          </DialogHeader>

          {selectedFreelancer && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-2">Freelancer Address:</p>
              <p className="font-mono text-sm break-all">{shortenAddress(selectedFreelancer)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Full: {selectedFreelancer.slice(0, 20)}...{selectedFreelancer.slice(-20)}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedFreelancer && handleAssignFreelancer(selectedFreelancer)}
              disabled={assigningFreelancer}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {assigningFreelancer ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Assigning...
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-2" />
                  Confirm Assignment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Revision Dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Revision</DialogTitle>
            <DialogDescription>
              Explain what changes are needed. This feedback is required to help the freelancer understand the requested changes.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Textarea
              placeholder="Please describe what changes are needed..."
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
            {!revisionReason.trim() && (
              <p className="text-xs text-muted-foreground mt-2">
                Feedback is required to request a revision.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevisionDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => handleRequestRevision(0)}
              disabled={isRequestingRevision || !revisionReason.trim()}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {isRequestingRevision ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Requesting...
                </>
              ) : (
                "Request Revision"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
