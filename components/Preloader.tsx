'use client';
/* Teach Clock — the split-gate loader.

   The composition is the official lockup stood upright: the mark, the gold
   divider, the wordmark — with the same gap above and below the divider, set
   once as --pl-gap so the two can never drift apart.

   The divider is also the seam. When the gate opens, the mark withdraws upward
   and the wordmark downward, parting along that line, so the page is revealed
   between the two halves of the logo rather than uncovered by a curtain.

   The wordmark uses the real .wordmark treatment, so the accent cut sits on the
   K's lower-right leg exactly as it does in the artwork — it is the logo's own
   typography, not a second copy of the word.

   ~1.05s, never blocking, and removed outright under reduced motion. */

import Image from 'next/image';
import { useEffect, useState } from 'react';

export default function Preloader({ done = false }: { done?: boolean }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!done) return;
    /* Let the wipe finish before the gate parts — opening mid-animation reads as
       an interruption rather than a completion. */
    const t = window.setTimeout(() => setLeaving(true), 180);
    return () => window.clearTimeout(t);
  }, [done]);

  return (
    <div className={`preloader${leaving ? ' is-done' : ''}`} aria-hidden="true">
      <div className="pl-half pl-top">
        <span className="pl-logo">
          <Image
            src="/assets/mark-dark.png" alt="" width={96} height={93} priority
            style={{ width: 96, height: 'auto' }}
          />
        </span>
      </div>

      <div className="pl-half pl-bot">
        <span className="pl-word wordmark">
          Teach{' '}
          <span className="wm-gold">
            <span className="wm-fill">Clock</span>
            <span className="wm-cut" aria-hidden="true">Clock</span>
          </span>
          <span className="pl-sweep" />
        </span>
      </div>

      <span className="pl-seam" />
    </div>
  );
}
