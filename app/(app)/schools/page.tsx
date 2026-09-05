'use client';
/* School management — the client database. Every row carries the two figures
   that matter to a service relationship: hours approved, and hours still
   unconfirmed. */

import { useMemo, useState } from 'react';
import { Building2, Download, PlusCircle, Search } from 'lucide-react';
import {
  Badge, EmptyState, Frame, Kpi, KpiGrid, Modal, PageHead, Pager, SearchBox, Select,
  TableWrap, TextArea, TextInput, Toolbar, usePaged
} from '@/components/ui';
import { approvalRate, approvedMinutes, inMonth, pendingMinutes } from '@/lib/compute';
import { useActor, useData } from '@/lib/data';
import { dateLong, hoursLabel, money, pct } from '@/lib/format';
import { exportRows } from '@/lib/csv';
import type { School } from '@/lib/types';

const BLANK: Partial<School> = {
  name: '', shortName: '', address: '', city: 'Abeokuta', contact: '', email: '', phone: '',
  hourlyRate: 5000, contractedHours: 80, openTime: '07:30', closeTime: '16:00', status: 'active'
};

export default function SchoolsPage() {
  const actor = useActor();
  const { data, mySessions, saveSchool, setAccountStatus } = useData();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState<Partial<School> | null>(null);
  const [detail, setDetail] = useState<School | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.schools
      .filter((s) => status === 'all' || s.status === status)
      .filter((s) => !needle || [s.id, s.name, s.city, s.contact].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.schools, q, status]);

  const paged = usePaged(rows, 12);
  const month = inMonth(mySessions);
  const statsFor = (id: string) => {
    const mine = month.filter((s) => s.schoolId === id);
    return {
      approved: approvedMinutes(mine), pending: pendingMinutes(mine),
      rate: approvalRate(mine), teachers: new Set(mine.map((s) => s.teacherId)).size
    };
  };

  const pending = data.schools.filter((s) => s.status === 'pending');

  if (actor.role !== 'admin') {
    return (
      <>
        <PageHead title="Schools" />
        <EmptyState icon={Building2} title="Administrators manage the school database"
          text="Your own school profile and its teaching record are on your dashboard." />
      </>
    );
  }

  return (
    <>
      <PageHead title="Schools"
        sub="Client and partner institutions receiving teaching services."
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => exportRows('teach-clock-schools', rows, [
              { header: 'ID', value: (s: School) => s.id },
              { header: 'Name', value: (s: School) => s.name },
              { header: 'City', value: (s: School) => s.city },
              { header: 'Contact', value: (s: School) => s.contact },
              { header: 'Email', value: (s: School) => s.email },
              { header: 'Phone', value: (s: School) => s.phone },
              { header: 'Rate', value: (s: School) => s.hourlyRate },
              { header: 'Contracted hours', value: (s: School) => s.contractedHours },
              { header: 'Status', value: (s: School) => s.status }
            ])}><Download size={15} /> Export</button>
            <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...BLANK })}>
              <PlusCircle size={15} /> Add school
            </button>
          </>
        } />

      <KpiGrid cols={4} className="mb-6">
        <Kpi label="Active schools" value={String(data.schools.filter((s) => s.status === 'active').length)} tone="ok" />
        <Kpi label="Awaiting approval" value={String(pending.length)} sub="registered, not yet activated" tone={pending.length ? 'warn' : undefined} />
        <Kpi label="Approved this month" value={hoursLabel(approvedMinutes(month))} sub="all schools" />
        <Kpi label="Contracted hours" value={String(data.schools.reduce((a, s) => a + (s.status === 'active' ? s.contractedHours : 0), 0))} sub="monthly allocation" tone="info" />
      </KpiGrid>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Name, city, contact…" />
        <div className="min-w-[170px]">
          <Select id="s-status" label="Status" value={status} onChange={setStatus} options={[
            { value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' },
            { value: 'pending', label: 'Pending' }, { value: 'suspended', label: 'Suspended' }
          ]} />
        </div>
      </Toolbar>

      {rows.length ? (
        <>
          <TableWrap minWidth={1000}
            head={['School', 'Contact', 'Teachers', 'Approved', 'Pending', 'Rate', 'Status', '']}>
            {paged.slice.map((s) => {
              const st = statsFor(s.id);
              return (
                <tr key={s.id}>
                  <td>
                    <span className="block font-medium">{s.name}</span>
                    <span className="mono text-xs text-[var(--text-3)]">{s.id} · {s.city}</span>
                  </td>
                  <td className="text-right">{s.contact}</td>
                  <td className="num">{st.teachers}</td>
                  <td className="num">{hoursLabel(st.approved)}</td>
                  <td className="num" style={st.pending ? { color: 'var(--warn)' } : undefined}>
                    {hoursLabel(st.pending)}
                  </td>
                  <td className="num">{money(s.hourlyRate)}</td>
                  <td className="text-right">
                    <Badge tone={s.status === 'active' ? 'ok' : s.status === 'pending' ? 'warn' : 'bad'}>
                      {s.status}
                    </Badge>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetail(s)}>Open</button>
                    <button className="btn btn-ghost btn-sm ml-2" onClick={() => setForm(s)}>Edit</button>
                  </td>
                </tr>
              );
            })}
          </TableWrap>
          <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={paged.setPage} />
        </>
      ) : (
        <EmptyState icon={Search} title="No schools match" text="Clear the filters, or add the school." />
      )}

      {/* create / edit */}
      <Modal open={Boolean(form)} onClose={() => setForm(null)} wide
        title={form?.id ? 'Edit school' : 'Add a school'}
        sub={form?.id ? form.name : 'The rate and contracted hours drive the financial report.'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!form?.name?.trim()}
              onClick={async () => { if (form) { await saveSchool(form); setForm(null); } }}>
              {form?.id ? 'Save changes' : 'Create school'}
            </button>
          </>
        }>
        {form ? (
          <>
            <div className="grid-2">
              <TextInput id="sc-name" label="School name" value={form.name ?? ''}
                onChange={(v) => setForm({ ...form, name: v })} />
              <TextInput id="sc-city" label="City" value={form.city ?? ''}
                onChange={(v) => setForm({ ...form, city: v })} />
            </div>
            <TextInput id="sc-addr" label="Address" value={form.address ?? ''}
              onChange={(v) => setForm({ ...form, address: v })} />
            <div className="grid-3">
              <TextInput id="sc-contact" label="Contact person" value={form.contact ?? ''}
                onChange={(v) => setForm({ ...form, contact: v })} />
              <TextInput id="sc-email" label="Email" type="email" value={form.email ?? ''}
                onChange={(v) => setForm({ ...form, email: v })} />
              <TextInput id="sc-phone" label="Phone" value={form.phone ?? ''}
                onChange={(v) => setForm({ ...form, phone: v })} />
            </div>
            <div className="grid-3">
              <TextInput id="sc-rate" label="Billed rate per hour (₦)" type="number"
                value={String(form.hourlyRate ?? '')}
                onChange={(v) => setForm({ ...form, hourlyRate: Number(v) || 0 })} />
              <TextInput id="sc-hours" label="Contracted hours / month" type="number"
                value={String(form.contractedHours ?? '')}
                onChange={(v) => setForm({ ...form, contractedHours: Number(v) || 0 })} />
              <Select id="sc-status" label="Status" value={form.status ?? 'active'}
                onChange={(v) => setForm({ ...form, status: v as School['status'] })}
                options={[{ value: 'active', label: 'Active' }, { value: 'pending', label: 'Pending' },
                  { value: 'suspended', label: 'Suspended' }]} />
            </div>
            <div className="grid-2">
              <TextInput id="sc-open" label="Opens" type="time" value={form.openTime ?? '07:30'}
                onChange={(v) => setForm({ ...form, openTime: v })} />
              <TextInput id="sc-close" label="Closes" type="time" value={form.closeTime ?? '16:00'}
                onChange={(v) => setForm({ ...form, closeTime: v })} />
            </div>
            <TextArea id="sc-notes" label="Notes" value={form.notes ?? ''}
              onChange={(v) => setForm({ ...form, notes: v })} rows={2} />
          </>
        ) : null}
      </Modal>

      {/* profile */}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} wide
        title={detail?.name ?? ''} sub={detail ? `${detail.id} · ${detail.address}, ${detail.city}` : ''}
        footer={detail ? (
          <>
            {detail.status === 'pending' ? (
              <button className="btn btn-primary"
                onClick={async () => { await setAccountStatus('school', detail.id, 'active'); setDetail(null); }}>
                Approve school
              </button>
            ) : (
              <button className="btn btn-ghost"
                onClick={async () => {
                  await setAccountStatus('school', detail.id,
                    detail.status === 'suspended' ? 'active' : 'suspended');
                  setDetail(null);
                }}>
                {detail.status === 'suspended' ? 'Reactivate' : 'Suspend'}
              </button>
            )}
            <button className="btn btn-primary" onClick={() => { setForm(detail); setDetail(null); }}>Edit</button>
          </>
        ) : null}>
        {detail ? (() => {
          const st = statsFor(detail.id);
          const assigned = data.assignments.filter((a) => a.schoolId === detail.id && a.status === 'active');
          return (
            <>
              <KpiGrid cols={3}>
                <Kpi label="Approved this month" value={hoursLabel(st.approved)} sub={`of ${detail.contractedHours} contracted`} tone="ok" />
                <Kpi label="Pending" value={hoursLabel(st.pending)} sub="awaiting your confirmation" tone="warn" />
                <Kpi label="Approval rate" value={pct(st.rate)} sub="of reviewed sessions" tone="info" />
              </KpiGrid>
              <dl className="dl">
                <dt>Contact</dt><dd>{detail.contact} · {detail.email} · {detail.phone}</dd>
                <dt>Hours</dt><dd>{detail.openTime}–{detail.closeTime}</dd>
                <dt>Billed rate</dt><dd>{money(detail.hourlyRate)} per approved hour</dd>
                <dt>Teachers</dt><dd>{assigned.length} assigned</dd>
              </dl>
              <div>
                <span className="eyebrow">Assigned teachers</span>
                <ul className="stack mt-3">
                  {assigned.map((a) => {
                    const t = data.teachers.find((x) => x.id === a.teacherId);
                    return (
                      <li key={a.id} className="frame frame-flat flex justify-between gap-3 text-sm">
                        <span>{t?.name}<span className="mono text-xs text-[var(--text-3)] ml-2">{a.id}</span></span>
                        <span className="text-[var(--text-2)]">{a.subjects.join(', ') || 'All subjects'}</span>
                      </li>
                    );
                  })}
                  {!assigned.length ? <li className="text-sm text-[var(--text-2)]">No teachers assigned yet.</li> : null}
                </ul>
              </div>
              {detail.notes ? <p className="text-sm text-[var(--text-2)]">{detail.notes}</p> : null}
            </>
          );
        })() : null}
      </Modal>
    </>
  );
}
