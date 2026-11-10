import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Bills', template: '%s · MerchOps' },
  description: 'Supplier payouts, each checked against the reserve floor.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
