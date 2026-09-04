/* Teach Clock — the state every stubbed module renders. Designed, not apologetic:
   it names the module, says in one line what it will do, and gives the person
   somewhere to go. */

import Link from 'next/link';
import { Construction } from 'lucide-react';
import { BrandWord } from './Brand';
import { PageHead } from './ui';

export default function ComingSoon({ title, does, phase = 'Phase 2' }: {
  title: string; does: string; phase?: string;
}) {
  return (
    <>
      <PageHead title={title} />
      <div className="frame frame-flat frame-brackets px-6 py-14 text-center flex flex-col items-center gap-4">
        <Construction size={26} strokeWidth={1.6} className="text-[var(--text-3)]" aria-hidden="true" />
        <h2 className="text-xl font-bold">{title} arrives in {phase}</h2>
        <p className="text-sm text-[var(--text-2)] max-w-[52ch]">{does}</p>
        <p className="text-xs text-[var(--text-3)]">
          This <BrandWord /> build covers the landing page, sign-in, dashboard and financial report.
        </p>
        <Link href="/dashboard" className="btn btn-primary btn-sm mt-1">Back to dashboard</Link>
      </div>
    </>
  );
}
