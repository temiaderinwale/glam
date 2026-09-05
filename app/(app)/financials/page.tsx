'use client';
/* Teach Clock — service & financial report.

   The page has one job beyond arithmetic: teach the distinction between
   submitted and approved. Only approved hours are validated service delivery,
   and only approved hours are ever billed. Everything else is tracked, chased,
   and kept out of the money columns. */

import { useMemo, useState } from 'react';
import {
  AlertCircle, BarChart3, Building2, Coins, Download, GraduationCap, Printer, Scale
} from 'lucide-react';
import {
  Badge, Frame, Kpi, KpiGrid, LifecycleRail, PageHead, SectionHead, TableWrap
} from '@/components/ui';
import {
  RANGE_LABEL, applyRange, approvalRate, approvedMinutes, monthlySeries, pendingMinutes,
  rejectedMinutes, schoolRows, teacherRows, utilisation, type RangeKey
} from '@/lib/compute';
import { useData } from '@/lib/data';
import { hours, hoursLabel, money, moneyShort, monthLabel, pct } from '@/lib/format';
import { exportRows } from '@/lib/csv';

const RANGES: RangeKey[] = ['today', 'week', 'month', 'lastMonth', 'cycle', 'all'];

export default function FinancialsPage() {
  const { data, mySessions } = useData();
  const { schools, teachers, sessions } = { schools: data.schools, teachers: data.teachers, sessions: mySessions };
  const [range, setRange] = useState<RangeKey>('month');
  const [schoolId, setSchoolId] = useState('all');
  const [teacherId, setTeacherId] = useState('all');
  const [subject, setSubject] = useState('all');

  const filtered = useMemo(() => {
    let list = applyRange(sessions, range);
    if (schoolId !== 'all') list = list.filter((s) => s.schoolId === schoolId);
    if (teacherId !== 'all') list = list.filter((s) => s.teacherId === teacherId);
    if (subject !== 'all') list = list.filter((s) => s.subject === subject);
    return list;
  }, [sessions, range, schoolId, teacherId, subject]);

  const sRows = useMemo(() => schoolRows(filtered, schools), [filtered, schools]);
  const tRows = useMemo(() => teacherRows(filtered, teachers), [filtered, teachers]);
  const months = useMemo(() => monthlySeries(sessions, schools).slice(-6), [sessions, schools]);
  const util = useMemo(() => utilisation(sessions, schools), [sessions, schools]);

  const billable = sRows.reduce((a, r) => a + r.billable, 0);
  const payable = tRows.reduce((a, r) => a + r.payable, 0);
  const margin = billable - payable;
  const marginPct = billable ? (margin / billable) * 100 : 0;

  const approvedM = approvedMinutes(filtered);
  const pendingM = pendingMinutes(filtered);
  const rejectedM = rejectedMinutes(filtered);
  const pendingValue = sRows.reduce((a, r) => a + (r.pendingMinutes / 60) * r.school.hourlyRate, 0);

  const maxMonthMin = Math.max(1, ...months.map((m) => m.minutes));
  const maxMonthVal = Math.max(1, ...months.map((m) => m.value));

  const exportRevenue = () => exportRows('teach-clock-revenue-by-school', sRows, [
    { header: 'School', value: (r) => r.school.name },
    { header: 'ID', value: (r) => r.school.id },
    { header: 'Approved hours', value: (r) => (r.approvedMinutes / 60).toFixed(2) },
    { header: 'Rate', value: (r) => r.school.hourlyRate },
    { header: 'Billable value', value: (r) => Math.round(r.billable) },
    { header: 'Pending hours', value: (r) => (r.pendingMinutes / 60).toFixed(2) },
    { header: 'Approval rate %', value: (r) => r.approvalRate.toFixed(1) }
  ]);

  const exportCost = () => exportRows('teach-clock-cost-by-teacher', tRows, [
    { header: 'Teacher', value: (r) => r.teacher.name },
    { header: 'ID', value: (r) => r.teacher.id },
    { header: 'Approved hours', value: (r) => (r.approvedMinutes / 60).toFixed(2) },
    { header: 'Rate', value: (r) => r.teacher.hourlyRate },
    { header: 'Calculated payable', value: (r) => Math.round(r.payable) },
    { header: 'Schools', value: (r) => r.schools },
    { header: 'Approval rate %', value: (r) => r.approvalRate.toFixed(1) }
  ]);

  const reset = () => { setRange('month'); setSchoolId('all'); setTeacherId('all'); setSubject('all'); };
  const filtersOn = schoolId !== 'all' || teacherId !== 'all' || subject !== 'all';

  return (
    <>
      <PageHead
        title="Financial overview"
        sub="Approved teaching hours, what they are worth to the firm, and what they cost to deliver."
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
              <Printer size={15} aria-hidden="true" /> Print
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportRevenue}>
              <Download size={15} aria-hidden="true" /> Revenue CSV
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportCost}>
              <Download size={15} aria-hidden="true" /> Cost CSV
            </button>
          </>
        }
      />

      {/* ---- controls ---- */}
      <Frame tone="flat" className="mb-6 no-print">
        <div className="flex flex-wrap gap-5 items-end">
          <div className="min-w-[190px]">
            <label className="field-label" htmlFor="range">Reporting period</label>
            <select id="range" className="input" value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
              {RANGES.map((r) => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
            </select>
          </div>
          <div className="min-w-[190px]">
            <label className="field-label" htmlFor="school">School</label>
            <select id="school" className="input" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              <option value="all">All schools</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.shortName}</option>)}
            </select>
          </div>
          <div className="min-w-[190px]">
            <label className="field-label" htmlFor="teacher">Teacher</label>
            <select id="teacher" className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="all">All teachers</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="min-w-[190px]">
            <label className="field-label" htmlFor="subject">Subject</label>
            <select id="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="all">All subjects</option>
              {data.subjects.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          {filtersOn ? (
            <button className="btn btn-ghost btn-sm" onClick={reset}>Clear filters</button>
          ) : null}
        </div>
      </Frame>

      <p className="hidden print:block mb-4 text-sm">
        {RANGE_LABEL[range]} · {schoolId === 'all' ? 'All schools' : schools.find((s) => s.id === schoolId)?.name}
        {' '}· {filtered.length} sessions
      </p>

      {/* ---- summary ---- */}
      <KpiGrid cols={4} className="mb-3">
        <Kpi label="Approved hours" value={hours(approvedM)} sub="validated service delivery" tone="ok" icon={BarChart3} />
        <Kpi label="Pending hours" value={hours(pendingM)} sub={`${moneyShort(pendingValue)} not yet billable`} tone="warn" icon={AlertCircle} />
        <Kpi label="Rejected hours" value={hours(rejectedM)} sub="never counted as delivered" tone="bad" />
        <Kpi label="Billable value" value={money(billable)} sub="approved hours only" accent icon={Coins} />
      </KpiGrid>

      <Frame tone="flat" className="mb-7 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5">
          <Badge tone="ok">Approved</Badge>
          <span className="text-sm text-[var(--text-2)]">confirmed by the school — billable.</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Badge tone="warn">Pending</Badge>
          <span className="text-sm text-[var(--text-2)]">submitted, awaiting confirmation — excluded from every money column.</span>
        </div>
      </Frame>

      {/* ---- revenue ---- */}
      <section className="mb-7">
        <SectionHead title="Revenue by school" icon={Building2}
          right={<span className="mono text-xs">{sRows.length} schools in range</span>} />
        <TableWrap
          head={['School', 'Approved hrs', 'Rate / hr', 'Billable value', 'Pending hrs', 'Approval rate']}
          minWidth={860}
          foot={
            <tr>
              <td>Total</td>
              <td className="num">{hours(sRows.reduce((a, r) => a + r.approvedMinutes, 0))}</td>
              <td className="num">—</td>
              <td className="num">{money(billable)}</td>
              <td className="num">{hours(sRows.reduce((a, r) => a + r.pendingMinutes, 0))}</td>
              <td className="num">{pct(approvalRate(filtered))}</td>
            </tr>
          }
        >
          {sRows.map((r) => (
            <tr key={r.school.id}>
              <td>
                <span className="block font-medium">{r.school.name}</span>
                <span className="mono text-xs text-[var(--text-3)]">{r.school.id} · {r.school.city}</span>
              </td>
              <td className="num">{hours(r.approvedMinutes)}</td>
              <td className="num">{money(r.school.hourlyRate)}</td>
              <td className="num font-semibold">{money(r.billable)}</td>
              <td className="num" style={{ color: r.pendingMinutes ? 'var(--warn)' : 'inherit' }}>
                {hours(r.pendingMinutes)}
              </td>
              <td className="num">{pct(r.approvalRate)}</td>
            </tr>
          ))}
        </TableWrap>
      </section>

      {/* ---- cost ---- */}
      <section className="mb-7">
        <SectionHead title="Cost by teacher" icon={GraduationCap}
          right={<span className="mono text-xs">{tRows.length} teachers in range</span>} />
        <TableWrap
          head={['Teacher', 'Approved hrs', 'Rate / hr', 'Calculated payable', 'Schools', 'Approval rate']}
          minWidth={860}
          foot={
            <tr>
              <td>Total</td>
              <td className="num">{hours(tRows.reduce((a, r) => a + r.approvedMinutes, 0))}</td>
              <td className="num">—</td>
              <td className="num">{money(payable)}</td>
              <td className="num">—</td>
              <td className="num">—</td>
            </tr>
          }
        >
          {tRows.map((r) => (
            <tr key={r.teacher.id}>
              <td>
                <span className="block font-medium">{r.teacher.name}</span>
                <span className="mono text-xs text-[var(--text-3)]">{r.teacher.id}</span>
              </td>
              <td className="num">{hours(r.approvedMinutes)}</td>
              <td className="num">{money(r.teacher.hourlyRate)}</td>
              <td className="num font-semibold">{money(r.payable)}</td>
              <td className="num">{r.schools}</td>
              <td className="num">{pct(r.approvalRate)}</td>
            </tr>
          ))}
        </TableWrap>
      </section>

      {/* ---- margin ---- */}
      <section className="mb-7">
        <Frame tone="ink" className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Scale size={20} strokeWidth={1.8} style={{ color: 'var(--gold)' }} aria-hidden="true" />
            <div>
              <span className="eyebrow">Margin on delivered service</span>
              <p className="mt-1.5 text-sm" style={{ color: '#B7AC97' }}>
                {money(billable)} billable less {money(payable)} payable.
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="font-display text-[34px] font-extrabold tnum" style={{ color: 'var(--gold)' }}>
              {money(margin)}
            </span>
            <p className="mono text-xs" style={{ color: '#B7AC97' }}>{pct(marginPct)} of billable value</p>
          </div>
        </Frame>
      </section>

      {/* ---- charts ---- */}
      <section className="grid lg:grid-cols-2 gap-5 mb-7">
        <Frame>
          <SectionHead title="Approved hours by month" icon={BarChart3} />
          <div className="bars">
            {months.map((m) => (
              <div className="bar-col" key={m.ym} title={`${monthLabel(m.ym)}: ${hoursLabel(m.minutes)}`}>
                <div className="bar-fill" style={{ height: `${(m.minutes / maxMonthMin) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-[5px] mt-2">
            {months.map((m) => <div className="bar-cap flex-1 min-w-0" key={m.ym}>{monthLabel(m.ym)}</div>)}
          </div>
        </Frame>

        <Frame>
          <SectionHead title="Billable value by month" icon={Coins} />
          <div className="bars">
            {months.map((m) => (
              <div className="bar-col" key={m.ym} title={`${monthLabel(m.ym)}: ${money(m.value)}`}>
                <div className="bar-fill is-mute" style={{ height: `${(m.value / maxMonthVal) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-[5px] mt-2">
            {months.map((m) => <div className="bar-cap flex-1 min-w-0" key={m.ym}>{moneyShort(m.value)}</div>)}
          </div>
        </Frame>
      </section>

      {/* ---- utilisation ---- */}
      <section className="mb-7">
        <SectionHead title="Contract utilisation, this month" icon={Building2}
          right={<span className="text-xs">Marker shows the contracted allocation</span>} />
        <Frame>
          <div className="flex flex-col gap-6">
            {util.map((u) => {
              const scale = Math.max(u.contracted, u.delivered) * 1.08;
              return (
                <div key={u.school.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <span className="font-medium">{u.school.name}</span>
                    <span className="mono text-xs text-[var(--text-2)]">
                      {u.approved.toFixed(1)} approved / {u.contracted} contracted
                      {u.overrun > 0 ? ` · ${u.overrun.toFixed(1)} over` : ` · ${u.remaining.toFixed(1)} remaining`}
                    </span>
                  </div>
                  <div className="hbar" style={{ height: 13 }}>
                    <div className="hbar-fill" style={{ width: `${(u.approved / scale) * 100}%` }} />
                    <span className="hbar-mark" style={{ left: `${(u.contracted / scale) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Frame>
      </section>

      {/* ---- the spine ---- */}
      <section>
        <SectionHead title="Where these hours came from" />
        <Frame brackets>
          <LifecycleRail upto={7} current={6} />
          <p className="mt-6 text-sm text-[var(--text-2)] max-w-[74ch]">
            Every figure on this page is built from sessions that reached
            <span className="font-semibold text-[var(--text)]"> Approved</span> — submitted by a
            teacher, confirmed by the school, and locked against ordinary editing. Invoicing and
            payroll extend this same record in Phase 3; nothing has to be recalculated to get there.
          </p>
        </Frame>
      </section>
    </>
  );
}
