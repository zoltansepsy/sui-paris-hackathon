/**
 * Create Job View Component
 * Multi-step form for posting a new job with escrow
 *
 * Features:
 * - 4-step wizard (Info → Budget → Milestones → Review)
 * - Walrus integration for job description upload (TEMPORARILY DISABLED - see TODO below)
 * - Milestone management with validation
 * - Budget allocation and escrow setup
 * - Profile requirement check
 * - Real-time form validation
 * - Preview before submission
 *
 * ============================================================================
 * TODO: WALRUS INTEGRATION (Currently using dummy blob IDs for hackathon)
 * ============================================================================
 *
 * Current Status: Walrus upload is COMMENTED OUT to speed up development.
 * Using dummy blob IDs instead (format: dummy-job-{timestamp}-{random})
 *
 * To RESTORE Walrus Integration:
 * 1. Uncomment walrusService creation (line ~110)
 * 2. Uncomment state variables: uploadingDescription, uploadProgress, descriptionBlobId (lines ~95-97)
 * 3. Uncomment Walrus upload flow in handleSubmit (lines ~226-304)
 * 4. Remove generateDummyBlobId() call (line ~228)
 * 5. Uncomment progress UI (lines ~843-890)
 * 6. Update submit button text (lines ~917-923)
 *
 * All Walrus code is preserved below with TODO markers for easy restoration.
 * ============================================================================
 */

"use client";

import { useState, useMemo } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { useNetworkVariable } from "../../networkConfig";
import { useCurrentProfile, useSuiBalance } from "@/hooks";
import { createJobService } from "@/services"; // createWalrusService removed temporarily
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Calendar,
  Clock,
  Target,
  FileText,
  Plus,
  Trash2,
  Eye,
  Upload,
} from "lucide-react";
import { formatSUI, suiToMist, isValidSuiAmount } from "@/utils";

type Step = 1 | 2 | 3 | 4;

interface Milestone {
  description: string;
  amount: number; // in MIST
  amountSui?: string; // User input in SUI (preserves decimal format)
}

interface JobFormData {
  title: string;
  description: string;
  budgetSui: string; // User input in SUI
  deadline: string; // Date string (YYYY-MM-DD)
  deadlineTime: string; // Time string (HH:MM)
  milestones: Milestone[];
}

interface CreateJobViewProps {
  onBack?: () => void;
  onSuccess?: (jobId: string) => void;
}

