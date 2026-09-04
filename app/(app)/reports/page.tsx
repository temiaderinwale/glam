'use client';
/* Reports — the same authoritative records, grouped the way whoever is asking
   needs them. Submitted, approved, rejected and cancelled hours are reported
   separately and never summed together, because only approved hours are
   validated service delivery. */

import { useMemo, useState } from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import {
  Frame, Kpi, KpiGrid, PageHead, SectionHead, Select, TableWrap, Toolbar
} from '@/components/ui';
import {
  RANGE_LABEL, applyRange, approvalRate, approvedMinutes, dailySeries, groupMinutes,
  minutes, pendingMinutes, rejectedMinutes, type RangeKey
} from '@/lib/compute';
import { useActor, useData } from '@/lib/data';
import { dateShort, hours, hoursLabel, money, pct } from '@/lib/format';
import { exportRows } from '@/lib/csv';

type GroupBy = 'teacher' | 'school' | 'subject' | 'class' | 'day';

export default function ReportsPage() {
  const actor = useActor();
  const { data, mySessions } = useData();
  const [range, setRange] = useState<RangeKey>('month');
  const [groupBy, setGroupBy] = useState<GroupBy>('school');
  const [schoolId, setSchoolId] = useState('all');
  const [teacherId, setTeacherId] = useState('all');
  const [status, setStatus] = useState('approved');

  const scoped = useMemo(() => {
    let list = applyRange(mySessions, range);
    if (schoolId !== 'all') list = list.filter((s) => s.schoolId === schoolId);
    if (teacherId !== 'all') list = list.filter((s) => s.teacherId === teacherId);
    if (status !== 'all') list = list.filter((s) => s.status === status);
    return list;
  }, [mySessions, range, schoolId, teacherId, status]);

  /* The grouping is a report the firm actually sends: hours by whatever the
     client asked about, with the approval percentage beside it. */
  const grouped = useMemo(() => {
    const key = (s: typeof scoped[number]) =>
      groupBy === 'teacher' ? s.teacherName
        : groupBy === 'school' ? s.schoolName
        : groupBy === 'subject' ? s.subject
        : groupBy === 'class' ? s.className : s.date;
    const rows = groupMinutes(scoped, key);
    return rows.map((r) => {
      const subset = scoped.filter((s) => key(s) === r.key);
      const school = data.schools.find((x) => x.name === r.key);
      return {
        ...r,
        approved: approvedMinutes(subset),
        pending: pendingMinutes(subset),
        rejected: rejectedMinutes(subset),
        rate: approvalRate(subset),
        value: school ? (approvedMinutes(subset) / 60) * school.hourlyRate : null
      };
    });
  }, [scoped, groupBy, data.schools]);

  const days = dailySeries(scoped, 14);
  const maxDay = Math.max(1, ...days.map((d) => d.minutes));

  return (
    <>
      <PageHead title="Reports"
        sub="Daily, weekly, monthly and custom-range teaching reports, grouped however you need them."
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => exportRows('teach-clock-report', grouped, [
              { header: groupBy, value: (r) => r.key },
              { header: 'Sessions', value: (r) => r.count },
              { header: 'Total hours', value: (r) => (r.minutes / 60).toFixed(2) },
              { header: 'Approved hours', value: (r) => (r.approved / 60).toFixed(2) },
              { header: 'Pending hours', value: (r) => (r.pending / 60).toFixed(2) },
              { header: 'Rejected hours', value: (r) => (r.rejected / 60).toFixed(2) },
              { header: 'Approval rate %', value: (r) => r.rate.toFixed(1) }
            ])}><Download size={15} /> Export CSV</button>
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
              <Printer size={15} /> Print / PDF
            </button>
          </>
        } />

      <Toolbar>
        <div className="min-w-[180px]">
          <Select id="r-range" label="Period" value={range} onChange={(v) => setRange(v as RangeKey)}
            options={(['today', 'week', 'month', 'lastMonth', 'cycle', 'all'] as RangeKey[])
              .map((r) => ({ value: r, label: RANGE_LABEL[r] }))} />
        </div>
        <div className="min-w-[170px]">
          <Select id="r-group" label="Group by" value={groupBy} onChange={(v) => setGroupBy(v as GroupBy)}
            options={[{ value: 'school', label: 'School' }, { value: 'teacher', label: 'Teacher' },
              { value: 'subject', label: 'Subject' }, { value: 'class', label: 'Class' },
              { value: 'day', label: 'Day' }]} />
        </div>
        <div className="min-w-[170px]">
          <Select id="r-status" label="Status" value={status} onChange={setStatus}
            options={[{ value: 'approved', label: 'Approved only' }, { value: 'all', label: 'All statuses' },
              { value: 'pending', label: 'Pending' }, { value: 'rejected', label: 'Rejected' }]} />
        </div>
        {actor.role !== 'school' ? (
          <div className="min-w-[170px]">
            <Select id="r-school" label="School" value={schoolId} onChange={setSchoolId}
              options={[{ value: 'all', label: 'All schools' },
                ...data.schools.map((s) => ({ value: s.id, label: s.shortName }))]} />
          </div>
        ) : null}
        {actor.role !== 'teacher' ? (
          <div className="min-w-[170px]">
            <Select id="r-teacher" label="Teacher" value={teacherId} onChange={setTeacherId}
              options={[{ value: 'all', label: 'All teachers' },
                ...data.teachers.map((t) => ({ value: t.id, label: t.name }))]} />
          </div>
        ) : null}
      </Toolbar>

      <KpiGrid cols={4} className="mb-6">
        <Kpi label="Sessions" value={String(scoped.length)} sub={RANGE_LABEL[range]} />
        <Kpi label="Approved hours" value={hours(approvedMinutes(scoped))} sub="validated delivery" tone="ok" />
        <Kpi label="Pending hours" value={hours(pendingMinutes(scoped))} sub="not yet confirmed" tone="warn" />
        <Kpi label="Approval rate" value={pct(approvalRate(scoped))} sub="of reviewed sessions" tone="info" />
      </KpiGrid>

      <SectionHead title={`Hours by ${groupBy}`} icon={FileText} />
      <TableWrap minWidth={900}
        head={[groupBy === 'day' ? 'Date' : groupBy, 'Sessions', 'Total hrs', 'Approved',
          'Pending', 'Rejected', 'Approval rate', ...(groupBy === 'school' ? ['Billable'] : [])]}>
        {grouped.map((r) => (
          <tr key={r.key}>
            <td>{groupBy === 'day' ? dateShort(r.key) : r.key}</td>
            <td className="num">{r.count}</td>
            <td className="num">{hours(r.minutes)}</td>
            <td className="num" style={{ color: 'var(--ok)' }}>{hours(r.approved)}</td>
            <td className="num" style={{ color: 'var(--warn)' }}>{hours(r.pending)}</td>
            <td className="num">{hours(r.rejected)}</td>
            <td className="num">{pct(r.rate)}</td>
            {groupBy === 'school' ? <td className="num">{r.value === null ? '—' : money(r.value)}</td> : null}
          </tr>
        ))}
      </TableWrap>

      <div className="mt-6">
        <Frame>
          <SectionHead title="Daily distribution, last 14 days" />
          <div className="bars">
            {days.map((d) => (
              <div className="bar-col" key={d.date} title={`${dateShort(d.date)}: ${hoursLabel(d.minutes)}`}>
                <div className="bar-fill" style={{ height: `${(d.minutes / maxDay) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-[5px] mt-2">
            {days.map((d, i) => (
              <div className="bar-cap flex-1 min-w-0" key={d.date}>{i % 3 === 0 ? dateShort(d.date) : ''}</div>
            ))}
          </div>
        </Frame>
      </div>

      <p className="text-xs text-[var(--text-3)] mt-5 max-w-[70ch]">
        Approved, pending and rejected hours are reported separately and never summed. Only approved
        hours count as delivered service, and only approved hours reach the financial report.
      </p>
    </>
  );
}
