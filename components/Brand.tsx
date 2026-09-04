/* Teach Clock — the mark, the lockup, and the word.

   The mark is the brand-kit artwork itself (public/assets), not a redrawn
   approximation: the unicorn inside the diamond, the teacher figure on the
   upper-left slant and the analytics bars on the lower-right all come from the
   supplied file. Two variants ship — `light` (ink figure, deep-gold diamond)
   for white grounds and `dark` (cream figure, bright-gold diamond) for ink
   grounds — and both are rendered, with CSS showing the right one. That keeps
   the swap instant on theme change, with no flash and no JS.

   The lockup is composed here rather than shipped as one flat PNG, because the
   wordmark is live type: mark, hairline rule, then TEACH CLOCK set in Archivo
   900. Composing it means the two halves recolour with the theme on their own,
   and the name stays selectable, searchable and translatable.

   `BrandWord` is the same wordmark for anywhere the name appears in running
   text or a heading. It always carries the accent cut on the K's lower-right
   leg, so the name is never set as plain type anywhere in the product. */

import Image from 'next/image';

type Ground = 'auto' | 'light' | 'dark';

function Pair({ base, alt, width, height, ground, priority, className }: {
  base: string; alt: string; width: number; height: number;
  ground: Ground; priority?: boolean; className?: string;
}) {
  const light = (
    <Image
      key="l" src={`/assets/${base}-light.png`} alt={alt} width={width} height={height}
      priority={priority} className={ground === 'auto' ? 'only-light' : undefined}
      style={{ width, height: 'auto' }}
    />
  );
  const dark = (
    <Image
      key="d" src={`/assets/${base}-dark.png`} alt={alt} width={width} height={height}
      priority={priority} className={ground === 'auto' ? 'only-dark' : undefined}
      style={{ width, height: 'auto' }}
    />
  );
  if (ground === 'light') return <span className={className}>{light}</span>;
  if (ground === 'dark') return <span className={className}>{dark}</span>;
  return <span className={className} style={{ display: 'inline-flex' }}>{light}{dark}</span>;
}

/** The diamond mark on its own. Use wherever the full lockup will not fit. */
export function Mark({ size = 34, ground = 'auto', priority, className = '' }: {
  size?: number; ground?: Ground; priority?: boolean; className?: string;
}) {
  return (
    <Pair base="mark" alt="Teach Clock" width={size} height={size}
      ground={ground} priority={priority} className={className} />
  );
}

/** Maps a fixed ground onto the wordmark's two colour variables. */
const groundClass = (g: Ground) =>
  g === 'dark' ? ' wordmark-on-ink' : g === 'light' ? ' wordmark-on-cream' : '';

/** The name in running text or a heading. Inherits size; keeps the accent cut.
    CLOCK takes the artwork's orange at every size — see .wordmark in
    globals.css for why that is a deliberate choice rather than an oversight. */
export function BrandWord({ size, ground = 'auto', className = '' }: {
  size?: number; ground?: Ground; className?: string;
}) {
  return (
    <span
      className={`wordmark${groundClass(ground)} ${className}`}
      style={size ? { fontSize: size } : { fontSize: '1.06em' }}
    >
      {/* Set in sentence case and uppercased in CSS, so screen readers say the
          name rather than spelling it out. The cut is a clipped duplicate, so
          it is hidden from assistive tech. */}
      Teach{' '}
      <span className="wm-gold">
        <span className="wm-fill">Clock</span>
        <span className="wm-cut" aria-hidden="true">Clock</span>
      </span>
    </span>
  );
}

/** Mark + hairline rule + wordmark, in the proportions of the brand artwork:
    measured off the supplied lockup, the rule sits 0.085 of the mark's height
    away on each side and stands 0.7 of it tall, and the wordmark is set so the
    type block comes out about 1.7x the width of the mark. Everything is derived
    from `size`, the height of the mark, because that is what the eye actually
    measures a logo by. */
export function Lockup({ size = 60, ground = 'auto', priority, className = '' }: {
  size?: number; ground?: Ground; priority?: boolean; className?: string;
}) {
  const gap = Math.round(size * 0.085);
  return (
    <span className={`lockup${ground === 'dark' ? ' lockup-on-ink' : ''} ${className}`}>
      <Mark size={size} ground={ground} priority={priority} />
      <span className="lockup-rule"
        style={{ marginLeft: gap, marginRight: gap, height: Math.round(size * 0.7) }} />
      <BrandWord size={Math.round(size * 0.21)} ground={ground} />
    </span>
  );
}

/** Parent-brand line for the footer and the auth panel. */
export function GlampterLine({ className = '' }: { className?: string }) {
  return (
    <span className={`eyebrow eyebrow-dot ${className}`}>
      Bringing Answers To You
    </span>
  );
}
