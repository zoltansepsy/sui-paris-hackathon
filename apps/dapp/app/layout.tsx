import type { Metadata } from "next";
import { Providers } from "./providers";
import "@mysten/dapp-kit/dist/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUI Paris Hack - dApp",
  description: "24h hackathon dApp on SUI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