export function CreateJobView({ onBack, onSuccess }: CreateJobViewProps) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const jobPackageId = useNetworkVariable("jobEscrowPackageId");
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const { profile, hasProfile, isPending: profileLoading } = useCurrentProfile();
  const { balance: walletBalance, isPending: balanceLoading } = useSuiBalance();

  // Multi-step state
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [formData, setFormData] = useState<JobFormData>({
    title: "",
    description: "",
    budgetSui: "",
    deadline: "",
    deadlineTime: "23:59",
    milestones: [],
  });

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  // TODO: RESTORE WALRUS - Uncomment these state variables when restoring Walrus integration
  // const [uploadingDescription, setUploadingDescription] = useState(false);
  // const [uploadProgress, setUploadProgress] = useState<string>("");
  // const [descriptionBlobId, setDescriptionBlobId] = useState<string | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);
  const [addingMilestones, setAddingMilestones] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Services
  const jobService = useMemo(
    () => createJobService(suiClient, jobPackageId),
    [suiClient, jobPackageId]
  );

  // TODO: RESTORE WALRUS - Uncomment walrusService when restoring Walrus integration
  // const walrusService = useMemo(
  //   () => createWalrusService({ network: "testnet", epochs: 10 }),
  //   []
  // );

  // Calculate total budget in MIST
  const budgetMist = useMemo(() => {
    if (!formData.budgetSui || !isValidSuiAmount(formData.budgetSui)) return 0;
    return suiToMist(parseFloat(formData.budgetSui));
  }, [formData.budgetSui]);

  // Calculate total milestone amount
  const totalMilestoneAmount = useMemo(() => {
    return formData.milestones.reduce((sum, m) => sum + m.amount, 0);
  }, [formData.milestones]);

  // Calculate remaining budget
  const remainingBudget = useMemo(() => {
    return budgetMist - totalMilestoneAmount;
  }, [budgetMist, totalMilestoneAmount]);

  // Validation for each step
  const isStep1Valid = useMemo(() => {
    return formData.title.trim().length > 0 && formData.description.trim().length > 0;
  }, [formData.title, formData.description]);

  // Check if budget exceeds wallet balance
  const budgetExceedsBalance = useMemo(() => {
    if (balanceLoading || !budgetMist) return false;
    return budgetMist >= Number(walletBalance);
  }, [budgetMist, walletBalance, balanceLoading]);

  const isStep2Valid = useMemo(() => {
    if (!formData.budgetSui || !isValidSuiAmount(formData.budgetSui)) return false;
    if (!formData.deadline) return false;

    // Check deadline is in the future
    const deadlineDate = new Date(`${formData.deadline}T${formData.deadlineTime}`);
    if (deadlineDate <= new Date()) return false;

    // Check budget doesn't exceed wallet balance (must leave some for gas)
    if (budgetExceedsBalance) return false;

    return true;
  }, [formData.budgetSui, formData.deadline, formData.deadlineTime, budgetExceedsBalance]);

  const isStep3Valid = useMemo(() => {
    // At least one milestone is required
    if (formData.milestones.length === 0) return false;

    // All milestones must have description and amount > 0
    const allValid = formData.milestones.every(
      (m) => m.description.trim().length > 0 && m.amount > 0
    );

    // Total must not exceed budget
    return allValid && totalMilestoneAmount <= budgetMist;
  }, [formData.milestones, totalMilestoneAmount, budgetMist]);

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 1:
        return isStep1Valid;
      case 2:
        return isStep2Valid;
      case 3:
        return isStep3Valid;
      case 4:
        return isStep1Valid && isStep2Valid && isStep3Valid;
      default:
        return false;
    }
  }, [currentStep, isStep1Valid, isStep2Valid, isStep3Valid]);

  // ======== Event Handlers ========

  const handleNext = () => {
    if (canProceed && currentStep < 4) {
      setCurrentStep((prev) => (prev + 1) as Step);
      setError(null);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as Step);
      setError(null);
    } else if (onBack) {
      onBack();
    }
  };

  const handleAddMilestone = () => {
    setFormData((prev) => ({
      ...prev,
      milestones: [...prev.milestones, { description: "", amount: 0 }],
    }));
  };

  const handleRemoveMilestone = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      milestones: prev.milestones.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateMilestone = (index: number, field: keyof Milestone, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m, i) =>
        i === index ? { ...m, [field]: value } : m
      ),
    }));
  };

  const handleSubmit = async () => {
    if (!currentAccount || !hasProfile || !profile) {
      setError("You need a profile to post jobs");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // TODO: RESTORE WALRUS - Step 1: Upload description to Walrus
      // Currently storing description text directly (not using Walrus)
      const descriptionText = formData.description;
      console.log('📝 Using description text directly (length:', descriptionText.length, 'chars)');

      /* ============================================================================
       * TODO: RESTORE WALRUS UPLOAD - Uncomment this entire section
       * ============================================================================
       *
       * // Step 1: Upload description to Walrus using writeFilesFlow
       * setUploadingDescription(true);
       *
       * // Create upload flow for browser environment (avoids popup blocking)
       * const flow = walrusService.uploadWithFlow(
       *   [
       *     {
       *       contents: formData.description,
       *       identifier: `job-${Date.now()}.txt`,
       *       tags: {
       *         "content-type": "text/plain",
       *         "job-title": formData.title,
       *         "created-at": new Date().toISOString(),
       *       },
       *     },
       *   ],
       *   {
       *     epochs: 10, // ~30 days storage on testnet
       *     deletable: false, // Permanent job description
       *   }
       * );
       *
       * // Encode files
       * setUploadProgress("Encoding description...");
       * await flow.encode();
       *
       * // Register on blockchain
       * setUploadProgress("Registering on blockchain...");
       * const registerTx = flow.register({
       *   owner: currentAccount.address,
       *   epochs: 10,
       *   deletable: false,
       * });
       *
       * // Execute register transaction
       * await new Promise<void>((resolve, reject) => {
       *   signAndExecute(
       *     { transaction: registerTx },
       *     {
       *       onSuccess: async ({ digest }) => {
       *         await suiClient.waitForTransaction({ digest });
       *
       *         // Upload to storage nodes
       *         setUploadProgress("Uploading to Walrus storage...");
       *         await flow.upload({ digest });
       *
       *         // Certify on blockchain
       *         setUploadProgress("Certifying upload...");
       *         const certifyTx = flow.certify();
       *
       *         signAndExecute(
       *           { transaction: certifyTx },
       *           {
       *             onSuccess: async ({ digest: certifyDigest }) => {
       *               await suiClient.waitForTransaction({ digest: certifyDigest });
       *               setUploadProgress("Upload complete!");
       *               resolve();
       *             },
       *             onError: (error) => {
       *               console.error("Certify transaction failed:", error);
       *               reject(error);
       *             },
       *           }
       *         );
       *       },
       *       onError: (error) => {
       *         console.error("Register transaction failed:", error);
       *         reject(error);
       *       },
       *     }
       *   );
       * });
       *
       * // Get blob ID from completed upload
       * const uploadedFiles = await flow.listFiles();
       * const blobId = uploadedFiles[0].blobId;
       * setDescriptionBlobId(blobId);
       * setUploadingDescription(false);
       *
       * ============================================================================
       * END OF WALRUS UPLOAD CODE
       * ============================================================================
       */

      // Step 2: Calculate deadline timestamp
      const deadlineDate = new Date(`${formData.deadline}T${formData.deadlineTime}`);
      const deadlineTimestamp = deadlineDate.getTime();

      // Step 3: Create job transaction
      setCreatingJob(true);
      const tx = jobService.createJobTransaction(
        profile.objectId,
        formData.title,
        descriptionText, // Pass actual description text instead of blob ID
        budgetMist,
        deadlineTimestamp
      );

      // Step 4: Sign and execute
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            console.log("🎉 Job creation transaction succeeded:", digest);

            // Extract job ID from transaction (waitForTransaction is called inside)
            const result = await jobService.waitForTransactionAndGetCreatedObjects(digest);

            if (result) {
              const { jobId, jobCapId, jobSharedObjectRef } = result;
              console.log("✅ Successfully extracted job objects:", {
                jobId,
                jobCapId,
                hasSharedObjectRef: !!jobSharedObjectRef
              });
              setCreatingJob(false);

              // Step 5: Add milestones if any
              if (formData.milestones.length > 0) {
                setAddingMilestones(true);

                console.log(
                  `📊 Adding ${formData.milestones.length} milestone(s) to job...`
                );

                try {
                  for (let i = 0; i < formData.milestones.length; i++) {
                    const milestone = formData.milestones[i];
                    console.log(
                      `📊 Adding milestone ${i + 1}/${formData.milestones.length}: "${milestone.description.substring(0, 30)}..."`
                    );

                    const milestoneTx = jobService.addMilestoneTransaction(
                      jobId,
                      jobCapId,
                      milestone.description,
                      milestone.amount,
                      jobSharedObjectRef
                    );

                    await new Promise<void>((resolve, reject) => {
                      signAndExecute(
                        { transaction: milestoneTx },
                        {
                          onSuccess: async ({ digest }) => {
                            console.log(`✅ Milestone ${i + 1} added, digest:`, digest);
                            await suiClient.waitForTransaction({ digest });
                            resolve();
                          },
                          onError: (error) => {
                            console.error(`❌ Failed to add milestone ${i + 1}:`, error);
                            reject(error);
                          }
                        }
                      );
                    });
                  }

                  console.log("✅ All milestones added successfully");
                } catch (milestoneError) {
                  console.error("❌ Error adding milestones:", milestoneError);

                  // Job was created successfully, just milestone addition failed
                  const errorMsg = milestoneError instanceof Error ? milestoneError.message : 'Unknown error';
                  setError(`Job created successfully (ID: ${jobId.substring(0, 8)}...), but failed to add milestones: ${errorMsg}. You can add milestones manually from the job page.`);
                  setAddingMilestones(false);
                  setIsSubmitting(false);

                  // Still redirect to the job page after delay
                  setTimeout(() => {
                    if (onSuccess) {
                      onSuccess(jobId);
                    }
                  }, 3000);
                  return;
                }

                setAddingMilestones(false);
              }

              setSuccess(true);
              setIsSubmitting(false);

              // Redirect after 2 seconds
              setTimeout(() => {
                if (onSuccess) {
                  onSuccess(jobId);
                }
              }, 2000);
            } else {
              // Failed to extract job objects from transaction
              console.error("❌ Failed to extract job ID from transaction");
              console.error("Transaction digest:", digest);

              // Try to query the transaction to see what happened
              try {
                const txResult = await suiClient.getTransactionBlock({
                  digest,
                  options: {
                    showEffects: true,
                    showObjectChanges: true,
                  }
                });
                console.error("❌ Transaction result:", JSON.stringify(txResult, null, 2));
              } catch (queryError) {
                console.error("❌ Failed to query transaction:", queryError);
              }

              throw new Error("Failed to extract job details from transaction. The job may have been created - please check your profile. If you see the job there, you can add milestones manually from the job page.");
            }
          },
          onError: (error) => {
            console.error("Error creating job:", error);
            setError(error.message || "Failed to create job");
            setIsSubmitting(false);
            setCreatingJob(false);
            setAddingMilestones(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Error creating job:", error);
      setError(error.message || "Failed to create job");
      setIsSubmitting(false);
      setCreatingJob(false);
      setAddingMilestones(false);
    }
  };

  // ======== Profile Check ========

  if (profileLoading) {
    return (
      <div className="py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading your profile...</p>
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-yellow-600 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Profile Required</h3>
          <p className="text-muted-foreground mb-6">
            You need to create a profile before posting jobs
          </p>
          <Button onClick={onBack}>Go Back</Button>
        </CardContent>
      </Card>
    );
  }

  // ======== Render ========

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="outline" onClick={handleBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-4xl font-bold">Post a job</h1>
          </div>
        </div>
        <p className="text-muted-foreground">
          Create a new job posting with escrow payment protection
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <Alert className="mb-6 bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Job created successfully! Redirecting to marketplace...
          </AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center flex-1">
              <div className="flex items-center gap-2">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold ${
                    currentStep >= step
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {currentStep > step ? <CheckCircle className="h-5 w-5" /> : step}
                </div>
                <span
                  className={`hidden md:inline text-sm font-medium ${
                    currentStep >= step ? "text-blue-600" : "text-gray-600"
                  }`}
                >
                  {step === 1 && "Info"}
                  {step === 2 && "Budget"}
                  {step === 3 && "Milestones"}
                  {step === 4 && "Review"}
                </span>
              </div>
              {step < 4 && (
                <div
                  className={`h-1 flex-1 mx-2 ${
                    currentStep > step ? "bg-blue-600" : "bg-gray-200"
                  }`}
                ></div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">
          {/* Step 1: Job Information */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <CardTitle className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5" />
                  Job Information
                </CardTitle>
                <CardDescription>
                  Provide the basic details about your job
                </CardDescription>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Job Title <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g., Senior Web Developer"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.title.length}/100 characters
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Job description <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full min-h-[200px] px-3 py-2 rounded-md border border-input bg-background text-sm"
                  placeholder="Describe the job requirements, skills needed, deliverables, etc..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  maxLength={5000}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.description.length}/5000 characters
                  {/* TODO: RESTORE WALRUS - Add back: • Will be stored on Walrus */}
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Budget & Deadline */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <CardTitle className="flex items-center gap-2 mb-4">
                  <DollarSign className="h-5 w-5" />
                  Budget & Deadline
                </CardTitle>
                <CardDescription>
                  Set the total budget and project deadline
                </CardDescription>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Total budget (SUI) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.budgetSui}
                    onChange={(e) =>
                      setFormData({ ...formData, budgetSui: e.target.value })
                    }
                    className="pl-10"
                  />
                </div>
                <div className="flex justify-between items-center mt-1">
                  {formData.budgetSui && budgetMist > 0 && (
                    <p className="text-xs text-muted-foreground">
                      = {budgetMist.toLocaleString()} MIST (smallest unit)
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground ml-auto">
                    Wallet: {formatSUI(Number(walletBalance))}
                  </p>
                </div>
                {budgetExceedsBalance && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Budget exceeds your wallet balance. You need to leave some SUI for gas fees.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Deadline Date <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      id="deadline-date-input"
                      type="date"
                      value={formData.deadline}
                      onChange={(e) =>
                        setFormData({ ...formData, deadline: e.target.value })
                      }
                      min={new Date().toISOString().split("T")[0]}
                      className="pr-10"
                    />
                    <Calendar
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer"
                      onClick={() => {
                        const input = document.getElementById('deadline-date-input') as HTMLInputElement;
                        input?.showPicker?.();
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Deadline Time
                  </label>
                  <div className="relative">
                    <Input
                      id="deadline-time-input"
                      type="time"
                      value={formData.deadlineTime}
                      onChange={(e) =>
                        setFormData({ ...formData, deadlineTime: e.target.value })
                      }
                      className="pr-10"
                    />
                    <Clock
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer"
                      onClick={() => {
                        const input = document.getElementById('deadline-time-input') as HTMLInputElement;
                        input?.showPicker?.();
                      }}
                    />
                  </div>
                </div>
              </div>

              {formData.deadline && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <Calendar className="inline h-4 w-4 mr-2" />
                    Deadline: {new Date(`${formData.deadline}T${formData.deadlineTime}`).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Milestones */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <CardTitle className="flex items-center gap-2 mb-4">
                  <Target className="h-5 w-5" />
                  Milestones <span className="text-red-500">*</span>
                </CardTitle>
                <CardDescription>
                  Break your project into verifiable stages with partial payments (at least one milestone required)
                </CardDescription>
              </div>

              {/* Budget Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total budget</p>
                    <p className="text-lg font-bold">{formatSUI(budgetMist)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Allocated</p>
                    <p className="text-lg font-bold text-blue-600">
                      {formatSUI(totalMilestoneAmount)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p
                      className={`text-lg font-bold ${
                        remainingBudget < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {remainingBudget < 0
                        ? `-${formatSUI(Math.abs(remainingBudget))}`
                        : formatSUI(remainingBudget)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {remainingBudget < 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Milestone total exceeds budget by {formatSUI(Math.abs(remainingBudget))}
                  </AlertDescription>
                </Alert>
              )}

              {/* Milestone List */}
              <div className="space-y-4">
                {formData.milestones.map((milestone, index) => (
                  <Card key={index} className="border-2">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 space-y-3">
                          <div>
                            <label className="text-xs font-medium mb-1 block">
                              Milestone #{index + 1} Description
                            </label>
                            <Input
                              placeholder="e.g., Final deliverable"
                              value={milestone.description}
                              onChange={(e) =>
                                handleUpdateMilestone(index, "description", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium mb-1 block">
                              Amount (SUI)
                            </label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={milestone.amountSui ?? (milestone.amount > 0 ? (milestone.amount / 1_000_000_000).toString() : "")}
                              onChange={(e) => {
                                const sui = parseFloat(e.target.value) || 0;
                                handleUpdateMilestone(index, "amountSui", e.target.value);
                                handleUpdateMilestone(index, "amount", suiToMist(sui));
                              }}
                            />
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveMilestone(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Button
                  variant="outline"
                  onClick={handleAddMilestone}
                  className="w-full"
                  disabled={remainingBudget <= 0 && formData.milestones.length > 0}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add milestone
                </Button>
              </div>

              {formData.milestones.length === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    At least one milestone is required. Click "Add milestone" to create one.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step 4: Review & Submit */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <CardTitle className="flex items-center gap-2 mb-4">
                  <Eye className="h-5 w-5" />
                  Review & Submit
                </CardTitle>
                <CardDescription>
                  Review your job posting before submitting to the blockchain
                </CardDescription>
              </div>

              {/* Job Preview */}
              <Card className="border-2 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-2xl">{formData.title}</CardTitle>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="default">OPEN</Badge>
                    <Badge variant="secondary">{formatSUI(budgetMist)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Description</h4>
                    <p className="text-sm text-foreground whitespace-pre-wrap bg-muted p-4 rounded">
                      {formData.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Budget</h4>
                      <p className="text-lg font-bold text-green-600">
                        {formatSUI(budgetMist)}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Deadline</h4>
                      <p className="text-sm">
                        {new Date(`${formData.deadline}T${formData.deadlineTime}`).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {formData.milestones.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">
                        Milestones ({formData.milestones.length})
                      </h4>
                      <div className="space-y-2">
                        {formData.milestones.map((m, i) => (
                          <div
                            key={i}
                            className="flex justify-between items-center p-3 bg-muted rounded"
                          >
                            <span className="text-sm text-foreground">{m.description}</span>
                            <span className="font-semibold text-foreground">{formatSUI(m.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <h4 className="font-semibold mb-2">What happens next?</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      {/* TODO: RESTORE WALRUS - Uncomment this when restoring Walrus
                      <li>Job description will be uploaded to Walrus (decentralized storage)</li>
                      */}
                      <li>Escrow funds will be locked in smart contract</li>
                      <li>Job will appear in marketplace for freelancers</li>
                      <li>You'll receive JobCap NFT to manage the job</li>
                      <li>Funds released only when you approve milestones</li>
                    </ol>
                  </div>
                </CardContent>
              </Card>

              {/* Progress Display */}
              {isSubmitting && (
                <Card className="border-2 border-blue-200 bg-blue-50">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-blue-900">Creating Your Job</h4>
                          <p className="text-sm text-blue-700">
                            {creatingJob ? "Creating job and locking escrow..." :
                             addingMilestones ? "Adding milestones..." :
                             "Processing..."}
                          </p>
                        </div>
                      </div>

                      {/* Progress Steps */}
                      <div className="space-y-2 pl-11">
                        {/* TODO: RESTORE WALRUS - Uncomment this step when restoring Walrus
                        <div className={`flex items-center gap-2 text-sm ${uploadingDescription ? 'text-blue-900 font-medium' : 'text-blue-600'}`}>
                          {uploadingDescription ? (
                            <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></div>
                          ) : descriptionBlobId ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <div className="h-2 w-2 rounded-full border-2 border-blue-300"></div>
                          )}
                          <span>Upload description to Walrus</span>
                        </div>
                        */}

                        <div className={`flex items-center gap-2 text-sm ${creatingJob ? 'text-blue-900 font-medium' : 'text-blue-600'}`}>
                          {creatingJob ? (
                            <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></div>
                          ) : isSubmitting && !creatingJob && !addingMilestones ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <div className="h-2 w-2 rounded-full border-2 border-blue-300"></div>
                          )}
                          <span>Create job and lock escrow</span>
                        </div>

                        {formData.milestones.length > 0 && (
                          <div className={`flex items-center gap-2 text-sm ${addingMilestones ? 'text-blue-900 font-medium' : 'text-blue-600'}`}>
                            {addingMilestones ? (
                              <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></div>
                            ) : !creatingJob && !addingMilestones && isSubmitting ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <div className="h-2 w-2 rounded-full border-2 border-blue-300"></div>
                            )}
                            <span>Add {formData.milestones.length} milestone{formData.milestones.length > 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>

                      <Alert className="bg-white border-blue-300">
                        <AlertCircle className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-sm text-blue-800">
                          Please approve the transactions in your wallet. This may require {formData.milestones.length > 0 ? formData.milestones.length + 1 : 1} signature{formData.milestones.length > 0 ? 's' : ''}.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {currentStep === 1 ? "Cancel" : "Previous"}
            </Button>

            {currentStep < 4 ? (
              <Button onClick={handleNext} disabled={!canProceed}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!canProceed || isSubmitting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {/* TODO: RESTORE WALRUS - Add back uploadingDescription check */}
                    {creatingJob ? "Creating Job..." :
                     addingMilestones ? "Adding Milestones..." :
                     "Processing..."}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Create Job & Lock Escrow
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
