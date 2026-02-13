"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { MilestoneData } from "@/services/types";

interface MilestoneCardProps {
  milestone: MilestoneData;
  variant?: "compact" | "detailed";
  showAmount?: boolean;
}

export function MilestoneCard({
  milestone,
  variant = "detailed",
  showAmount = true
}: MilestoneCardProps) {
  // Determine status badge
  const getStatusBadge = () => {
    if (milestone.approved) {
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Approved
        </Badge>
      );
    }
    if (milestone.completed) {
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <AlertCircle className="h-3 w-3 mr-1" />
          Submitted
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
        <Clock className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    );
  };

  // Format SUI amount
  const formatAmount = (amount: number) => {
    return (amount / 1_000_000_000).toFixed(2);
  };

  if (variant === "compact") {
    return (
      <div className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
        <div className="flex items-center gap-3 flex-1">
          <Target className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{milestone.description || `Milestone #${milestone.id}`}</p>
            {showAmount && (
              <p className="text-xs text-muted-foreground">
                {formatAmount(milestone.amount)} SUI
              </p>
            )}
          </div>
        </div>
        {getStatusBadge()}
      </div>
    );
  }

  return (
    <Card className="border-blue-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-500" />
            Milestone #{milestone.id}
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Description</p>
          <p className="text-sm">{milestone.description || "No description provided"}</p>
        </div>

        {showAmount && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">Payment Amount</span>
            <span className="text-lg font-semibold text-blue-400">
              {formatAmount(milestone.amount)} SUI
            </span>
          </div>
        )}

        {milestone.submittedAt && (
          <div className="text-xs text-muted-foreground pt-1">
            Submitted: {new Date(milestone.submittedAt).toLocaleDateString()}
          </div>
        )}

        {milestone.approvedAt && (
          <div className="text-xs text-muted-foreground">
            Approved: {new Date(milestone.approvedAt).toLocaleDateString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
