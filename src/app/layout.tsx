import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgentProof — Verifiable identity for every agent",
  description:
    "Create a portable cryptographic identity for your AI agent. Generate keys, publish a Web Bot Auth directory, and prove every request.",
  metadataBase: new URL("https://agentproof.dev"),
  openGraph: {
    title: "AgentProof — Verifiable identity for every agent",
    description:
      "The identity control plane for agents operating on the open web.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentProof — Verifiable identity for every agent",
    description:
      "The identity control plane for agents operating on the open web.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
