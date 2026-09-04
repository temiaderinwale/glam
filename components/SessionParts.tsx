'use client';
/* Teach Clock — the session form and the session detail.

   Both live here rather than inside a page because four different routes need
   them (log, history, approval queue, schedule) and a teaching record that
   looked different depending on where you opened it from would undermine the
   whole point of the product.

   The form never accepts a typed duration: it is computed from the two times
   and shown read-only, which is BR-015 made visible rather than merely enforced. */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, History } from 'lucide-react';
import {
  Badge, Field, LifecycleRail, Modal, Select, TextArea, TextInput, railFor
} from './ui';
import { BrandWord } from './Brand';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/compute';
import { useActor, useData } from '@/lib/data';
import { activeAssignment, durationOf, periodsOf, type Issue, type SessionDraft } from '@/lib/rules';
import { dateLong, duration, hoursLabel, stamp, timeRange } from '@/lib/format';
import type { TeachingSession } from '@/lib/types';

const TYPES: { value: SessionDraft['teachingType']; label: string }[] = [
  { value: 'regular', label: 'Regular class' },
  { value: 'revision', label: 'Revision' },
  { value: 'remedial', label: 'Remedial' },
  { value: 'exam-prep', label: 'Exam preparation' },
  { value: 'extra', label: 'Extra lesson' }
];

export function emptyDraft(teacherId: string, today: string): SessionDraft {
  return {
    teacherId, schoolId: '', subject: '', className: '', date: today,
    startTime: '09:00', endTime: '11:00', topic: '', teachingType: 'regular', teacherComment: ''
  };
}

export function draftFrom(s: TeachingSession): SessionDraft {
  return {
    teacherId: s.teacherId, schoolId: s.schoolId, subject: s.subject, className: s.className,
    date: s.date, startTime: s.startTime, endTime: s.endTime, topic: s.topic,
    teachingType: s.teachingType, teacherComment: s.teacherComment ?? ''
  };
}

