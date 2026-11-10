import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cash forecast',
  description: 'The 30-day cash runway against the safety reserve.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
