'use client';
/* The approval queue — the school's whole job, and the administrator's
   exception desk. Oldest first, because the figure management watches is how
   long a record has been waiting, not how many there are. */

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Layers } from 'lucide-react';
import {
  Badge, Confirm, EmptyState, Frame, Kpi, KpiGrid, PageHead, SearchBox, Select,
  TableWrap, Toolbar
} from '@/components/ui';
import { SessionDetail, ReviewActions } from '@/components/SessionParts';
import { STATUS_LABEL, STATUS_TONE, isPending, minutes, stalePending } from '@/lib/compute';
import { useActor, useData } from '@/lib/data';
import { ago, dateShort, hours, hoursLabel } from '@/lib/format';
import type { TeachingSession } from '@/lib/types';

export default function ApprovalsPage() {
  const actor = useActor();
  const { data, mySessions, reviewSession, today } = useData();
  const [q, setQ] = useState('');
  const [schoolId, setSchoolId] = useState('all');
  const [tab, setTab] = useState<'waiting' | 'flagged' | 'reviewed'>('waiting');
  const [open, setOpen] = useState<TeachingSession | null>(null);
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const scoped = useMemo(() =>
    mySessions.filter((s) => schoolId === 'all' || s.schoolId === schoolId),
    [mySessions, schoolId]);

  const waiting = useMemo(() => scoped.filter(isPending)
    .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')), [scoped]);
  const flagged = useMemo(() => waiting.filter((s) => s.flags?.length), [waiting]);
  const reviewed = useMemo(() => scoped
    .filter((s) => ['approved', 'rejected', 'correction', 'cancelled'].includes(s.status))
    .sort((a, b) => (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? '')).slice(0, 60), [scoped]);

  const list = tab === 'waiting' ? waiting : tab === 'flagged' ? flagged : reviewed;
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? list.filter((s) => [s.id, s.teacherName, s.subject, s.className, s.topic]
        .join(' ').toLowerCase().includes(needle))
      : list;
  }, [list, q]);

  const stale = stalePending(waiting, data.settings.approvalSlaHours);

  /* Bulk approval exists because a school confirming a full week at once is a
     real workflow — but each record still gets its own audit entry. */
  const approveAll = async () => {
    for (const id of picked) await reviewSession(id, 'approved');
    setPicked([]); setBulk(false);
  };

  return (
    <>
      <PageHead
        title="Approval queue"
        sub={actor.role === 'school'
          ? 'Confirm what was actually delivered. Rejecting or asking for a correction needs a reason.'
          : 'Everything awaiting a school decision, oldest first.'}
        actions={picked.length ? (
          <button className="btn btn-primary btn-sm" onClick={() => setBulk(true)}>
            <Layers size={15} /> Approve {picked.length} selected
          </button>
        ) : null}
      />

      <KpiGrid cols={4} className="mb-6">
        <Kpi label="Waiting on review" value={String(waiting.length)} sub={hoursLabel(minutes(waiting))} tone="warn" icon={Clock} />
        <Kpi label={`Over ${data.settings.approvalSlaHours} hours`} value={String(stale.length)}
          sub="past the agreed turnaround" tone={stale.length ? 'bad' : 'ok'} icon={AlertTriangle} />
        <Kpi label="Flagged for review" value={String(flagged.length)} sub="duplicate, overlap or long day" tone="info" />
        <Kpi label="Reviewed" value={String(reviewed.length)} sub="most recent decisions" tone="ok" icon={CheckCircle2} />
      </KpiGrid>

      <div className="tabs">
        {([['waiting', 'Waiting', waiting.length], ['flagged', 'Flagged', flagged.length],
           ['reviewed', 'Reviewed', reviewed.length]] as const).map(([key, label, n]) => (
          <button key={key} className={`tab${tab === key ? ' is-on' : ''}`} onClick={() => setTab(key)}>
            {label}<span className="tab-count">{n}</span>
          </button>
        ))}
      </div>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Teacher, subject, session ID…" />
        {actor.role !== 'school' ? (
          <div className="min-w-[190px]">
            <Select id="a-school" label="School" value={schoolId} onChange={setSchoolId}
              options={[{ value: 'all', label: 'All schools' },
                ...data.schools.map((s) => ({ value: s.id, label: s.shortName }))]} />
          </div>
        ) : null}
      </Toolbar>

      {rows.length ? (
        <TableWrap minWidth={1000}
          head={[tab === 'waiting' ? 'Select' : 'Session', 'Teacher', 'Subject / class',
            'Date', 'Time', 'Hours', tab === 'reviewed' ? 'Decision' : 'Waiting', '']}>
          {rows.map((s) => {
            const late = stale.some((x) => x.id === s.id);
            return (
              <tr key={s.id}>
                <td>
                  {tab === 'waiting' ? (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={picked.includes(s.id)}
                        aria-label={`Select ${s.id}`}
                        onChange={(e) => setPicked(e.target.checked
                          ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />
                      <span className="mono text-xs">{s.id}</span>
                    </label>
                  ) : <span className="mono text-xs">{s.id}</span>}
                </td>
                <td className="text-right">{s.teacherName}</td>
                <td className="text-right">
                  {s.subject} · {s.className}
                  {s.flags?.length ? (
                    <AlertTriangle size={13} className="inline ml-2" style={{ color: 'var(--warn)' }} aria-label="Flagged" />
                  ) : null}
                </td>
                <td className="num">{dateShort(s.date)}</td>
                <td className="num">{s.startTime}–{s.endTime}</td>
                <td className="num">{hoursLabel(s.durationMinutes)}</td>
                <td className="num" style={late ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>
                  {tab === 'reviewed'
                    ? <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                    : s.submittedAt ? ago(s.submittedAt, new Date(`${today}T15:00:00`)) : '—'}
                </td>
                <td className="text-right">
                  <button className="btn btn-ghost btn-sm" onClick={() => setOpen(s)}>Review</button>
                </td>
              </tr>
            );
          })}
        </TableWrap>
      ) : (
        <EmptyState icon={CheckCircle2}
          title={tab === 'waiting' ? 'Nothing waiting on you' : 'Nothing here'}
          text={tab === 'waiting'
            ? 'Every session submitted has been reviewed. New submissions appear here as teachers send them.'
            : 'No records match this view yet.'} />
      )}

      <SessionDetail session={open} open={Boolean(open)} onClose={() => setOpen(null)}
        actions={open ? <ReviewActions session={open} onDone={() => setOpen(null)} /> : null} />

      <Confirm
        open={bulk} onClose={() => setBulk(false)}
        title={`Approve ${picked.length} sessions`}
        body="Each record is approved individually and gets its own audit entry. Approved sessions lock against ordinary editing."
        confirmLabel="Approve all selected"
        onConfirm={() => void approveAll()} />
    </>
  );
}