/** The log / edit form. `onSubmit` returns issues so the page owns the outcome. */
export function SessionForm({ draft, setDraft, issues, compact = false }: {
  draft: SessionDraft; setDraft: (d: SessionDraft) => void; issues: Issue[]; compact?: boolean;
}) {
  const { data, today } = useData();
  const err = (f: string) => issues.find((i) => i.field === f)?.message;
  const set = (patch: Partial<SessionDraft>) => setDraft({ ...draft, ...patch });

  /* Only schools this teacher is actually assigned to on that date — BR-002
     enforced by not offering the wrong option in the first place. */
  const schools = useMemo(() => data.schools
    .filter((s) => s.status === 'active')
    .filter((s) => activeAssignment(data.assignments, draft.teacherId, s.id, draft.date || today))
    .map((s) => ({ value: s.id, label: s.name })), [data, draft.teacherId, draft.date, today]);

  const assignment = activeAssignment(data.assignments, draft.teacherId, draft.schoolId, draft.date || today);
  const subjects = (assignment?.subjects.length ? assignment.subjects
    : data.subjects.filter((s) => s.active).map((s) => s.name)).map((v) => ({ value: v, label: v }));
  const classes = (assignment?.classes.length ? assignment.classes
    : data.classes.filter((c) => c.active).map((c) => c.name)).map((v) => ({ value: v, label: v }));

  const minutes = durationOf(draft.startTime, draft.endTime);
  const periods = periodsOf(Math.max(0, minutes), data.settings.periodMinutes);

  return (
    <div className="stack">
      <Select id="f-school" label="School" value={draft.schoolId}
        onChange={(v) => set({ schoolId: v, subject: '', className: '' })}
        options={schools} placeholder="Choose a school" error={err('schoolId')}
        hint={schools.length ? undefined : 'You have no active assignments yet. Request a school first.'} />

      <div className={compact ? 'stack' : 'grid-2'}>
        <Select id="f-subject" label="Subject" value={draft.subject} onChange={(v) => set({ subject: v })}
          options={subjects} placeholder="Choose a subject" error={err('subject')} disabled={!draft.schoolId} />
        <Select id="f-class" label="Class" value={draft.className} onChange={(v) => set({ className: v })}
          options={classes} placeholder="Choose a class" error={err('className')} disabled={!draft.schoolId} />
      </div>

      <div className={compact ? 'stack' : 'grid-3'}>
        <TextInput id="f-date" label="Date" type="date" value={draft.date}
          onChange={(v) => set({ date: v })} error={err('date')} max={today} />
        <TextInput id="f-start" label="Start time" type="time" value={draft.startTime}
          onChange={(v) => set({ startTime: v })} error={err('startTime')} />
        <TextInput id="f-end" label="End time" type="time" value={draft.endTime}
          onChange={(v) => set({ endTime: v })} error={err('endTime')} />
      </div>

      {/* Derived, never typed. */}
      <div className="frame frame-flat flex items-center gap-3">
        <Clock size={17} style={{ color: 'var(--accent-ink)' }} aria-hidden="true" />
        <span className="text-sm">
          <strong className="mono">{minutes > 0 ? duration(minutes) : '—'}</strong>
          <span className="text-[var(--text-2)]">
            {minutes > 0 ? ` · ${periods} period${periods === 1 ? '' : 's'} of ${data.settings.periodMinutes} minutes` : ''}
          </span>
        </span>
        <span className="text-xs text-[var(--text-3)] ml-auto">Calculated from the times — not editable.</span>
      </div>

      <TextInput id="f-topic" label="Topic covered" value={draft.topic}
        onChange={(v) => set({ topic: v })} error={err('topic')}
        placeholder="Motion, quadratic equations, comprehension…" />

      <Select id="f-type" label="Teaching type" value={draft.teachingType}
        onChange={(v) => set({ teachingType: v as SessionDraft['teachingType'] })} options={TYPES} />

      <TextArea id="f-note" label="Note for the school (optional)" value={draft.teacherComment ?? ''}
        onChange={(v) => set({ teacherComment: v })} rows={2}
        placeholder="Anything the school should know when confirming this." />
    </div>
  );
}

