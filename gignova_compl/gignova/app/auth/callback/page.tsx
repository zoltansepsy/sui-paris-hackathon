"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSuiClient } from "@mysten/dapp-kit";
import { AuthService } from "@/services/authService";
import { createProfileService } from "@/services/profileService";
import { useNetworkVariable } from "@/networkConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * OAuth Callback Page
 * Handles the redirect from Google OAuth and extracts the JWT token
 */
export default function CallbackPage() {
  const router = useRouter();
  const suiClient = useSuiClient();
  const profilePackageId = useNetworkVariable("profileNftPackageId");
  const identityRegistryId = useNetworkVariable("identityRegistryId");
  const [status, setStatus] = useState<
    "loading" | "checking_profile" | "success" | "redirect_setup" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [message, setMessage] = useState<string>("Processing login...");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Extract id_token from URL hash
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const idToken = params.get("id_token");

        if (!idToken) {
          throw new Error("No id_token found in callback URL");
        }

        setMessage("Saving authentication token...");
        // Save JWT to sessionStorage
        AuthService.saveJwt(idToken);

        // Get the zkLogin wallet address
        const address = AuthService.walletAddress();
        console.log("zkLogin address:", address);

        // Extract email and sub from JWT for profile creation
        const jwtPayload = JSON.parse(atob(idToken.split('.')[1]));
        const email = jwtPayload.email || "unknown@email.com";
        const zkloginSub = jwtPayload.sub;

        console.log("User authenticated:", { address, email, zkloginSub });

        setStatus("checking_profile");
        setMessage("Checking if profile exists...");

        // Check if profile already exists by checking IdentityRegistry
        const profileService = createProfileService(
          suiClient,
          profilePackageId
        );

        // First check IdentityRegistry (authoritative source for zkLogin profiles)
        const profileIdFromRegistry = await profileService.getProfileIdByZkLoginSub(
          identityRegistryId,
          zkloginSub
        );

        let existingProfile = null;
        if (profileIdFromRegistry) {
          // Profile exists in registry, fetch full profile data
          existingProfile = await profileService.getProfile(profileIdFromRegistry);
        } else {
          // Fallback: check by owner address (in case registry lookup fails)
          existingProfile = await profileService.getProfileByOwner(address);
        }

        if (existingProfile) {
          // Profile exists, redirect to home
          console.log("Profile found:", existingProfile);
          setStatus("success");
          setMessage("Welcome back! Redirecting...");

          setTimeout(() => {
            router.push("/");
          }, 1500);
        } else {
          // No profile, redirect to setup
          console.log("No profile found, redirecting to setup");
          setStatus("redirect_setup");
          setMessage("Setting up your profile...");

          setTimeout(() => {
            router.push("/?view=profileSetup");
          }, 1500);
        }
      } catch (error) {
        console.error("OAuth callback error:", error);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Unknown error occurred"
        );
      }
    };

    handleCallback();
  }, [router, suiClient]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">
            {status === "loading" && "Processing Login..."}
            {status === "checking_profile" && "Checking Profile..."}
            {status === "success" && "Login Successful!"}
            {status === "redirect_setup" && "Profile Setup Required"}
            {status === "error" && "Login Failed"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          {(status === "loading" || status === "checking_profile") && (
            <div className="space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground">{message}</p>
            </div>
          )}

          {(status === "success" || status === "redirect_setup") && (
            <div className="space-y-4">
              <div className="text-green-600 text-5xl">✓</div>
              <p className="text-muted-foreground">{message}</p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <div className="text-red-600 text-5xl">✕</div>
              <p className="text-red-600 font-medium">{errorMessage}</p>
              <Button onClick={() => router.push("/")} className="w-full">
                Return to Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
