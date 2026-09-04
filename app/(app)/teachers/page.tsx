'use client';
/* Teacher management — the firm's people, and the registration queue that
   decides who may transact at all (BR-001). */

import { useMemo, useState } from 'react';
import { Download, GraduationCap, PlusCircle, Search, UserCheck } from 'lucide-react';
import {
  Badge, ChipPicker, Confirm, EmptyState, Kpi, KpiGrid, Modal, PageHead, Pager,
  SearchBox, Select, TableWrap, TextArea, TextInput, Toolbar, usePaged
} from '@/components/ui';
import { approvalRate, approvedMinutes, inMonth, pendingMinutes } from '@/lib/compute';
import { useActor, useData } from '@/lib/data';
import { dateLong, hoursLabel, money, pct } from '@/lib/format';
import { exportRows } from '@/lib/csv';
import type { Teacher } from '@/lib/types';

const BLANK: Partial<Teacher> = {
  name: '', email: '', phone: '', subjects: [], qualification: '',
  experienceYears: 1, hourlyRate: 3000, status: 'active'
};

export default function TeachersPage() {
  const actor = useActor();
  const { data, mySessions, saveTeacher, setAccountStatus, today } = useData();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState<Partial<Teacher> | null>(null);
  const [detail, setDetail] = useState<Teacher | null>(null);
  const [rejecting, setRejecting] = useState<Teacher | null>(null);

  const month = inMonth(mySessions);
  const statsFor = (id: string) => {
    const mine = month.filter((s) => s.teacherId === id);
    return {
      approved: approvedMinutes(mine), pending: pendingMinutes(mine), rate: approvalRate(mine),
      schools: new Set(mine.map((s) => s.schoolId)).size
    };
  };

  /* A school only ever sees the teachers assigned to it — BR-011. */
  const visible = useMemo(() => {
    if (actor.role === 'admin') return data.teachers;
    const ids = new Set(data.assignments
      .filter((a) => a.schoolId === actor.schoolId && a.status === 'active')
      .map((a) => a.teacherId));
    return data.teachers.filter((t) => ids.has(t.id));
  }, [data.teachers, data.assignments, actor]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visible
      .filter((t) => status === 'all' || t.status === status)
      .filter((t) => !needle || [t.id, t.name, t.email, ...t.subjects].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visible, q, status]);

  const paged = usePaged(rows, 12);
  const pending = visible.filter((t) => t.status === 'pending');

  return (
    <>
      <PageHead title="Teachers"
        sub={actor.role === 'admin'
          ? 'Everyone teaching under Glampter, and who is waiting to be approved.'
          : 'The teachers currently assigned to your school.'}
        actions={actor.role === 'admin' ? (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => exportRows('teach-clock-teachers', rows, [
              { header: 'ID', value: (t: Teacher) => t.id },
              { header: 'Name', value: (t: Teacher) => t.name },
              { header: 'Email', value: (t: Teacher) => t.email },
              { header: 'Phone', value: (t: Teacher) => t.phone },
              { header: 'Subjects', value: (t: Teacher) => t.subjects.join('; ') },
              { header: 'Qualification', value: (t: Teacher) => t.qualification },
              { header: 'Rate', value: (t: Teacher) => t.hourlyRate },
              { header: 'Status', value: (t: Teacher) => t.status }
            ])}><Download size={15} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...BLANK, joined: today })}>
              <PlusCircle size={15} /> Add teacher
            </button>
          </>
        ) : null} />

      {pending.length && actor.role === 'admin' ? (
        <div className="frame frame-tint-gold cap mb-6">
          <span className="eyebrow flex items-center gap-2">
            <UserCheck size={13} aria-hidden="true" /> {pending.length} registration{pending.length === 1 ? '' : 's'} awaiting review
          </span>
          <div className="stack mt-4">
            {pending.map((t) => (
              <div key={t.id} className="frame flex flex-wrap items-center gap-4 justify-between">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-[var(--text-2)]">
                    {t.subjects.join(', ')} · {t.qualification} · registered {dateLong(t.joined)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(t)}>Reject</button>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => void setAccountStatus('teacher', t.id, 'active')}>Approve</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <KpiGrid cols={4} className="mb-6">
        <Kpi label="Active teachers" value={String(visible.filter((t) => t.status === 'active').length)} sub="able to submit" tone="ok" />
        <Kpi label="Pending review" value={String(pending.length)} sub="cannot transact yet" tone={pending.length ? 'warn' : undefined} />
        <Kpi label="Approved this month" value={hoursLabel(approvedMinutes(month))} sub="all teachers" />
        <Kpi label="Approval rate" value={pct(approvalRate(month))} sub="of reviewed sessions" tone="info" />
      </KpiGrid>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Name, subject, ID…" />
        <div className="min-w-[170px]">
          <Select id="t-status" label="Status" value={status} onChange={setStatus} options={[
            { value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' },
            { value: 'pending', label: 'Pending' }, { value: 'suspended', label: 'Suspended' }]} />
        </div>
      </Toolbar>

      {rows.length ? (
        <>
          <TableWrap minWidth={980}
            head={['Teacher', 'Subjects', 'Schools', 'Approved', 'Pending', 'Rate', 'Status', '']}>
            {paged.slice.map((t) => {
              const st = statsFor(t.id);
              return (
                <tr key={t.id}>
                  <td>
                    <span className="block font-medium">{t.name}</span>
                    <span className="mono text-xs text-[var(--text-3)]">{t.id}</span>
                  </td>
                  <td className="text-right">{t.subjects.join(', ')}</td>
                  <td className="num">{st.schools}</td>
                  <td className="num">{hoursLabel(st.approved)}</td>
                  <td className="num" style={st.pending ? { color: 'var(--warn)' } : undefined}>{hoursLabel(st.pending)}</td>
                  <td className="num">{actor.role === 'admin' ? money(t.hourlyRate) : '—'}</td>
                  <td className="text-right">
                    <Badge tone={t.status === 'active' ? 'ok' : t.status === 'pending' ? 'warn' : 'bad'}>{t.status}</Badge>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetail(t)}>Open</button>
                    {actor.role === 'admin' ? (
                      <button className="btn btn-ghost btn-sm ml-2" onClick={() => setForm(t)}>Edit</button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </TableWrap>
          <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={paged.setPage} />
        </>
      ) : (
        <EmptyState icon={Search} title="No teachers match" text="Clear the filters, or add a teacher." />
      )}

      <Modal open={Boolean(form)} onClose={() => setForm(null)} wide
        title={form?.id ? 'Edit teacher' : 'Add a teacher'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!form?.name?.trim()}
              onClick={async () => { if (form) { await saveTeacher(form); setForm(null); } }}>
              {form?.id ? 'Save changes' : 'Create teacher'}
            </button>
          </>
        }>
        {form ? (
          <>
            <div className="grid-2">
              <TextInput id="t-name" label="Full name" value={form.name ?? ''} onChange={(v) => setForm({ ...form, name: v })} />
              <TextInput id="t-email" label="Email" type="email" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
            </div>
            <div className="grid-2">
              <TextInput id="t-phone" label="Phone" value={form.phone ?? ''} onChange={(v) => setForm({ ...form, phone: v })} />
              <TextInput id="t-qual" label="Qualification" value={form.qualification ?? ''} onChange={(v) => setForm({ ...form, qualification: v })} />
            </div>
            <ChipPicker label="Subjects" options={data.subjects.map((s) => s.name)}
              selected={form.subjects ?? []} onChange={(v) => setForm({ ...form, subjects: v })} />
            <div className="grid-3">
              <TextInput id="t-exp" label="Years of experience" type="number" value={String(form.experienceYears ?? '')}
                onChange={(v) => setForm({ ...form, experienceYears: Number(v) || 0 })} />
              <TextInput id="t-rate" label="Paid rate per hour (₦)" type="number" value={String(form.hourlyRate ?? '')}
                onChange={(v) => setForm({ ...form, hourlyRate: Number(v) || 0 })} />
              <Select id="t-status" label="Status" value={form.status ?? 'active'}
                onChange={(v) => setForm({ ...form, status: v as Teacher['status'] })}
                options={[{ value: 'active', label: 'Active' }, { value: 'pending', label: 'Pending' },
                  { value: 'suspended', label: 'Suspended' }]} />
            </div>
            <TextArea id="t-notes" label="Notes" value={form.notes ?? ''} onChange={(v) => setForm({ ...form, notes: v })} rows={2} />
          </>
        ) : null}
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} wide
        title={detail?.name ?? ''} sub={detail ? `${detail.id} · ${detail.qualification}` : ''}
        footer={detail && actor.role === 'admin' ? (
          <>
            {detail.status === 'pending' ? (
              <button className="btn btn-primary"
                onClick={async () => { await setAccountStatus('teacher', detail.id, 'active'); setDetail(null); }}>
                Approve registration
              </button>
            ) : (
              <button className="btn btn-ghost"
                onClick={async () => {
                  await setAccountStatus('teacher', detail.id, detail.status === 'suspended' ? 'active' : 'suspended');
                  setDetail(null);
                }}>{detail.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button>
            )}
            <button className="btn btn-primary" onClick={() => { setForm(detail); setDetail(null); }}>Edit</button>
          </>
        ) : null}>
        {detail ? (() => {
          const st = statsFor(detail.id);
          const asn = data.assignments.filter((a) => a.teacherId === detail.id && a.status === 'active');
          const docs = data.documents.filter((d) => d.ownerType === 'teacher' && d.ownerId === detail.id);
          return (
            <>
              <KpiGrid cols={3}>
                <Kpi label="Approved this month" value={hoursLabel(st.approved)} sub={`${st.schools} schools`} tone="ok" />
                <Kpi label="Pending" value={hoursLabel(st.pending)} sub="awaiting schools" tone="warn" />
                <Kpi label="Approval rate" value={pct(st.rate)} sub="of reviewed sessions" tone="info" />
              </KpiGrid>
              <dl className="dl">
                <dt>Contact</dt><dd>{detail.email} · {detail.phone}</dd>
                <dt>Subjects</dt><dd>{detail.subjects.join(', ')}</dd>
                <dt>Experience</dt><dd>{detail.experienceYears ?? '—'} years</dd>
                <dt>Joined</dt><dd>{dateLong(detail.joined)}</dd>
                {actor.role === 'admin' ? <><dt>Paid rate</dt><dd>{money(detail.hourlyRate)} per approved hour</dd></> : null}
              </dl>
              <div>
                <span className="eyebrow">Assigned schools</span>
                <ul className="stack mt-3">
                  {asn.map((a) => (
                    <li key={a.id} className="frame frame-flat flex justify-between text-sm gap-3">
                      <span>{data.schools.find((s) => s.id === a.schoolId)?.name}</span>
                      <span className="text-[var(--text-2)]">since {dateLong(a.startDate)}</span>
                    </li>
                  ))}
                  {!asn.length ? <li className="text-sm text-[var(--text-2)]">Not assigned to any school yet.</li> : null}
                </ul>
              </div>
              {docs.length ? (
                <div>
                  <span className="eyebrow">Documents</span>
                  <ul className="stack mt-3">
                    {docs.map((d) => (
                      <li key={d.id} className="frame frame-flat text-sm">{d.name}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          );
        })() : null}
      </Modal>

      <Confirm open={Boolean(rejecting)} onClose={() => setRejecting(null)}
        title="Reject this registration" tone="danger" confirmLabel="Reject registration"
        reasonLabel="Reason (recorded in the audit trail)"
        body="The account stays on file as rejected rather than being deleted, so the decision is auditable."
        onConfirm={(reason) => { if (rejecting) void setAccountStatus('teacher', rejecting.id, 'rejected', reason); }} />
    </>
  );
}