/** Read-only record, with its history. Shared by every route that opens one. */
export function SessionDetail({ session, open, onClose, actions }: {
  session: TeachingSession | null; open: boolean; onClose: () => void; actions?: React.ReactNode;
}) {
  if (!session) return null;
  const s = session;
  return (
    <Modal open={open} onClose={onClose} wide
      title={`${s.subject} · ${s.className}`}
      sub={`${s.id} · ${s.schoolName}`}
      footer={actions}>
      <div className="flex items-center gap-3 flex-wrap">
        <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
        <span className="mono text-xs text-[var(--text-3)]">{s.id}</span>
      </div>

      <div className="frame frame-flat">
        <LifecycleRail upto={railFor(s.status)} current={railFor(s.status)} />
      </div>

      <dl className="dl">
        <dt>Teacher</dt><dd>{s.teacherName}</dd>
        <dt>School</dt><dd>{s.schoolName}</dd>
        <dt>Date</dt><dd>{dateLong(s.date)}</dd>
        <dt>Time</dt><dd className="mono">{timeRange(s.startTime, s.endTime)}</dd>
        <dt>Duration</dt><dd><strong>{hoursLabel(s.durationMinutes)}</strong> · {s.periods} periods</dd>
        <dt>Topic</dt><dd>{s.topic}</dd>
        <dt>Type</dt><dd className="capitalize">{s.teachingType.replace('-', ' ')}</dd>
        <dt>Submitted</dt><dd>{stamp(s.submittedAt)}</dd>
        {s.reviewedAt ? <><dt>Reviewed</dt><dd>{stamp(s.reviewedAt)} by {s.reviewedBy}</dd></> : null}
      </dl>

      {s.teacherComment ? (
        <div>
          <span className="eyebrow">Teacher’s note</span>
          <p className="text-sm mt-2">{s.teacherComment}</p>
        </div>
      ) : null}

      {s.rejectionReason || s.correctionReason ? (
        <div className="frame" style={{ borderColor: 'var(--bad)' }}>
          <span className="eyebrow" style={{ color: 'var(--bad)' }}>
            {s.rejectionReason ? 'Reason for rejection' : 'Correction requested'}
          </span>
          <p className="text-sm mt-2">{s.rejectionReason || s.correctionReason}</p>
        </div>
      ) : null}

      {s.flags?.length ? (
        <div className="stack">
          <span className="eyebrow">Flagged for review</span>
          {s.flags.map((f) => (
            <div className="flag" key={f.kind}>
              <AlertTriangle size={15} className="flag-icon" aria-hidden="true" />
              <span><strong className="capitalize">{f.kind.replace('-', ' ')}</strong> — {f.detail}</span>
            </div>
          ))}
        </div>
      ) : null}

      {s.revisions?.length ? (
        <div className="stack">
          <span className="eyebrow flex items-center gap-2">
            <History size={13} aria-hidden="true" /> Correction history
          </span>
          {s.revisions.map((r, i) => (
            <div className="frame frame-flat text-sm" key={i}>
              <p className="text-xs text-[var(--text-3)] mono">{stamp(r.at)} · {r.by}</p>
              <p className="mt-1.5">{r.reason}</p>
              <p className="mt-1.5 text-[var(--text-2)] text-xs">
                Was: {r.before.startTime}–{r.before.endTime} · {r.before.subject} · {r.before.className}
              </p>
            </div>
          ))}
          <p className="text-xs text-[var(--text-3)]">
            The original version is kept on the record — <BrandWord /> never overwrites a correction silently.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

/** Approve / reject / request correction, with the reason dialogs attached. */
export function ReviewActions({ session, onDone }: { session: TeachingSession; onDone?: () => void }) {
  const { reviewSession } = useData();
  const actor = useActor();
  const [ask, setAsk] = useState<null | 'rejected' | 'correction'>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setReason(''); }, [ask]);

  const reviewable = (actor.role === 'admin' || actor.schoolId === session.schoolId) &&
    ['submitted', 'pending', 'resubmitted'].includes(session.status);
  if (!reviewable) return null;

  const go = async (to: 'approved' | 'rejected' | 'correction', why?: string) => {
    setBusy(true);
    const ok = await reviewSession(session.id, to, why);
    setBusy(false);
    if (ok) { setAsk(null); onDone?.(); }
  };

  return (
    <>
      <button className="btn btn-ghost" disabled={busy} onClick={() => setAsk('correction')}>
        Request correction
      </button>
      <button className="btn btn-danger" disabled={busy} onClick={() => setAsk('rejected')}>
        Reject
      </button>
      <button className="btn btn-primary" disabled={busy} onClick={() => void go('approved')}>
        Approve
      </button>

      <Modal
        open={ask !== null} onClose={() => setAsk(null)}
        title={ask === 'rejected' ? 'Reject this session' : 'Ask for a correction'}
        sub={ask === 'rejected'
          ? 'The teacher sees this reason and can answer it.'
          : 'Say what is wrong. The teacher edits and resubmits; the original stays on the record.'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAsk(null)}>Cancel</button>
            <button
              className={ask === 'rejected' ? 'btn btn-danger' : 'btn btn-primary'}
              disabled={!reason.trim() || busy}
              onClick={() => void go(ask === 'rejected' ? 'rejected' : 'correction', reason.trim())}
            >{ask === 'rejected' ? 'Reject with reason' : 'Send correction request'}</button>
          </>
        }>
        <TextArea id="review-reason" label="Reason" value={reason} onChange={setReason} rows={4}
          placeholder={ask === 'rejected'
            ? 'No record of this class on the day timetable.'
            : 'The class ended at 11:00, not 12:00.'}
          hint="Required — a rejection without a reason is not accountability." />
      </Modal>
    </>
  );
}
