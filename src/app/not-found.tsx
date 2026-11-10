import Link from 'next/link';
import { Page, btn } from '@/components/ui/kit';

export default function NotFound() {
  return (
    <Page narrow>
      <div className="py-12">
        <p className="mono text-xs text-ink-3">404</p>
        <h1 className="mt-2 text-2xl font-semibold">This page isn&apos;t on the runway</h1>
        <p className="mt-2 text-sm text-ink-2">
          The address may be mistyped, or it points at something the demo reset removed.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/" className={btn.primary}>
            Back to MerchOps
          </Link>
          <Link href="/ledger" className={btn.secondary}>
            Open the audit log
          </Link>
        </div>
      </div>
    </Page>
  );
}
