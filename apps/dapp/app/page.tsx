"use client";

import { ConnectButton } from "@mysten/dapp-kit";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <header className="absolute top-0 left-0 right-0 flex justify-end p-4 border-b border-border">
        <ConnectButton />
      </header>
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">SUI Paris Hack</h1>
        <p className="text-muted-foreground">
          Ready to build. Connect your wallet and start coding.
        </p>
      </div>
    </main>
  );
}
