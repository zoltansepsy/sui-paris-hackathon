/**
 * Job Marketplace View
 * Main marketplace for browsing and applying to open jobs
 *
 * Features:
 * - Event-based job discovery using JobEventIndexer
 * - Real-time updates (30s auto-refresh via React Query)
 * - Advanced filtering (budget range, deadline, search)
 * - Sorting options (newest, budget, deadline)
 * - Infinite scroll with load more
 * - Job detail modal with apply functionality
 * - Responsive grid layout
 * - Loading states and error handling
 */

"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useOpenJobs } from "@/hooks";
import { JobList } from "@/components/job/JobList";
import { JobDetailView } from "@/components/job/JobDetailView";
import { JobData, JobState } from "@/services/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Filter, SlidersHorizontal, RefreshCw, ArrowLeft } from "lucide-react";

type SortOption = "newest" | "oldest" | "budget-high" | "budget-low" | "deadline-soon" | "deadline-far";

interface FilterOptions {
  searchQuery: string;
  minBudget: number;
  maxBudget: number;
  deadline: "all" | "today" | "week" | "month";
}

interface JobMarketplaceViewProps {
  onBack?: () => void;
}

export function JobMarketplaceView({ onBack }: JobMarketplaceViewProps) {
  const currentAccount = useCurrentAccount();
  const { jobs, isPending, error, refetch } = useOpenJobs(200);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    searchQuery: "",
    minBudget: 0,
    maxBudget: Number.MAX_SAFE_INTEGER,
    deadline: "all",
  });

  // Infinite scroll state
  const [displayLimit, setDisplayLimit] = useState(12);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // ======== Filtering Logic ========

  const filteredAndSortedJobs = useMemo(() => {
    if (!jobs || jobs.length === 0) return [];

    let filtered = [...jobs];

    // Text search (title only - description requires Walrus fetch)
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter((job) =>
        job.title.toLowerCase().includes(query)
      );
    }

    // Budget range filter
    filtered = filtered.filter((job) => {
      const budgetInSui = job.budget / 1_000_000_000;
      return budgetInSui >= filters.minBudget && budgetInSui <= filters.maxBudget;
    });

    // Deadline filter
    if (filters.deadline !== "all") {
      const now = Date.now();
      const deadlineThresholds = {
        today: now + 24 * 60 * 60 * 1000,
        week: now + 7 * 24 * 60 * 60 * 1000,
        month: now + 30 * 24 * 60 * 60 * 1000,
      };

      const threshold = deadlineThresholds[filters.deadline];
      filtered = filtered.filter((job) => job.deadline <= threshold);
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return b.createdAt - a.createdAt;
        case "oldest":
          return a.createdAt - b.createdAt;
        case "budget-high":
          return b.budget - a.budget;
        case "budget-low":
          return a.budget - b.budget;
        case "deadline-soon":
          return a.deadline - b.deadline;
        case "deadline-far":
          return b.deadline - a.deadline;
        default:
          return 0;
      }
    });

    return filtered;
  }, [jobs, filters, sortBy]);

  // Get jobs to display with limit
  const displayedJobs = useMemo(() => {
    return filteredAndSortedJobs.slice(0, displayLimit);
  }, [filteredAndSortedJobs, displayLimit]);

  const hasMoreJobs = useMemo(() => {
    return displayLimit < filteredAndSortedJobs.length;
  }, [displayLimit, filteredAndSortedJobs]);

  // ======== Infinite Scroll Effect ========

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreJobs && !isPending) {
          setDisplayLimit((prev) => prev + 12);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMoreJobs, isPending]);

  // ======== Event Handlers ========

  const handleRefresh = () => {
    refetch();
  };

  const handleResetFilters = () => {
    setFilters({
      searchQuery: "",
      minBudget: 0,
      maxBudget: Number.MAX_SAFE_INTEGER,
      deadline: "all",
    });
    setDisplayLimit(12); // Reset display limit
  };

  const handleJobClick = (job: JobData) => {
    setSelectedJobId(job.objectId);
  };

  const handleCloseJobDetail = () => {
    setSelectedJobId(null);
  };

  const handleApplySuccess = () => {
    refetch(); // Refresh job list after successful application
  };

  // ======== Render ========

  return (
    <>
      {/* Job Detail Modal */}
      {selectedJobId && (
        <JobDetailView
          jobId={selectedJobId}
          open={!!selectedJobId}
          onClose={handleCloseJobDetail}
          onApplySuccess={handleApplySuccess}
        />
      )}

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header with Back Button */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            {onBack && (
              <Button variant="outline" onClick={onBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <div className="flex-1">
              <h1 className="text-4xl font-bold">Job marketplace</h1>
            </div>
          </div>
          <p className="text-muted-foreground">
            Browse open freelance opportunities on the SUI blockchain
          </p>
        </div>

      {/* Error State */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            Error loading jobs: {error.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Search and Controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* Search Bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search jobs by title..."
                  value={filters.searchQuery}
                  onChange={(e) =>
                    setFilters({ ...filters, searchQuery: e.target.value })
                  }
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filters
              </Button>
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Advanced Filters */}
            {showFilters && (
              <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Budget Range */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Min Budget (SUI)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={filters.minBudget || ""}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        minBudget: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Max Budget (SUI)
                  </label>
                  <Input
                    type="number"
                    placeholder="No limit"
                    value={
                      filters.maxBudget === Number.MAX_SAFE_INTEGER
                        ? ""
                        : filters.maxBudget
                    }
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        maxBudget: Number(e.target.value) || Number.MAX_SAFE_INTEGER,
                      })
                    }
                  />
                </div>

                {/* Deadline Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Deadline
                  </label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    value={filters.deadline}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        deadline: e.target.value as FilterOptions["deadline"],
                      })
                    }
                  >
                    <option value="all">All deadlines</option>
                    <option value="today">Due today</option>
                    <option value="week">Due this week</option>
                    <option value="month">Due this month</option>
                  </select>
                </div>

                {/* Reset Filters */}
                <div className="md:col-span-3">
                  <Button variant="ghost" onClick={handleResetFilters}>
                    Reset Filters
                  </Button>
                </div>
              </div>
            )}

            {/* Sort Options */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Sort by:</span>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                  { value: "budget-high", label: "Highest Budget" },
                  { value: "budget-low", label: "Lowest Budget" },
                  { value: "deadline-soon", label: "Deadline Soon" },
                  { value: "deadline-far", label: "Deadline Far" },
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant={sortBy === option.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSortBy(option.value as SortOption)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Count */}
      {!isPending && (
        <div className="mb-4 text-sm text-muted-foreground flex items-center justify-between">
          <span>
            Showing {displayedJobs.length} of {filteredAndSortedJobs.length} jobs
            {filters.searchQuery && (
              <span> matching &quot;{filters.searchQuery}&quot;</span>
            )}
          </span>
          {hasMoreJobs && (
            <span className="text-blue-600">Scroll down for more jobs</span>
          )}
        </div>
      )}

      {/* Job List */}
      <JobList
        jobs={displayedJobs}
        isLoading={isPending}
        onJobClick={handleJobClick}
        currentUserAddress={currentAccount?.address}
      />

      {/* Infinite Scroll Trigger */}
      {hasMoreJobs && !isPending && (
        <div ref={loadMoreRef} className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Loading more jobs...</p>
        </div>
      )}

      {/* Load More Button (fallback for browsers that don't support IntersectionObserver) */}
      {hasMoreJobs && !isPending && (
        <div className="text-center mt-8">
          <Button
            onClick={() => setDisplayLimit((prev) => prev + 12)}
            variant="outline"
            size="lg"
          >
            Load More Jobs
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!isPending && filteredAndSortedJobs.length === 0 && jobs && jobs.length > 0 && (
        <Card className="mt-8">
          <CardContent className="py-12 text-center">
            <Filter className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No jobs match your filters</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your search criteria
            </p>
            <Button onClick={handleResetFilters}>Reset Filters</Button>
          </CardContent>
        </Card>
      )}

      {/* No Jobs Available */}
      {!isPending && jobs && jobs.length === 0 && (
        <Card className="mt-8">
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No jobs available</h3>
            <p className="text-muted-foreground mb-4">
              Be the first to post a job on the marketplace!
            </p>
            <Button>Post a job</Button>
          </CardContent>
        </Card>
      )}
    </div>
    </>
  );
}
