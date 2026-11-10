import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ledger',
  description: 'The append-only record of every decision.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
