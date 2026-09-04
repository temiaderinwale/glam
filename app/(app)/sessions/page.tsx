'use client';
/* Teaching history — every session this account is allowed to see.

   Role decides both the scope and the verbs: a teacher corrects and resubmits
   their own rejected records, a school reviews what was sent to it, an
   administrator can do either and can cancel a record with a reason (BR-004:
   never a silent delete). */

import { useMemo, useState } from 'react';
import { Download, FileEdit, Printer, Search, XCircle } from 'lucide-react';
import {
  Badge, Confirm, EmptyState, Modal, PageHead, Pager, Select, SearchBox,
  TableWrap, TextArea, Toolbar, usePaged
} from '@/components/ui';
import { SessionDetail, SessionForm, ReviewActions, draftFrom } from '@/components/SessionParts';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/compute';
import { useActor, useData } from '@/lib/data';
import { canEdit, type Issue, type SessionDraft } from '@/lib/rules';
import { dateShort, hoursLabel } from '@/lib/format';
import { exportRows } from '@/lib/csv';
import type { SessionStatus, TeachingSession } from '@/lib/types';

const STATUSES: SessionStatus[] = [
  'draft', 'submitted', 'pending', 'resubmitted', 'approved', 'rejected', 'correction', 'cancelled'
];

export default function SessionsPage() {
  const actor = useActor();
  const { data, mySessions, resubmitSession, cancelSession } = useData();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [schoolId, setSchoolId] = useState('all');
  const [teacherId, setTeacherId] = useState('all');
  const [subject, setSubject] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [open, setOpen] = useState<TeachingSession | null>(null);
  const [editing, setEditing] = useState<TeachingSession | null>(null);
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [note, setNote] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [cancelling, setCancelling] = useState<TeachingSession | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return mySessions
      .filter((s) => status === 'all' || s.status === status)
      .filter((s) => schoolId === 'all' || s.schoolId === schoolId)
      .filter((s) => teacherId === 'all' || s.teacherId === teacherId)
      .filter((s) => subject === 'all' || s.subject === subject)
      .filter((s) => !from || s.date >= from)
      .filter((s) => !to || s.date <= to)
      .filter((s) => !needle || [s.id, s.teacherName, s.schoolName, s.subject, s.className, s.topic]
        .join(' ').toLowerCase().includes(needle))
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
  }, [mySessions, q, status, schoolId, teacherId, subject, from, to]);

  const paged = usePaged(rows, 15);

  const startEdit = (s: TeachingSession) => {
    setEditing(s); setDraft(draftFrom(s)); setNote(''); setIssues([]); setOpen(null);
  };

  const submitCorrection = async () => {
    if (!editing || !draft) return;
    const res = await resubmitSession(editing.id, draft, note.trim() || 'Corrected and resubmitted.');
    setIssues(res.issues);
    if (res.ok) { setEditing(null); setDraft(null); }
  };

  const doExport = () => exportRows('teach-clock-teaching-history', rows, [
    { header: 'Session', value: (s: TeachingSession) => s.id },
    { header: 'Date', value: (s: TeachingSession) => s.date },
    { header: 'Teacher', value: (s: TeachingSession) => s.teacherName },
    { header: 'School', value: (s: TeachingSession) => s.schoolName },
    { header: 'Subject', value: (s: TeachingSession) => s.subject },
    { header: 'Class', value: (s: TeachingSession) => s.className },
    { header: 'Start', value: (s: TeachingSession) => s.startTime },
    { header: 'End', value: (s: TeachingSession) => s.endTime },
    { header: 'Hours', value: (s: TeachingSession) => (s.durationMinutes / 60).toFixed(2) },
    { header: 'Topic', value: (s: TeachingSession) => s.topic },
    { header: 'Status', value: (s: TeachingSession) => STATUS_LABEL[s.status] },
    { header: 'Reviewed by', value: (s: TeachingSession) => s.reviewedBy ?? '' },
    { header: 'Reason', value: (s: TeachingSession) => s.rejectionReason ?? s.correctionReason ?? '' }
  ]);

  return (
    <>
      <PageHead
        title="Teaching history"
        sub={actor.role === 'teacher'
          ? 'Everything you have submitted, and where each record stands.'
          : actor.role === 'school'
            ? 'Every session submitted to your school, with its full review trail.'
            : 'Every session across the organisation, with its full review trail.'}
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={doExport}>
              <Download size={15} /> Export CSV
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
              <Printer size={15} /> Print
            </button>
          </>
        }
      />

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="TS-000928, teacher, topic…" />
        <div className="min-w-[170px]">
          <Select id="f-status" label="Status" value={status} onChange={setStatus}
            options={[{ value: 'all', label: 'All statuses' },
              ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
        </div>
        {actor.role !== 'school' ? (
          <div className="min-w-[170px]">
            <Select id="f-school" label="School" value={schoolId} onChange={setSchoolId}
              options={[{ value: 'all', label: 'All schools' },
                ...data.schools.map((s) => ({ value: s.id, label: s.shortName }))]} />
          </div>
        ) : null}
        {actor.role !== 'teacher' ? (
          <div className="min-w-[170px]">
            <Select id="f-teacher" label="Teacher" value={teacherId} onChange={setTeacherId}
              options={[{ value: 'all', label: 'All teachers' },
                ...data.teachers.map((t) => ({ value: t.id, label: t.name }))]} />
          </div>
        ) : null}
        <div className="min-w-[150px]">
          <Select id="f-subject" label="Subject" value={subject} onChange={setSubject}
            options={[{ value: 'all', label: 'All subjects' },
              ...data.subjects.map((s) => ({ value: s.name, label: s.name }))]} />
        </div>
        <div className="min-w-[140px]">
          <label className="field-label" htmlFor="f-from">From</label>
          <input id="f-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="min-w-[140px]">
          <label className="field-label" htmlFor="f-to">To</label>
          <input id="f-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Toolbar>

      {rows.length ? (
        <>
          <TableWrap minWidth={940}
            head={['Session', 'Date', actor.role === 'teacher' ? 'School' : 'Teacher',
              'Subject / class', 'Time', 'Hours', 'Status', '']}>
            {paged.slice.map((s) => (
              <tr key={s.id}>
                <td className="mono text-xs">{s.id}</td>
                <td className="num">{dateShort(s.date)}</td>
                <td className="text-right">{actor.role === 'teacher' ? s.schoolName : s.teacherName}</td>
                <td className="text-right">{s.subject} · {s.className}</td>
                <td className="num">{s.startTime}–{s.endTime}</td>
                <td className="num">{hoursLabel(s.durationMinutes)}</td>
                <td className="text-right"><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge></td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn btn-ghost btn-sm" onClick={() => setOpen(s)}>Open</button>
                  {canEdit(actor, s) ? (
                    <button className="btn btn-ghost btn-sm ml-2" onClick={() => startEdit(s)}>
                      <FileEdit size={14} /> Correct
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </TableWrap>
          <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={paged.setPage} />
        </>
      ) : (
        <EmptyState icon={Search} title="Nothing matches those filters"
          text="Widen the date range or clear a filter. Sessions appear here as soon as they are submitted." />
      )}

      <SessionDetail
        session={open} open={Boolean(open)} onClose={() => setOpen(null)}
        actions={open ? (
          <>
            {actor.role === 'admin' && open.status !== 'cancelled' ? (
              <button className="btn btn-ghost" onClick={() => { setCancelling(open); setOpen(null); }}>
                <XCircle size={15} /> Cancel record
              </button>
            ) : null}
            {canEdit(actor, open) ? (
              <button className="btn btn-ghost" onClick={() => startEdit(open)}>Correct and resubmit</button>
            ) : null}
            <ReviewActions session={open} onDone={() => setOpen(null)} />
          </>
        ) : null}
      />

      <Modal
        open={Boolean(editing)} onClose={() => setEditing(null)} wide
        title="Correct and resubmit"
        sub={editing ? `${editing.id} · the original version is kept on the record` : ''}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void submitCorrection()}>Resubmit</button>
          </>
        }>
        {editing?.rejectionReason || editing?.correctionReason ? (
          <div className="frame" style={{ borderColor: 'var(--bad)' }}>
            <span className="eyebrow" style={{ color: 'var(--bad)' }}>What the school said</span>
            <p className="text-sm mt-2">{editing.rejectionReason || editing.correctionReason}</p>
          </div>
        ) : null}
        {draft ? <SessionForm draft={draft} setDraft={setDraft} issues={issues} compact /> : null}
        <TextArea id="correction-note" label="What did you change?" value={note} onChange={setNote} rows={2}
          placeholder="End time corrected to 11:00 — the class finished a period early."
          hint="This goes back to the school with the corrected record." />
      </Modal>

      <Confirm
        open={Boolean(cancelling)} onClose={() => setCancelling(null)}
        title="Cancel this teaching record"
        body="A submitted session is never deleted. Cancelling voids it with a recorded reason and leaves it in the audit trail."
        confirmLabel="Cancel record" tone="danger" reasonLabel="Reason for cancelling"
        onConfirm={(reason) => { if (cancelling) void cancelSession(cancelling.id, reason); }}
      />
    </>
  );
}
