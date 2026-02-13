"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { AuthService } from "@/services/authService";

interface ZkLoginContextType {
  isAuthenticated: boolean;
  walletAddress: string | null;
  login: () => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const ZkLoginContext = createContext<ZkLoginContextType | undefined>(
  undefined
);

export function ZkLoginProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = () => {
      try {
        const authenticated = AuthService.isAuthenticated();
        setIsAuthenticated(authenticated);

        if (authenticated) {
          const address = AuthService.walletAddress();
          setWalletAddress(address);
        }
      } catch (error) {
        console.error("Error checking auth status:", error);
        setIsAuthenticated(false);
        setWalletAddress(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async () => {
    const authService = new AuthService();
    await authService.login();
  };

  const logout = () => {
    AuthService.clearSession();
    setIsAuthenticated(false);
    setWalletAddress(null);
  };

  return (
    <ZkLoginContext.Provider
      value={{
        isAuthenticated,
        walletAddress,
        login,
        logout,
        isLoading,
      }}
    >
      {children}
    </ZkLoginContext.Provider>
  );
}

export function useZkLogin() {
  const context = useContext(ZkLoginContext);
  if (context === undefined) {
    throw new Error("useZkLogin must be used within a ZkLoginProvider");
  }
  return context;
}
