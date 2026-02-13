"use client";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { WalrusUpload } from "./WalrusUpload";
import { SealWhitelist } from "./SealWhitelist";
import { Resources } from "./Resources";
import { MyJobsView } from "./components/job/MyJobsView";
import { MyPortfolioView } from "./components/job/MyPortfolioView";
import { JobMarketplaceView } from "./JobMarketplaceView";
import { CreateJobView } from "./components/job/CreateJobView";
import { ClientJobDetailView } from "./components/job/ClientJobDetailView";
import { FreelancerJobDetailView } from "./components/job/FreelancerJobDetailView";
import { ProfileView } from "./components/profile/ProfileView";
import { ProfileSetupView } from "./components/profile/ProfileSetupView";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useView } from "./contexts/ViewContext";
import { useCurrentProfile } from "./hooks/useProfile";
import { ProfileType } from "./services/types";

function HomeContent() {
  const searchParams = useSearchParams();
  const currentAccount = useCurrentAccount();
  const { view, setView, selectedJobId, setSelectedJobId } = useView();
  const { profile } = useCurrentProfile();

  useEffect(() => {
    // Check for view query param (used by OAuth callback)
    const viewParam = searchParams.get("view");
    if (viewParam === "profileSetup") {
      setView("profileSetup");
      // Clear the query param from URL without reload
      window.history.replaceState({}, "", "/");
    }
  }, [setView, searchParams]);

  return (
    <div className="min-h-screen">
      <div className="container mx-auto p-6">
        <Card className="min-h-[500px]">
          <CardContent className="pt-6">
            {currentAccount ? (
              <div className="space-y-6">
                {/* Content based on view */}
                {view === "resources" && <Resources />}

                {view === "home" && (
                  <div className="space-y-6">
                    {/* Welcome Section */}
                    <div className="text-center py-8">
                      <div className="flex justify-center mb-4">
                        <div className="bg-white p-1 rounded-lg shadow-lg">
                          <Image
                            src="/assets/gignova_logo.jpg"
                            alt="GigNova"
                            width={300}
                            height={300}
                            priority
                            className="rounded-md"
                          />
                        </div>
                      </div>
                      <p className="text-lg text-muted-foreground mb-8">
                        Secure freelance work with encrypted deliverables and escrow payments
                      </p>
                    </div>

                    {/* Main Feature Navigation */}
                    <div className="flex flex-col gap-4 max-w-2xl mx-auto">
                      <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setView("marketplace")}>
                        <h3 className="text-2xl font-semibold mb-3">
                          Job marketplace
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          Browse and apply for open freelance jobs
                        </p>
                        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                          Browse open jobs
                        </Button>
                      </Card>

                      {profile?.profileType === ProfileType.CLIENT && (
                        <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setView("createJob")}>
                          <h3 className="text-2xl font-semibold mb-3">
                            Post a job
                          </h3>
                          <p className="text-muted-foreground mb-4">
                            Hire talented freelancers for your project
                          </p>
                          <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                            Create job
                          </Button>
                        </Card>
                      )}

                      {profile?.profileType === ProfileType.CLIENT && (
                        <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setView("myJobs")}>
                          <h3 className="text-2xl font-semibold mb-3">
                            My posted jobs
                          </h3>
                          <p className="text-muted-foreground mb-4">
                            Manage your active and completed jobs
                          </p>
                          <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                            View my posted jobs
                          </Button>
                        </Card>
                      )}

                      {profile?.profileType === ProfileType.FREELANCER && (
                        <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setView("myPortfolio")}>
                          <h3 className="text-2xl font-semibold mb-3">
                            My portfolio
                          </h3>
                          <p className="text-muted-foreground mb-4">
                            Track your assigned jobs and work progress
                          </p>
                          <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white">
                            View my portfolio
                          </Button>
                        </Card>
                      )}
                    </div>
                  </div>
                )}

                {/* Freelance Platform Views */}
                {view === "marketplace" && (
                  <JobMarketplaceView onBack={() => setView("home")} />
                )}

                {view === "myJobs" && (
                  <MyJobsView
                    onBack={() => setView("home")}
                    onViewJob={(jobId) => {
                      setSelectedJobId?.(jobId);
                      setView("jobDetail");
                    }}
                  />
                )}

                {view === "myPortfolio" && (
                  <MyPortfolioView
                    onBack={() => setView("home")}
                    onViewJob={(jobId) => {
                      setSelectedJobId?.(jobId);
                      setView("freelancerJobDetail");
                    }}
                  />
                )}

                {view === "createJob" && (
                  <CreateJobView
                    onBack={() => setView("home")}
                    onSuccess={(jobId) => {
                      console.log("Job created:", jobId);
                      setView("marketplace");
                    }}
                  />
                )}

                {view === "profile" && (
                  <ProfileView
                    onBack={() => setView("home")}
                    onCreateProfile={() => setView("profileSetup")}
                  />
                )}

                {view === "profileSetup" && (
                  <ProfileSetupView
                    onBack={() => setView("profile")}
                    onSuccess={() => setView("home")}
                  />
                )}

                {view === "jobDetail" && selectedJobId && (
                  <ClientJobDetailView
                    jobId={selectedJobId}
                    onBack={() => {
                      setSelectedJobId?.("");
                      setView("myJobs");
                    }}
                  />
                )}

                {view === "freelancerJobDetail" && selectedJobId && (
                  <FreelancerJobDetailView
                    jobId={selectedJobId}
                    onBack={() => {
                      setSelectedJobId?.("");
                      setView("myPortfolio");
                    }}
                  />
                )}

                {view === "walrus" && <WalrusUpload />}

                {view === "seal" && <SealWhitelist />}
              </div>
            ) : (
              <div className="space-y-6">
                {view === "resources" ? (
                  <Resources />
                ) : (
                  <div className="text-center py-12">
                    <h2 className="text-xl font-semibold mb-2">
                      Welcome to GigNova
                    </h2>
                    <p className="text-muted-foreground mb-4">
                      Please connect your wallet to get started
                    </p>
                    <p className="text-sm text-muted-foreground">
                      All documentation and resources are available in the{" "}
                      <strong>Resources</strong> tab in the navigation bar.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
