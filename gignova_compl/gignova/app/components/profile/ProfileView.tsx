/**
 * Profile View Component
 * Comprehensive profile display with view/edit modes and stats dashboard
 *
 * Features:
 * - View mode with detailed stats and ratings
 * - Edit mode with live preview
 * - Tag management (skills/industries)
 * - Rating display with star visualization
 * - Job history and active jobs
 * - Verification badge
 * - Profile type indicator (Freelancer/Client)
 * - Responsive design
 */

"use client";

import { useState, useMemo } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { useNetworkVariable } from "../../networkConfig";
import { useCurrentProfile } from "@/hooks";
import { createProfileService } from "@/services";
import { ProfileType } from "@/services/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Briefcase,
  Star,
  Award,
  DollarSign,
  Clock,
  Edit,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  Shield,
  Target,
  TrendingUp,
  Plus,
  Trash2,
} from "lucide-react";
import { formatSUI } from "@/utils";

interface ProfileViewProps {
  onBack?: () => void;
  onCreateProfile?: () => void;
}

export function ProfileView({ onBack, onCreateProfile }: ProfileViewProps) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const profilePackageId = useNetworkVariable("profileNftPackageId");
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const { profile, hasProfile, isPending, refetch } = useCurrentProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Profile type editing state
  const [isEditingProfileType, setIsEditingProfileType] = useState(false);
  const [newProfileType, setNewProfileType] = useState<ProfileType | null>(null);
  const [isChangingType, setIsChangingType] = useState(false);
  const [typeChangeError, setTypeChangeError] = useState<string | null>(null);

  // Edit form state
  const [editData, setEditData] = useState({
    username: "",
    realName: "",
    bio: "",
    tags: [] as string[],
    avatarUrl: "",
  });

  // New tag input
  const [newTag, setNewTag] = useState("");

  const profileService = useMemo(
    () => createProfileService(suiClient, profilePackageId),
    [suiClient, profilePackageId]
  );

  // Initialize edit data when entering edit mode
  const handleStartEdit = () => {
    if (profile) {
      setEditData({
        username: profile.username || "",
        realName: profile.realName || "",
        bio: profile.bio || "",
        tags: profile.tags || [],
        avatarUrl: profile.avatarUrl || "",
      });
    }
    setIsEditing(true);
    setError(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setError(null);
    setSuccess(false);
  };

  const handleAddTag = () => {
    if (newTag.trim() && !editData.tags.includes(newTag.trim())) {
      setEditData({
        ...editData,
        tags: [...editData.tags, newTag.trim()],
      });
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setEditData({
      ...editData,
      tags: editData.tags.filter((t) => t !== tag),
    });
  };

  const handleSave = async () => {
    if (!profile || !currentAccount) {
      setError("Profile not found");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Get ProfileCap (should be owned by user)
      const caps = await profileService.getProfileCapsByOwner(currentAccount.address);
      if (caps.length === 0) {
        throw new Error("ProfileCap not found");
      }

      const profileCap = caps[0];

      // Determine which fields changed
      const updates: any = {};
      if (editData.username !== profile.username) {
        updates.username = editData.username;
      }
      if (editData.realName !== profile.realName) {
        updates.realName = editData.realName;
      }
      if (editData.bio !== profile.bio) {
        updates.bio = editData.bio;
      }
      if (JSON.stringify(editData.tags) !== JSON.stringify(profile.tags)) {
        updates.tags = editData.tags;
      }
      if (editData.avatarUrl !== profile.avatarUrl) {
        updates.avatarUrl = editData.avatarUrl;
      }

      // Only update if something changed
      if (Object.keys(updates).length === 0) {
        setError("No changes to save");
        setIsSaving(false);
        return;
      }

      const tx = profileService.updateProfileTransaction(
        profile.objectId,
        profileCap.objectId,
        updates
      );

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await suiClient.waitForTransaction({ digest });
            setSuccess(true);
            setIsSaving(false);
            setIsEditing(false);

            // Refetch profile data
            setTimeout(() => {
              refetch();
              setSuccess(false);
            }, 2000);
          },
          onError: (error) => {
            console.error("Error updating profile:", error);
            setError(error.message || "Failed to update profile");
            setIsSaving(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Error updating profile:", error);
      setError(error.message || "Failed to update profile");
      setIsSaving(false);
    }
  };

  // Handle profile type change
  const handleProfileTypeChange = async () => {
    if (!profile || !currentAccount || newProfileType === null) {
      return;
    }

    // Check if change is allowed
    const blockReason = profileService.getProfileTypeChangeBlockReason(profile);
    if (blockReason) {
      setTypeChangeError(blockReason);
      return;
    }

    setIsChangingType(true);
    setTypeChangeError(null);

    try {
      // Get ProfileCap
      const caps = await profileService.getProfileCapsByOwner(currentAccount.address);
      if (caps.length === 0) {
        throw new Error("ProfileCap not found");
      }

      const profileCap = caps[0];

      const tx = profileService.updateProfileTypeTransaction(
        profile.objectId,
        profileCap.objectId,
        newProfileType
      );

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async ({ digest }) => {
            await suiClient.waitForTransaction({ digest });
            setSuccess(true);
            setIsChangingType(false);
            setIsEditingProfileType(false);
            setNewProfileType(null);

            // Refetch profile data
            setTimeout(() => {
              refetch();
              setSuccess(false);
            }, 2000);
          },
          onError: (error) => {
            console.error("Error changing profile type:", error);

            // Parse error for user-friendly message
            let errorMsg = error.message || "Failed to change account type";
            if (
              errorMsg.includes("ECannotChangeTypeWithActiveJobs") ||
              errorMsg.includes("MoveAbort") && errorMsg.includes("6")
            ) {
              errorMsg =
                "Cannot change account type while you have active jobs. Please complete or cancel them first.";
            }

            setTypeChangeError(errorMsg);
            setIsChangingType(false);
          },
        }
      );
    } catch (error: any) {
      console.error("Error changing profile type:", error);
      setTypeChangeError(error.message || "Failed to change account type");
      setIsChangingType(false);
    }
  };

  // Render star rating
  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating / 100);
    const hasHalfStar = (rating % 100) >= 50;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />);
      } else if (i === fullStars && hasHalfStar) {
        stars.push(<Star key={i} className="h-5 w-5 fill-yellow-400/50 text-yellow-400" />);
      } else {
        stars.push(<Star key={i} className="h-5 w-5 text-gray-300" />);
      }
    }

    return stars;
  };

  // Loading state
  if (isPending) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  // No profile state
  if (!hasProfile || !profile) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-2xl font-semibold mb-2">No Profile Found</h3>
            <p className="text-muted-foreground mb-6">
              Create your profile to start posting jobs or finding freelance work
            </p>
            <div className="flex gap-4 justify-center">
              {onBack && (
                <Button variant="outline" onClick={onBack}>
                  Go Back
                </Button>
              )}
              {onCreateProfile && (
                <Button onClick={onCreateProfile} className="bg-blue-600 hover:bg-blue-700">
                  Create Profile
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Profile exists - render view or edit mode
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              ← Back
            </Button>
          )}
          <div>
            <h1 className="text-4xl font-bold">My Profile</h1>
            <p className="text-muted-foreground">
              {profileService.getProfileTypeName(profile.profileType)}
            </p>
          </div>
        </div>
        {!isEditing && (
          <Button onClick={handleStartEdit} className="gap-2">
            <Edit className="h-4 w-4" />
            Edit Profile
          </Button>
        )}
      </div>

      {/* Success Message */}
      {success && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Profile updated successfully!
          </AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {isEditing ? "Edit Profile Information" : "Profile Information"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-6">
                <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white text-3xl font-bold">
                  {(isEditing ? editData.username : profile.username)?.charAt(0).toUpperCase() || "?"}
                </div>
                {isEditing && (
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-1 block">Avatar URL (optional)</label>
                    <Input
                      placeholder="Enter avatar URL or Walrus blob ID"
                      value={editData.avatarUrl}
                      onChange={(e) => setEditData({ ...editData, avatarUrl: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Future: Upload image to Walrus
                    </p>
                  </div>
                )}
              </div>

              {/* Username */}
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Username {isEditing && <span className="text-red-500">*</span>}
                </label>
                {isEditing ? (
                  <Input
                    placeholder="Your display name"
                    value={editData.username}
                    onChange={(e) => setEditData({ ...editData, username: e.target.value })}
                    maxLength={50}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-semibold">{profile.username}</p>
                    {profile.verified && (
                      <Badge className="bg-blue-600">
                        <Shield className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Real Name */}
              <div>
                <label className="text-sm font-medium mb-1 block">Real Name (optional)</label>
                {isEditing ? (
                  <Input
                    placeholder="Your real name"
                    value={editData.realName}
                    onChange={(e) => setEditData({ ...editData, realName: e.target.value })}
                    maxLength={100}
                  />
                ) : (
                  <p>{profile.realName || <span className="text-muted-foreground">Not provided</span>}</p>
                )}
              </div>

              {/* Bio */}
              <div>
                <label className="text-sm font-medium mb-1 block">Bio</label>
                {isEditing ? (
                  <textarea
                    className="w-full min-h-[100px] px-3 py-2 rounded-md border border-input bg-background text-sm"
                    placeholder="Tell us about yourself..."
                    value={editData.bio}
                    onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                    maxLength={500}
                  />
                ) : (
                  <p className="whitespace-pre-wrap">
                    {profile.bio || <span className="text-muted-foreground">No bio yet</span>}
                  </p>
                )}
                {isEditing && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {editData.bio.length}/500 characters
                  </p>
                )}
              </div>

              {/* Tags */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {profile.profileType === ProfileType.FREELANCER ? "Skills" : "Industries"}
                </label>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder={`Add a ${profile.profileType === ProfileType.FREELANCER ? "skill" : "industry"}`}
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                      />
                      <Button type="button" onClick={handleAddTag} size="sm">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {editData.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-2">
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {profile.tags && profile.tags.length > 0 ? (
                      profile.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">
                        No {profile.profileType === ProfileType.FREELANCER ? "skills" : "industries"} added
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Edit Actions */}
              {isEditing && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving || !editData.username.trim()}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reputation Card (View mode only) */}
          {!isEditing && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Reputation & Ratings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Rating Display */}
                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      {renderStars(profile.rating)}
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {profileService.formatRating(profile.rating)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {profile.ratingCount} {profile.ratingCount === 1 ? "review" : "reviews"}
                      </p>
                    </div>
                  </div>
                  {profile.ratingCount === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No ratings yet. Complete jobs to build your reputation.
                    </p>
                  )}
                </div>

                {/* Rating Progress Bar */}
                {profile.ratingCount > 0 && (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Rating</span>
                      <span className="font-medium">
                        {profileService.getRatingPercentage(profile.rating).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600"
                        style={{ width: `${profileService.getRatingPercentage(profile.rating)}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Stats Dashboard */}
        <div className="space-y-6">
          {/* Stats Cards */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Completed Jobs */}
              <div className="flex items-center justify-between p-3 bg-green-600 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-white" />
                  <div>
                    <p className="text-sm text-green-100">Completed</p>
                    <p className="text-2xl font-bold text-white">{profile.completedJobs}</p>
                  </div>
                </div>
              </div>

              {/* Total Jobs */}
              <div className="flex items-center justify-between p-3 bg-blue-600 rounded-lg">
                <div className="flex items-center gap-3">
                  <Briefcase className="h-8 w-8 text-white" />
                  <div>
                    <p className="text-sm text-blue-100">Total Jobs</p>
                    <p className="text-2xl font-bold text-white">{profile.totalJobs}</p>
                  </div>
                </div>
              </div>

              {/* Active Jobs */}
              <div className="flex items-center justify-between p-3 bg-yellow-600 rounded-lg">
                <div className="flex items-center gap-3">
                  <Clock className="h-8 w-8 text-white" />
                  <div>
                    <p className="text-sm text-yellow-100">Active</p>
                    <p className="text-2xl font-bold text-white">{profile.activeJobsCount}</p>
                  </div>
                </div>
              </div>

              {/* Total Amount */}
              <div className="flex items-center justify-between p-3 bg-purple-600 rounded-lg">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-8 w-8 text-white" />
                  <div>
                    <p className="text-sm text-purple-100">
                      {profile.profileType === ProfileType.FREELANCER ? "Earned" : "Spent"}
                    </p>
                    <p className="text-2xl font-bold text-white">{formatSUI(profile.totalAmount)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profile Type Card - Now Editable */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                Account Type
                {!isEditingProfileType && profile.activeJobsCount === 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditingProfileType(true);
                      setNewProfileType(profile.profileType);
                      setTypeChangeError(null);
                    }}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditingProfileType ? (
                <div className="space-y-4">
                  {/* Type Selection Buttons */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={newProfileType === ProfileType.FREELANCER ? "default" : "outline"}
                      onClick={() => setNewProfileType(ProfileType.FREELANCER)}
                      className={`flex-1 ${newProfileType === ProfileType.FREELANCER ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                      size="sm"
                    >
                      Freelancer
                    </Button>
                    <Button
                      type="button"
                      variant={newProfileType === ProfileType.CLIENT ? "default" : "outline"}
                      onClick={() => setNewProfileType(ProfileType.CLIENT)}
                      className={`flex-1 ${newProfileType === ProfileType.CLIENT ? "bg-green-600 hover:bg-green-700" : ""}`}
                      size="sm"
                    >
                      Client
                    </Button>
                  </div>

                  {/* Warning Message */}
                  <Alert className="bg-yellow-900/20 border-yellow-700">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription className="text-yellow-200 text-xs">
                      Changing your account type will affect which features you can access.
                      {newProfileType === ProfileType.FREELANCER
                        ? " As a Freelancer, you can apply for jobs but cannot post them."
                        : " As a Client, you can post jobs but cannot apply for them."}
                    </AlertDescription>
                  </Alert>

                  {/* Error Display */}
                  {typeChangeError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">{typeChangeError}</AlertDescription>
                    </Alert>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      onClick={handleProfileTypeChange}
                      disabled={isChangingType || newProfileType === profile.profileType}
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      {isChangingType ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                          Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditingProfileType(false);
                        setNewProfileType(null);
                        setTypeChangeError(null);
                      }}
                      disabled={isChangingType}
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Badge className={profile.profileType === ProfileType.FREELANCER ? "bg-blue-600" : "bg-green-600"}>
                    {profileService.getProfileTypeName(profile.profileType)}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    {profile.profileType === ProfileType.FREELANCER
                      ? "You can apply for jobs and complete work for clients"
                      : "You can post jobs and hire freelancers"}
                  </p>

                  {/* Show warning if cannot change */}
                  {profile.activeJobsCount > 0 && (
                    <p className="text-xs text-yellow-500 mt-2">
                      Complete your {profile.activeJobsCount} active job(s) to change account type
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Account Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Account Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Wallet Address</p>
                <p className="font-mono text-xs break-all">{profile.owner}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Profile ID</p>
                <p className="font-mono text-xs break-all">{profile.objectId}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Member Since</p>
                <p>{new Date(profile.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Last Updated</p>
                <p>{new Date(profile.updatedAt).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
