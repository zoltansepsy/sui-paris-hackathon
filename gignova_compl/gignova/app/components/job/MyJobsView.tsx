/**
 * MyJobsView Component
 * Displays all jobs posted by the current user (client)
 * Shows job cards with filtering and sorting options
 */

"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { useJobsByClient } from "../../hooks/useJob";
import { JobCard } from "./JobCard";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { JobState } from "../../services";
import { useState } from "react";

interface MyJobsViewProps {
  onBack?: () => void;
  onViewJob?: (jobId: string) => void;
}

export function MyJobsView({ onBack, onViewJob }: MyJobsViewProps) {
  const currentAccount = useCurrentAccount();
  const { jobs, isPending, error } = useJobsByClient(currentAccount?.address);
  const [filter, setFilter] = useState<"all" | "open" | "active" | "completed" | "cancelled">("all");

  // Filter jobs based on selected filter
  const filteredJobs = jobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "open") return job.state === JobState.OPEN || job.state === JobState.ASSIGNED;
    if (filter === "active") return job.state === JobState.IN_PROGRESS || job.state === JobState.SUBMITTED || job.state === JobState.AWAITING_REVIEW;
    if (filter === "completed") return job.state === JobState.COMPLETED;
    if (filter === "cancelled") return job.state === JobState.CANCELLED;
    return true;
  });

  // Sort by created date (newest first)
  const sortedJobs = [...filteredJobs].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">My posted jobs</h2>
          <p className="text-muted-foreground mt-1">
            Manage and track your posted jobs
          </p>
        </div>
        {onBack && (
          <Button onClick={onBack} variant="outline">
            Back to Home
          </Button>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">
              {jobs.filter(j => j.state === JobState.OPEN || j.state === JobState.ASSIGNED).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">
              {jobs.filter(j => j.state === JobState.IN_PROGRESS || j.state === JobState.SUBMITTED || j.state === JobState.AWAITING_REVIEW).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">
              {jobs.filter(j => j.state === JobState.COMPLETED).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cancelled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {jobs.filter(j => j.state === JobState.CANCELLED).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
          size="sm"
          className={filter === "all" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
        >
          All
        </Button>
        <Button
          variant={filter === "open" ? "default" : "outline"}
          onClick={() => setFilter("open")}
          size="sm"
          className={filter === "open" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
        >
          Open
        </Button>
        <Button
          variant={filter === "active" ? "default" : "outline"}
          onClick={() => setFilter("active")}
          size="sm"
          className={filter === "active" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
        >
          Active
        </Button>
        <Button
          variant={filter === "completed" ? "default" : "outline"}
          onClick={() => setFilter("completed")}
          size="sm"
          className={filter === "completed" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
        >
          Completed
        </Button>
        <Button
          variant={filter === "cancelled" ? "default" : "outline"}
          onClick={() => setFilter("cancelled")}
          size="sm"
          className={filter === "cancelled" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
        >
          Cancelled
        </Button>
      </div>

      {/* Jobs List */}
      {isPending ? (
        <div className="text-center py-12">
          <div className="animate-pulse">Loading your jobs...</div>
        </div>
      ) : error ? (
        <Card className="border-red-500/50">
          <CardContent className="pt-6">
            <p className="text-red-400">Error loading jobs: {error.message}</p>
          </CardContent>
        </Card>
      ) : sortedJobs.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <p className="text-muted-foreground mb-4">
              {filter === "all"
                ? "You haven't posted any jobs yet."
                : `No ${filter} jobs found.`}
            </p>
            <p className="text-sm text-muted-foreground">
              Post your first job to get started!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedJobs.map((job) => (
            <JobCard
              key={job.objectId}
              job={job}
              onClick={() => onViewJob?.(job.objectId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
