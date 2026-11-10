import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI plans',
  description: 'AI cash plans, each checked by deterministic rules.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
