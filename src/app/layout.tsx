import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MerchOps AI — Financial Operations Copilot",
  description: "AI-powered merchant cash flow forecasting, collections, and vendor payout guardrails.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}

