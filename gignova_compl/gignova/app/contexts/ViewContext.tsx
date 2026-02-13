"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";

// Define all view types for the application
type ViewType =
  // Main platform views
  | 'home'
  | 'marketplace'
  | 'myJobs'
  | 'myPortfolio'
  | 'jobDetail'
  | 'freelancerJobDetail'
  | 'createJob'
  | 'profile'
  | 'profileSetup'
  // Demo/utility views
  | 'walrus'
  | 'seal'
  | 'resources';

interface ViewContextType {
  view: ViewType;
  setView: (view: ViewType) => void;
  // Optional: Store selected job ID for job detail view
  selectedJobId?: string;
  setSelectedJobId?: (id: string) => void;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewType>('home');
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(undefined);

  return (
    <ViewContext.Provider value={{ view, setView, selectedJobId, setSelectedJobId }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const context = useContext(ViewContext);
  if (context === undefined) {
    throw new Error('useView must be used within a ViewProvider');
  }
  return context;
}

