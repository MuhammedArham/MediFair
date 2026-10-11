import { Suspense } from "react";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediFair AI | Clearer private healthcare costs",
  description: "A consent-led workspace for understanding Australian private healthcare quotes and out-of-pocket costs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-AU"><body><a className="skip-link" href="#main-content">Skip to content</a><Suspense fallback={<p>Loading MediFair AI…</p>}><AppShell emailMode={process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock"} aiMode={process.env.AI_PROVIDER?.trim().toLowerCase() || "mock"} demo={process.env.DEMO_MODE !== "false"}>{children}</AppShell></Suspense></body></html>;
}
