/**
 * Job Detail View Component
 * Displays complete job information with apply/claim functionality
 *
 * Features:
 * - Full job details with description
 * - Milestone breakdown
 * - Applicant list (for clients)
 * - Apply button (for freelancers)
 * - Walrus description preview
 * - State-based action buttons
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { useJob, useCurrentProfile } from "@/hooks";
import { JobState } from "@/services/types";
import { createJobService } from "@/services";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Users,
  FileText,
  Target
} from "lucide-react";
import { MilestoneCard } from "./MilestoneCard";
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

interface JobDetailViewProps {
  jobId: string;
  open: boolean;
  onClose: () => void;
  onApplySuccess?: () => void;
}

export function JobDetailView({ jobId, open, onClose, onApplySuccess }: JobDetailViewProps) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const jobPackageId = useNetworkVariable("jobEscrowPackageId");
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const { job, isPending, error, refetch } = useJob(jobId);
  const { profile: currentProfile, hasProfile } = useCurrentProfile();
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);
  const [description, setDescription] = useState<string>("");
  const [loadingDescription, setLoadingDescription] = useState(false);

  const jobService = useMemo(
    () => createJobService(suiClient, jobPackageId),
    [suiClient, jobPackageId]
  );

  // Set job description (stored directly in descriptionBlobId field)
  useEffect(() => {
    if (job && job.descriptionBlobId && open) {
      // Description is stored directly in descriptionBlobId field (not using Walrus for now)
      setDescription(job.descriptionBlobId);
      setLoadingDescription(false);
    }
  }, [job, open]);

  // Check if current user has already applied
  const hasApplied = useMemo(() => {
    if (!job || !currentAccount) return false;
    return job.applicants.includes(currentAccount.address);
  }, [job, currentAccount]);

  // Check if current user is the client
  const isClient = useMemo(() => {
    if (!job || !currentAccount) return false;
    return job.client === currentAccount.address;
  }, [job, currentAccount]);

  // Check if current user is the assigned freelancer
  const isAssignedFreelancer = useMemo(() => {
    if (!job || !currentAccount) return false;
    return job.freelancer === currentAccount.address;
  }, [job, currentAccount]);

  // Determine if user can apply
  const canApply = useMemo(() => {
    if (!job || !currentAccount || !hasProfile) return false;
    if (isClient) return false;
    if (hasApplied) return false;
    if (isAssignedFreelancer) return false;
    if (job.state !== JobState.OPEN) return false;
    if (isDeadlinePassed(job.deadline)) return false;
    return true;
  }, [job, currentAccount, hasProfile, isClient, hasApplied, isAssignedFreelancer]);

  // Handle job application
  const handleApply = async () => {
    if (!job || !currentAccount || !currentProfile) return;

    setIsApplying(true);
    setApplyError(null);
    setApplySuccess(false);

    try {
      const tx = jobService.applyForJobTransaction(jobId, currentProfile.objectId);

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await suiClient.waitForTransaction({ digest });
            setIsApplying(false);
            setApplySuccess(true);
            refetch(); // Refresh job data

            if (onApplySuccess) {
              onApplySuccess();
            }

            // Close modal after 2 seconds
            setTimeout(() => {
              onClose();
            }, 2000);
          },
          onError: (error) => {
            console.error("Error applying for job:", error);
            setApplyError(error.message || "Failed to apply for job");
            setIsApplying(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Error applying for job:", error);
      setApplyError(error.message || "Failed to apply for job");
      setIsApplying(false);
    }
  };

  // Get state badge variant and label
  // Shows "APPLIED" if job is OPEN but user has applied
  const getStateBadge = (state: JobState, hasApplied: boolean) => {
    // Special case: If job is OPEN but user has applied, show "APPLIED"
    if (state === JobState.OPEN && hasApplied) {
      return {
        variant: "default" as const,
        label: "APPLIED"
      };
    }

    // Normal state badges - colors match header counters
    switch (state) {
      case JobState.OPEN:
      case JobState.ASSIGNED:
        return { variant: "success" as const, label: JobState[state] }; // green
      case JobState.IN_PROGRESS:
      case JobState.SUBMITTED:
      case JobState.AWAITING_REVIEW:
        return { variant: "info" as const, label: JobState[state] }; // blue
      case JobState.COMPLETED:
        return { variant: "purple" as const, label: JobState[state] }; // purple
      case JobState.CANCELLED:
      case JobState.DISPUTED:
        return { variant: "danger" as const, label: JobState[state] }; // red
      default:
        return { variant: "default" as const, label: JobState[state] };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl mb-2">
            {job?.title || "Job Details"}
          </DialogTitle>
          {job && (
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              {(() => {
                const badge = getStateBadge(job.state, hasApplied);
                return (
                  <Badge variant={badge.variant}>
                    {badge.label}
                  </Badge>
                );
              })()}
              {isDeadlineApproaching(job.deadline) && !isDeadlinePassed(job.deadline) && (
                <Badge variant="warning">Urgent</Badge>
              )}
              {isDeadlinePassed(job.deadline) && (
                <Badge variant="destructive">Deadline Passed</Badge>
              )}
            </div>
          )}
        </DialogHeader>

        {isPending ? (
          <div className="py-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading job details...</p>
          </div>
        ) : error ? (
          <div className="py-8">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Error loading job: {error.message}
              </AlertDescription>
            </Alert>
            <div className="mt-4 text-center">
              <Button onClick={() => refetch()} variant="outline">
                Retry
              </Button>
            </div>
          </div>
        ) : job ? (
          <>
            <div className="space-y-6">
              {/* Success Message */}
              {applySuccess && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Successfully applied for this job! The client will review your application.
                  </AlertDescription>
                </Alert>
              )}

              {/* Error Message */}
              {applyError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{applyError}</AlertDescription>
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
                        <p className="text-sm font-mono">{shortenAddress(job.client)}</p>
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
                  {loadingDescription ? (
                    <div className="py-4 text-center text-muted-foreground">
                      Loading description...
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <p className="whitespace-pre-wrap">{description || "No description available"}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Milestones (if available) */}
              {job.milestones && job.milestones.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Milestones ({job.milestones.length})
                    </CardTitle>
                    <CardDescription>
                      Project breakdown into verifiable stages
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
                    <div className="pt-3 border-t mt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Total budget</span>
                        <span className="text-lg font-bold text-blue-400">
                          {formatSUI(job.budget)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Applicants (visible to client only) */}
              {isClient && job.applicants.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Applicants ({job.applicants.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {job.applicants.map((applicant, index) => (
                        <div
                          key={applicant}
                          className="flex items-center justify-between p-3 border rounded-lg"
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
                          <Button size="sm" variant="outline">
                            View Profile
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* No Profile Warning */}
              {!isClient && !hasProfile && currentAccount && job.state === JobState.OPEN && (
                <Alert className="bg-yellow-50 border-yellow-200">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    You need to create a profile before applying for jobs.
                  </AlertDescription>
                </Alert>
              )}

              {/* Already Applied Message */}
              {hasApplied && !isClient && (
                <Alert className="bg-blue-50 border-blue-200">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    You have already applied for this job. The client will review your application.
                  </AlertDescription>
                </Alert>
              )}

              {/* Assigned Freelancer Info */}
              {job.freelancer && (
                <Card className="border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle className="text-green-800">Assigned Freelancer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-sm">{shortenAddress(job.freelancer)}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {canApply && (
                <Button
                  onClick={handleApply}
                  disabled={isApplying}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isApplying ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Applying...
                    </>
                  ) : (
                    "Apply for Job"
                  )}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">Job not found</p>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
