import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Judge mode',
  description: 'A guided tour of MerchOps and a live PayPal sandbox run.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
