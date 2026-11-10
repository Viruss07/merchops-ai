import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Invoices', template: '%s · MerchOps' },
  description: 'Money customers owe, collected through PayPal Invoicing.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
