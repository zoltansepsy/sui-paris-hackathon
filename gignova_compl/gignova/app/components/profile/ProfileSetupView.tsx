"use client";

import { useState } from "react";
import { useSuiClient, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { AuthService } from "@/services/authService";
import { createProfileService } from "@/services/profileService";
import { useNetworkVariable } from "@/networkConfig";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ProfileSetupViewProps {
  onBack?: () => void;
  onSuccess?: () => void;
}

/**
 * Profile Setup View Component
 * Shown when user needs to create a profile (after zkLogin or from profile page)
 */
export function ProfileSetupView({ onBack, onSuccess }: ProfileSetupViewProps) {
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const profilePackageId = useNetworkVariable("profileNftPackageId");
  const identityRegistryId = useNetworkVariable("identityRegistryId");

  const [profileType, setProfileType] = useState<0 | 1>(0); // 0 = Freelancer, 1 = Client
  const [username, setUsername] = useState("");
  const [realName, setRealName] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Get zkLogin info
  const jwt = AuthService.jwt();
  const jwtPayload = jwt ? JSON.parse(atob(jwt.split('.')[1])) : null;
  const email = jwtPayload?.email || "";
  const zkloginSub = jwtPayload?.sub || "";
  const address = jwt ? AuthService.walletAddress() : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (!zkloginSub || !email) {
        throw new Error("Missing zkLogin credentials. Please log in again.");
      }

      if (!username.trim()) {
        throw new Error("Username is required");
      }

      // Parse tags (comma-separated)
      const tagArray = tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      // Create profile service
      const profileService = createProfileService(
        suiClient,
        profilePackageId
      );

      console.log("Creating profile with:", {
        profileType,
        zkloginSub,
        email,
        username,
        realName,
        tags: tagArray,
        registryId: identityRegistryId,
      });

      // Build transaction
      const tx = profileService.createProfileTransaction(
        profileType,
        zkloginSub,
        email,
        username,
        realName,
        bio,
        tagArray,
        avatarUrl,
        identityRegistryId
      );

      // Execute transaction
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            console.log("Profile created successfully:", result);

            // Wait a bit for transaction to be indexed
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Call success callback
            onSuccess?.();
          },
          onError: (err) => {
            console.error("Failed to create profile:", err);
            setError(err.message || "Failed to create profile");
            setIsSubmitting(false);
          },
        }
      );
    } catch (err) {
      console.error("Profile creation error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsSubmitting(false);
    }
  };

  if (!jwt) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Not Authenticated</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Please log in with zkLogin first.
          </p>
          <Button onClick={onBack} className="w-full">
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Create Your Profile</CardTitle>
        <CardDescription>
          Welcome! Set up your profile to start using the platform.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Profile Type */}
          <div className="space-y-2">
            <Label>I am a...</Label>
            <div className="flex gap-4">
              <Button
                type="button"
                variant={profileType === 0 ? "default" : "outline"}
                onClick={() => setProfileType(0)}
                className="flex-1"
              >
                Freelancer
              </Button>
              <Button
                type="button"
                variant={profileType === 1 ? "default" : "outline"}
                onClick={() => setProfileType(1)}
                className="flex-1"
              >
                Client
              </Button>
            </div>
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label>Email (from Google)</Label>
            <Input value={email} disabled className="bg-muted" />
          </div>

          {/* zkLogin Address (read-only) */}
          <div className="space-y-2">
            <Label>Your zkLogin Address</Label>
            <Input
              value={address}
              disabled
              className="bg-muted font-mono text-xs"
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">
              Username <span className="text-red-500">*</span>
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="johndoe"
              required
            />
          </div>

          {/* Real Name */}
          <div className="space-y-2">
            <Label htmlFor="realName">Real Name (optional)</Label>
            <Input
              id="realName"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="John Doe"
            />
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={
                profileType === 0
                  ? "Full-stack developer with 5 years experience in blockchain..."
                  : "Looking for talented developers for my blockchain project..."
              }
              rows={4}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">
              {profileType === 0 ? "Skills" : "Industries"} (comma-separated)
            </Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={
                profileType === 0
                  ? "React, TypeScript, Sui, Smart Contracts"
                  : "Blockchain, DeFi, Gaming"
              }
            />
          </div>

          {/* Avatar URL */}
          <div className="space-y-2">
            <Label htmlFor="avatarUrl">Avatar URL (optional)</Label>
            <Input
              id="avatarUrl"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg or Walrus blob ID"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSubmitting}
              className="flex-1"
            >
              Skip for Now
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !username.trim()}
              className="flex-1"
            >
              {isSubmitting ? "Creating Profile..." : "Create Profile"}
            </Button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-muted rounded text-sm">
          <p className="font-semibold mb-2">Note:</p>
          <p className="text-muted-foreground">
            This profile will be stored on the SUI blockchain and linked to your zkLogin address.
            You'll need to approve a transaction to create it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
