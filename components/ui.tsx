'use client';
/* Teach Clock — primitive set. Hand-rolled rather than pulled from a component library,
   because the keyline frame, the bracketed corners and the flat bar language are
   the identity; a library's defaults would erase them.

   Everything here draws its colour from a token. No hex values below. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LIFECYCLE, lifecycleIndex } from '@/lib/compute';
import type { SessionStatus } from '@/lib/types';

/* ---------- Structure ---------- */

export function PageHead({ title, sub, actions }: {
  title: string; sub?: string; actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-[26px] sm:text-[32px] font-extrabold">{title}</h1>
        {sub ? <p className="mt-1.5 text-[var(--text-2)] text-sm max-w-[60ch]">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div> : null}
    </header>
  );
}

export function SectionHead({ title, icon: Icon, right, className = '' }: {
  title: string; icon?: LucideIcon; right?: ReactNode; className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-3 ${className}`}>
      <h2 className="eyebrow flex items-center gap-2">
        {Icon ? <Icon size={13} strokeWidth={2.4} aria-hidden="true" /> : null}
        {title}
      </h2>
      {right ? <div className="text-sm text-[var(--text-2)]">{right}</div> : null}
    </div>
  );
}

export function Frame({ children, className = '', pad = true, tone = 'surface', brackets = false }: {
  children: ReactNode; className?: string; pad?: boolean;
  tone?: 'surface' | 'flat' | 'ink'; brackets?: boolean;
}) {
  const t = tone === 'ink' ? 'frame-ink' : tone === 'flat' ? 'frame-flat' : '';
  return (
    <div className={`frame ${t} ${brackets ? 'frame-brackets' : ''} ${pad ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  );
}

/* ---------- Numbers ---------- */

export function KpiGrid({ children, cols = 3, className = '' }: {
  children: ReactNode; cols?: 2 | 3 | 4; className?: string;
}) {
  const map = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' };
  return <div className={`kpi-grid grid-cols-2 ${map[cols]} ${className}`}>{children}</div>;
}

export function Kpi({ label, value, sub, accent = false, tone, icon: Icon }: {
  label: string; value: string; sub?: string; accent?: boolean;
  /** Colours the card by meaning. Never the only carrier — the label says it too. */
  tone?: 'ok' | 'warn' | 'info' | 'bad'; icon?: LucideIcon;
}) {
  const cls = tone ? `kpi-${tone}` : accent ? 'kpi-accent' : '';
  return (
    <div className={`kpi ${cls}`}>
      <span className="kpi-label flex items-center gap-1.5">
        {Icon ? <Icon size={12} strokeWidth={2.4} aria-hidden="true" /> : null}
        {label}
      </span>
      <span className="kpi-value">{value}</span>
      {sub ? <span className="kpi-sub">{sub}</span> : null}
    </div>
  );
}

export function Badge({ tone = 'mute', children }: {
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'mute'; children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/* ---------- The signature element ----------
   One idea at three scales: full width on the landing hero, `mini` inside every
   session card, and as the spine of the report. */

export function LifecycleRail({ upto, current, mini = false, className = '' }: {
  /** How many states are complete, 0–8. */
  upto: number; current?: number; mini?: boolean; className?: string;
}) {
  return (
    <div className={`rail ${mini ? 'rail-mini' : ''} ${className}`} role="img"
      aria-label={`Session lifecycle: ${LIFECYCLE.slice(0, Math.max(1, upto)).map((s) => s.label).join(', ')} complete`}>
      {LIFECYCLE.map((step, i) => (
        <div
          key={step.key}
          className={`rail-step${i < upto ? ' is-done' : ''}${current === i ? ' is-current' : ''}`}
        >
          <div className="rail-line"><span className="rail-node" /></div>
          <span className="rail-label">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

export const railFor = (status: SessionStatus) => lifecycleIndex(status);

/* ---------- Charts: flat rectangles only ---------- */

export function BarChart({ data, height = 150, accentIndex, valueLabel }: {
  data: { label: string; value: number; mute?: boolean }[];
  height?: number; accentIndex?: number; valueLabel?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="bars" style={{ height }}>
        {data.map((d, i) => (
          <div className="bar-col" key={d.label + i} title={`${d.label}: ${valueLabel ? valueLabel(d.value) : d.value}`}>
            <div
              className={`bar-fill${d.mute || (accentIndex !== undefined && i !== accentIndex) ? '' : ''}${d.mute ? ' is-mute' : ''}`}
              style={{ height: `${(d.value / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[5px] mt-2">
        {data.map((d, i) => (
          <div className="bar-cap flex-1 min-w-0" key={d.label + i}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}

export function HBar({ pct, tone = 'accent', mark }: {
  pct: number; tone?: 'accent' | 'ink'; mark?: number;
}) {
  return (
    <div className="hbar">
      <div className={`hbar-fill${tone === 'ink' ? ' is-ink' : ''}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      {mark !== undefined ? <span className="hbar-mark" style={{ left: `${Math.min(100, mark)}%` }} /> : null}
    </div>
  );
}

/* ---------- Tables ---------- */

export function TableWrap({ head, children, foot, minWidth = 640 }: {
  head: ReactNode[]; children: ReactNode; foot?: ReactNode; minWidth?: number;
}) {
  return (
    <div className="tbl-wrap">
      <table className="tbl" style={{ minWidth }}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} className={i > 0 ? 'text-right' : ''}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
        {foot ? <tfoot>{foot}</tfoot> : null}
      </table>
    </div>
  );
}

/* ---------- States: build all three, not just the happy path ---------- */

export function EmptyState({ icon: Icon, title, text, action }: {
  icon?: LucideIcon; title: string; text: string; action?: ReactNode;
}) {
  return (
    <div className="frame frame-flat px-6 py-10 text-center flex flex-col items-center gap-3">
      {Icon ? <Icon size={26} strokeWidth={1.6} className="text-[var(--text-3)]" aria-hidden="true" /> : null}
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-sm text-[var(--text-2)] max-w-[46ch]">{text}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title = 'That data did not load', text, retry }: {
  title?: string; text: string; retry?: () => void;
}) {
  return (
    <div className="frame px-6 py-8 text-center flex flex-col items-center gap-3"
      style={{ borderColor: 'var(--bad)' }} role="alert">
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-sm text-[var(--text-2)] max-w-[46ch]">{text}</p>
      {retry ? <button className="btn btn-ghost btn-sm" onClick={retry}>Try again</button> : null}
    </div>
  );
}

export function Skeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`frame p-5 ${className}`} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="skel h-3 w-1/3 mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skel h-3 mb-2.5" style={{ width: `${92 - i * 11}%` }} />
      ))}
    </div>
  );
}

/* ---------- Forms ---------- */

export function Field({ label, htmlFor, error, hint, required, children }: {
  label: string; htmlFor: string; error?: string; hint?: string;
  /** Draws the asterisk. The input itself still carries `required`. */
  required?: boolean; children: ReactNode;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="req" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? <span className="field-error" id={`${htmlFor}-error`}>{error}</span> : null}
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

/* ================= Phase 2 primitives ================= */


/** Focus-trapped dialog. Escape closes, the backdrop closes, focus returns. */
export function Modal({ open, onClose, title, sub, children, footer, wide = false }: {
  open: boolean; onClose: () => void; title: string; sub?: string;
  children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => ref.current?.querySelector<HTMLElement>(
      'input,select,textarea,button')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-bg" aria-label="Close" onClick={onClose} />
      <div className={`modal frame frame-brackets${wide ? ' is-wide' : ''}`} ref={ref}>
        <header className="modal-head">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold truncate">{title}</h2>
            {sub ? <p className="text-sm text-[var(--text-2)] mt-1">{sub}</p> : null}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Confirm before anything destructive or irreversible. */
export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', tone = 'primary', reasonLabel }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void;
  title: string; body: string; confirmLabel?: string; tone?: 'primary' | 'danger';
  /** When set, the action cannot proceed without a written reason. */
  reasonLabel?: string;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const blocked = Boolean(reasonLabel) && !reason.trim();

  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            disabled={blocked}
            onClick={() => { onConfirm(reason.trim()); onClose(); }}
          >{confirmLabel}</button>
        </>
      }>
      <p className="text-sm text-[var(--text-2)]">{body}</p>
      {reasonLabel ? (
        <div className="mt-4">
          <label className="field-label" htmlFor="confirm-reason">{reasonLabel}</label>
          <textarea id="confirm-reason" className="input" rows={3} value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Say what is wrong, so it can be put right." />
          {blocked ? <span className="field-hint">This is required — the reason goes to the teacher.</span> : null}
        </div>
      ) : null}
    </Modal>
  );
}

export function Select({ id, label, value, onChange, options, placeholder, error, hint, disabled }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string; error?: string; hint?: string; disabled?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <select id={id} className="input" value={value} disabled={disabled}
        aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function TextInput({ id, label, value, onChange, type = 'text', error, hint, placeholder, ...rest }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  type?: string; error?: string; hint?: string; placeholder?: string;
  min?: string; max?: string; step?: string;
}) {
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <input id={id} className="input" type={type} value={value} placeholder={placeholder}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

export function TextArea({ id, label, value, onChange, rows = 3, error, hint, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  rows?: number; error?: string; hint?: string; placeholder?: string;
}) {
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <textarea id={id} className="input" rows={rows} value={value} placeholder={placeholder}
        aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/** Multi-select as chips — a native multiple select is unusable on a phone. */
export function ChipPicker({ label, options, selected, onChange, hint }: {
  label: string; options: string[]; selected: string[];
  onChange: (next: string[]) => void; hint?: string;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button key={o} type="button" onClick={() => toggle(o)}
              className={`chip${on ? ' is-on' : ''}`} aria-pressed={on}>{o}</button>
          );
        })}
      </div>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </fieldset>
  );
}

/** The filter bar every list page shares, so they behave identically. */
export function Toolbar({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="frame frame-flat mb-5 no-print">
      <div className="flex flex-wrap items-end gap-4">
        {children}
        {right ? <div className="ml-auto flex items-end gap-2">{right}</div> : null}
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="min-w-[200px] flex-1 max-w-[320px]">
      <label className="field-label" htmlFor="tb-search">Search</label>
      <input id="tb-search" className="input" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Server-side pagination is Phase 3; this keeps long tables usable meanwhile. */
export function Pager({ page, pages, total, onPage }: {
  page: number; pages: number; total: number; onPage: (p: number) => void;
}) {
  if (pages <= 1) return <p className="text-xs text-[var(--text-3)] mt-3">{total} records</p>;
  return (
    <div className="flex items-center gap-3 mt-3 no-print">
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="text-xs text-[var(--text-2)] mono">Page {page} of {pages} · {total} records</span>
      <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export function usePaged<T>(rows: T[], size = 15) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages);
  useEffect(() => { setPage(1); }, [rows.length]);
  return {
    page: safe, pages, total: rows.length,
    slice: rows.slice((safe - 1) * size, safe * size),
    setPage
  };
}
