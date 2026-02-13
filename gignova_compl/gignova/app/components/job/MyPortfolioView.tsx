/**
 * MyPortfolioView Component
 * Displays all jobs assigned to the current user (freelancer)
 * Shows job cards with filtering and sorting options
 */

"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { useJobsByFreelancer } from "../../hooks/useJob";
import { JobCard } from "./JobCard";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { JobState } from "../../services";
import { useState } from "react";

interface MyPortfolioViewProps {
  onBack?: () => void;
  onViewJob?: (jobId: string) => void;
}

export function MyPortfolioView({ onBack, onViewJob }: MyPortfolioViewProps) {
  const currentAccount = useCurrentAccount();
  const { jobs, isPending, error } = useJobsByFreelancer(currentAccount?.address);
  const [filter, setFilter] = useState<"all" | "assigned" | "active" | "completed">("all");

  // Filter jobs based on selected filter
  const filteredJobs = jobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "assigned") return job.state === JobState.ASSIGNED;
    if (filter === "active") return job.state === JobState.IN_PROGRESS || job.state === JobState.SUBMITTED || job.state === JobState.AWAITING_REVIEW;
    if (filter === "completed") return job.state === JobState.COMPLETED || job.state === JobState.CANCELLED;
    return true;
  });

  // Sort by created date (newest first)
  const sortedJobs = [...filteredJobs].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">My Portfolio</h2>
          <p className="text-muted-foreground mt-1">
            Track your assigned jobs and work progress
          </p>
        </div>
        {onBack && (
          <Button onClick={onBack} variant="outline">
            Back to Home
          </Button>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">
              {jobs.filter(j => j.state === JobState.ASSIGNED).length}
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
            <div className="text-2xl font-bold text-green-400">
              {jobs.filter(j => j.state === JobState.COMPLETED).length}
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
          variant={filter === "assigned" ? "default" : "outline"}
          onClick={() => setFilter("assigned")}
          size="sm"
          className={filter === "assigned" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
        >
          Assigned
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
      </div>

      {/* Jobs List */}
      {isPending ? (
        <div className="text-center py-12">
          <div className="animate-pulse">Loading your portfolio...</div>
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
                ? "You haven't been assigned any jobs yet."
                : `No ${filter} jobs found.`}
            </p>
            <p className="text-sm text-muted-foreground">
              Browse the marketplace to find jobs!
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
