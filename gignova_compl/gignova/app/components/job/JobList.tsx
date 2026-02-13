/**
 * JobList Component
 * Displays a list of jobs with loading states and responsive grid
 *
 * Features:
 * - Responsive grid layout (1/2/3 columns)
 * - Skeleton loading states
 * - Empty state handling
 * - Click navigation support
 */

"use client";

import { JobCard } from "./JobCard";
import { type JobData } from "../../services";
import { Card, CardContent, CardHeader } from "../ui/card";

interface JobListProps {
  jobs: JobData[];
  onJobClick?: (job: JobData) => void;
  isLoading?: boolean;
  currentUserAddress?: string; // Pass to JobCard to show "APPLIED" badge
}

/**
 * Skeleton loader for job cards
 */
function JobCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          <div className="h-10 bg-gray-200 rounded mt-4"></div>
        </div>
      </CardContent>
    </Card>
  );
}

export function JobList({ jobs, onJobClick, isLoading, currentUserAddress }: JobListProps) {
  // Loading state with skeletons
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state (handled by parent, but keeping as fallback)
  if (jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No jobs found</p>
      </div>
    );
  }

  // Job grid
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {jobs.map((job) => (
        <JobCard
          key={job.objectId}
          job={job}
          onClick={() => onJobClick?.(job)}
          currentUserAddress={currentUserAddress}
        />
      ))}
    </div>
  );
}
