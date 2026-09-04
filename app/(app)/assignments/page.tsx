'use client';
/* Assignments — the teacher ↔ school relationship, kept as its own record so
   history survives. If a teacher taught at School A from January to June and
   School B from July, both relationships remain reportable. */

import { useMemo, useState } from 'react';
import { Check, Link2, PlusCircle, Search, X } from 'lucide-react';
import {
  Badge, ChipPicker, Confirm, EmptyState, Kpi, KpiGrid, Modal, PageHead, Pager,
  SearchBox, Select, TableWrap, TextArea, TextInput, Toolbar, usePaged
} from '@/components/ui';
import { useActor, useData } from '@/lib/data';
import { dateLong } from '@/lib/format';
import type { Assignment } from '@/lib/types';

export default function AssignmentsPage() {
  const actor = useActor();
  const { data, saveAssignment, decideAssignment, today } = useData();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState<Partial<Assignment> | null>(null);
  const [ending, setEnding] = useState<Assignment | null>(null);
  const [declining, setDeclining] = useState<Assignment | null>(null);

  const requests = data.assignments.filter((a) => a.status === 'requested');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const named = (a: Assignment) => {
      const t = data.teachers.find((x) => x.id === a.teacherId)?.name ?? '';
      const s = data.schools.find((x) => x.id === a.schoolId)?.name ?? '';
      return `${a.id} ${t} ${s} ${a.subjects.join(' ')}`.toLowerCase();
    };
    return data.assignments
      .filter((a) => status === 'all' || a.status === status)
      .filter((a) => !needle || named(a).includes(needle))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.assignments, data.teachers, data.schools, q, status]);

  const paged = usePaged(rows, 14);
  const nameOf = (id: string, kind: 'teacher' | 'school') =>
    kind === 'teacher'
      ? data.teachers.find((t) => t.id === id)?.name ?? id
      : data.schools.find((s) => s.id === id)?.name ?? id;

  if (actor.role !== 'admin') {
    return (
      <>
        <PageHead title="Assignments" />
        <EmptyState icon={Link2} title="Glampter manages assignments"
          text="Teachers see their own placements under My schools; schools see assigned teachers under Teachers." />
      </>
    );
  }

  return (
    <>
      <PageHead title="Assignments"
        sub="Who may teach where, covering which subjects and classes, and from when."
        actions={
          <button className="btn btn-primary btn-sm"
            onClick={() => setForm({ teacherId: '', schoolId: '', subjects: [], classes: [], startDate: today, status: 'active', origin: 'admin' })}>
            <PlusCircle size={15} /> New assignment
          </button>
        } />

      {requests.length ? (
        <div className="frame frame-tint-gold cap mb-6">
          <span className="eyebrow">{requests.length} request{requests.length === 1 ? '' : 's'} awaiting a decision</span>
          <div className="stack mt-4">
            {requests.map((a) => (
              <div key={a.id} className="frame flex flex-wrap items-center gap-4 justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {nameOf(a.teacherId, 'teacher')} → {nameOf(a.schoolId, 'school')}
                  </p>
                  <p className="text-sm text-[var(--text-2)]">
                    {a.subjects.join(', ') || 'Any subject'} · {a.classes.join(', ') || 'any class'}
                    {a.notes ? ` · “${a.notes}”` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={() => setDeclining(a)}>
                    <X size={14} /> Decline
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => void decideAssignment(a.id, 'active')}>
                    <Check size={14} /> Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <KpiGrid cols={4} className="mb-6">
        <Kpi label="Active" value={String(data.assignments.filter((a) => a.status === 'active').length)} sub="teacher–school links" tone="ok" />
        <Kpi label="Requested" value={String(requests.length)} sub="awaiting your decision" tone={requests.length ? 'warn' : undefined} />
        <Kpi label="Ended" value={String(data.assignments.filter((a) => a.status === 'ended').length)} sub="kept for reporting" />
        <Kpi label="Schools covered" value={String(new Set(data.assignments.filter((a) => a.status === 'active').map((a) => a.schoolId)).size)} sub="with an active teacher" tone="info" />
      </KpiGrid>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Teacher, school, ASN-000411…" />
        <div className="min-w-[170px]">
          <Select id="as-status" label="Status" value={status} onChange={setStatus} options={[
            { value: 'all', label: 'All' }, { value: 'active', label: 'Active' },
            { value: 'requested', label: 'Requested' }, { value: 'ended', label: 'Ended' },
            { value: 'rejected', label: 'Declined' }]} />
        </div>
      </Toolbar>

      {rows.length ? (
        <>
          <TableWrap minWidth={980} head={['Assignment', 'Teacher', 'School', 'Covers', 'From', 'Status', '']}>
            {paged.slice.map((a) => (
              <tr key={a.id}>
                <td className="mono text-xs">{a.id}</td>
                <td className="text-right">{nameOf(a.teacherId, 'teacher')}</td>
                <td className="text-right">{nameOf(a.schoolId, 'school')}</td>
                <td className="text-right">{a.subjects.join(', ') || 'All subjects'}</td>
                <td className="num">{dateLong(a.startDate)}</td>
                <td className="text-right">
                  <Badge tone={a.status === 'active' ? 'ok' : a.status === 'requested' ? 'warn'
                    : a.status === 'rejected' ? 'bad' : 'mute'}>{a.status}</Badge>
                </td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn btn-ghost btn-sm" onClick={() => setForm(a)}>Edit</button>
                  {a.status === 'active' ? (
                    <button className="btn btn-ghost btn-sm ml-2" onClick={() => setEnding(a)}>End</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </TableWrap>
          <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={paged.setPage} />
        </>
      ) : (
        <EmptyState icon={Search} title="No assignments match" text="Clear the filters, or create one." />
      )}

      <Modal open={Boolean(form)} onClose={() => setForm(null)} wide
        title={form?.id ? 'Edit assignment' : 'New assignment'}
        sub="A teacher can only submit sessions to a school they are actively assigned to."
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!form?.teacherId || !form?.schoolId}
              onClick={async () => { if (form) { await saveAssignment(form); setForm(null); } }}>
              {form?.id ? 'Save changes' : 'Create assignment'}
            </button>
          </>
        }>
        {form ? (
          <>
            <div className="grid-2">
              <Select id="as-teacher" label="Teacher" value={form.teacherId ?? ''}
                onChange={(v) => setForm({ ...form, teacherId: v })} placeholder="Choose a teacher"
                options={data.teachers.filter((t) => t.status === 'active')
                  .map((t) => ({ value: t.id, label: t.name }))} />
              <Select id="as-school" label="School" value={form.schoolId ?? ''}
                onChange={(v) => setForm({ ...form, schoolId: v })} placeholder="Choose a school"
                options={data.schools.filter((s) => s.status === 'active')
                  .map((s) => ({ value: s.id, label: s.name }))} />
            </div>
            <ChipPicker label="Subjects covered" options={data.subjects.map((s) => s.name)}
              selected={form.subjects ?? []} onChange={(v) => setForm({ ...form, subjects: v })}
              hint="Leave empty to allow every subject." />
            <ChipPicker label="Classes covered" options={data.classes.map((c) => c.name)}
              selected={form.classes ?? []} onChange={(v) => setForm({ ...form, classes: v })}
              hint="Leave empty to allow every class." />
            <div className="grid-3">
              <TextInput id="as-start" label="Start date" type="date" value={form.startDate ?? today}
                onChange={(v) => setForm({ ...form, startDate: v })} />
              <TextInput id="as-end" label="End date (optional)" type="date" value={form.endDate ?? ''}
                onChange={(v) => setForm({ ...form, endDate: v })} />
              <Select id="as-st" label="Status" value={form.status ?? 'active'}
                onChange={(v) => setForm({ ...form, status: v as Assignment['status'] })}
                options={[{ value: 'active', label: 'Active' }, { value: 'requested', label: 'Requested' },
                  { value: 'ended', label: 'Ended' }]} />
            </div>
            <TextArea id="as-notes" label="Notes" value={form.notes ?? ''} rows={2}
              onChange={(v) => setForm({ ...form, notes: v })} />
          </>
        ) : null}
      </Modal>

      <Confirm open={Boolean(ending)} onClose={() => setEnding(null)}
        title="End this assignment" confirmLabel="End assignment"
        reasonLabel="Reason (recorded in the audit trail)"
        body="The record is kept and dated, so past terms still report correctly. The teacher can no longer submit new sessions to that school."
        onConfirm={(reason) => { if (ending) void decideAssignment(ending.id, 'ended', reason); }} />

      <Confirm open={Boolean(declining)} onClose={() => setDeclining(null)}
        title="Decline this request" tone="danger" confirmLabel="Decline request"
        reasonLabel="Reason sent to the teacher"
        body="The teacher is notified with your reason."
        onConfirm={(reason) => { if (declining) void decideAssignment(declining.id, 'rejected', reason); }} />
    </>
  );
}
