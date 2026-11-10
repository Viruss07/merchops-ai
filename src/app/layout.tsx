import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { AppStateProvider } from '@/components/shell/AppState';
import { SiteFooter, SiteHeader } from '@/components/shell/SiteHeader';
import { JudgeTour } from '@/components/shell/JudgeTour';
import './globals.css';

const DESCRIPTION =
  'A 30-day cash runway with a hard reserve floor. The AI proposes plans; deterministic rules decide. Nothing moves without merchant approval.';

export const metadata: Metadata = {
  title: {
    default: "MerchOps AI: an AI CFO that can't touch your money",
    template: '%s · MerchOps',
  },
  description: DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="flex min-h-screen flex-col bg-paper text-ink antialiased">
        <a
          href="#content"
          className="sr-only rounded-md bg-panel text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <AppStateProvider>
          <SiteHeader />
          <div id="content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </div>
          <SiteFooter />
          <JudgeTour />
        </AppStateProvider>
      </body>
    </html>
  );
}
