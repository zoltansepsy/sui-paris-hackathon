/**
 * ProfileCard Component
 * Displays user profile information
 *
 * DEV 3 TODO:
 * 1. Implement profile data display
 * 2. Add avatar display
 * 3. Add rating stars visualization
 * 4. Add badge display
 * 5. Add verification badge
 * 6. Add responsive design
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { type ProfileData, ProfileType } from "../../services";

interface ProfileCardProps {
  profile: ProfileData;
  showDetails?: boolean;
}

export function ProfileCard({ profile, showDetails = true }: ProfileCardProps) {
  const formatRating = (rating: number) => {
    return (rating / 100).toFixed(2);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-4">
          {/* TODO: Add avatar image */}
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
            {profile.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <CardTitle className="flex items-center space-x-2">
              <span>{profile.username}</span>
              {profile.verified && (
                <Badge variant="secondary">Verified</Badge>
              )}
            </CardTitle>
            <div className="text-sm text-gray-600">
              {profile.profileType === ProfileType.FREELANCER ? "Freelancer" : "Client"}
            </div>
            {/* TODO: Add star rating display */}
            <div className="text-sm">
              Rating: {formatRating(profile.rating)} ({profile.ratingCount} reviews)
            </div>
          </div>
        </div>
      </CardHeader>
      {showDetails && (
        <CardContent>
          <div className="space-y-2">
            {profile.bio && (
              <p className="text-sm text-gray-700">{profile.bio}</p>
            )}
            {profile.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {profile.tags.map((tag, index) => (
                  <Badge key={index} variant="outline">{tag}</Badge>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 pt-4 text-sm">
              <div>
                <div className="text-gray-600">Completed Jobs</div>
                <div className="font-semibold">{profile.completedJobs}</div>
              </div>
              <div>
                <div className="text-gray-600">Total Jobs</div>
                <div className="font-semibold">{profile.totalJobs}</div>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
