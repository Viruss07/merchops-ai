import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Runway',
  description: 'The 30-day cash runway against the reserve floor.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
