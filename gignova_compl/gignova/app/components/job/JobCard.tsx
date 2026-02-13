/**
 * JobCard Component
 * Displays a job summary card for listings
 *
 * DEV 3 TODO:
 * 1. Implement job data display
 * 2. Add state badge (Open, In Progress, etc.)
 * 3. Add budget and deadline display
 * 4. Add click handler for navigation to job detail
 * 5. Add responsive design
 * 6. Add loading skeleton
 */

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { type JobData, JobState } from "../../services";

interface JobCardProps {
  job: JobData;
  onClick?: () => void;
  currentUserAddress?: string; // Optional: to show "APPLIED" badge
}

export function JobCard({ job, onClick, currentUserAddress }: JobCardProps) {
  // Check if current user has applied
  const hasApplied = currentUserAddress && job.applicants.includes(currentUserAddress);

  // Debug: Log job state
  console.log(`🃏 JobCard: ${job.title.slice(0, 20)}... state=${JobState[job.state]} (${job.state})`);

  // Format helpers
  const formatBudget = (amount: number) => {
    return `${(amount / 1_000_000_000).toFixed(2)} SUI`;
  };

  const formatDeadlineDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  // Get state badge with "APPLIED" status if user has applied
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
    <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={onClick}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{job.title}</CardTitle>
          {(() => {
            const badge = getStateBadge(job.state, !!hasApplied);
            return (
              <Badge variant={badge.variant}>
                {badge.label}
              </Badge>
            );
          })()}
        </div>
        <CardDescription>
          Posted by: {job.client.slice(0, 6)}...{job.client.slice(-4)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Budget:</span>
            <span className="font-semibold">{formatBudget(job.budget)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Deadline:</span>
            <span>{formatDeadlineDate(job.deadline)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Milestones:</span>
            <span>{job.milestoneCount}</span>
          </div>
          {job.applicants.length > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Applicants:</span>
              <span>{job.applicants.length}</span>
            </div>
          )}
        </div>
        {/* TODO: Add action buttons based on user role and job state */}
        <Button className="w-full mt-4" variant="outline">
          View details
        </Button>
      </CardContent>
    </Card>
  );
}
