'use client';
/* Analytics — the questions management actually asks, which are mostly about
   behaviour rather than volume: how fast do schools confirm, who is carrying
   too much, and where are records being disputed. */

import { useMemo } from 'react';
import { Activity, AlertTriangle, Clock, TrendingUp, Users } from 'lucide-react';
import { Frame, HBar, Kpi, KpiGrid, PageHead, SectionHead, TableWrap } from '@/components/ui';
import {
  approvalRate, approvedMinutes, groupMinutes, inLastDays, inMonth, isPending,
  minutes, monthlySeries, stalePending
} from '@/lib/compute';
import { useData } from '@/lib/data';
import { hours, hoursLabel, monthLabel, pct } from '@/lib/format';

export default function AnalyticsPage() {
  const { data, mySessions } = useData();

  const month = inMonth(mySessions);
  const months = monthlySeries(mySessions, data.schools).slice(-6);
  const maxMonth = Math.max(1, ...months.map((m) => m.minutes));

  /* Approval speed: the average gap between submission and decision, per school.
     A school that takes four days is a client-management problem, not a data one. */
  const speed = useMemo(() => data.schools.map((school) => {
    const reviewed = mySessions.filter((s) => s.schoolId === school.id && s.reviewedAt && s.submittedAt);
    const avgH = reviewed.length
      ? reviewed.reduce((a, s) =>
        a + (new Date(s.reviewedAt!).getTime() - new Date(s.submittedAt!).getTime()) / 3600_000, 0) / reviewed.length
      : 0;
    const waiting = mySessions.filter((s) => s.schoolId === school.id && isPending(s));
    return {
      school, avgH, reviewed: reviewed.length, waiting: waiting.length,
      rate: approvalRate(mySessions.filter((s) => s.schoolId === school.id)),
      stale: stalePending(waiting, data.settings.approvalSlaHours).length
    };
  }).filter((r) => r.reviewed || r.waiting).sort((a, b) => b.avgH - a.avgH),
  [data.schools, mySessions, data.settings.approvalSlaHours]);

  /* Capacity: weekly load per teacher, so an unsustainable week is visible
     before it becomes a quality problem. */
  const capacity = useMemo(() => data.teachers
    .filter((t) => t.status === 'active')
    .map((t) => {
      const week = inLastDays(mySessions.filter((s) => s.teacherId === t.id), 7);
      const weekly = minutes(week) / 60;
      return {
        teacher: t, weekly,
        schools: new Set(month.filter((s) => s.teacherId === t.id).map((s) => s.schoolId)).size,
        band: weekly >= 30 ? 'High' : weekly >= 12 ? 'Normal' : 'Low',
        rate: approvalRate(mySessions.filter((s) => s.teacherId === t.id))
      };
    }).sort((a, b) => b.weekly - a.weekly), [data.teachers, mySessions, month]);

  const disputed = mySessions.filter((s) => s.status === 'rejected' || s.status === 'correction');
  const bySubject = groupMinutes(month, (s) => s.subject, true);
  const maxSubject = Math.max(1, ...bySubject.map((b) => b.minutes));
  const avgSpeed = speed.length ? speed.reduce((a, r) => a + r.avgH, 0) / speed.length : 0;

  return (
    <>
      <PageHead title="Analytics"
        sub="Approval behaviour, teacher capacity and dispute patterns across the organisation." />

      <KpiGrid cols={4} className="mb-6">
        <Kpi label="Average approval time" value={`${avgSpeed.toFixed(1)}h`}
          sub={`target ${data.settings.approvalSlaHours}h`} tone={avgSpeed > data.settings.approvalSlaHours ? 'warn' : 'ok'} icon={Clock} />
        <Kpi label="Approval rate" value={pct(approvalRate(mySessions))} sub="all time, all schools" tone="info" icon={TrendingUp} />
        <Kpi label="Disputed records" value={String(disputed.length)} sub="rejected or under correction" tone={disputed.length ? 'bad' : 'ok'} icon={AlertTriangle} />
        <Kpi label="Teachers at high load" value={String(capacity.filter((c) => c.band === 'High').length)} sub="30+ hours this week" icon={Users} />
      </KpiGrid>

      <div className="grid-2 mb-6">
        <Frame>
          <SectionHead title="Approved hours by month" icon={Activity} />
          <div className="bars">
            {months.map((m) => (
              <div className="bar-col" key={m.ym} title={`${monthLabel(m.ym)}: ${hoursLabel(m.minutes)}`}>
                <div className="bar-fill" style={{ height: `${(m.minutes / maxMonth) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-[5px] mt-2">
            {months.map((m) => <div className="bar-cap flex-1 min-w-0" key={m.ym}>{monthLabel(m.ym)}</div>)}
          </div>
        </Frame>

        <Frame>
          <SectionHead title="Approved hours by subject, this month" />
          <div className="stack mt-1">
            {bySubject.slice(0, 7).map((b) => (
              <div key={b.key}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="truncate pr-3">{b.key}</span>
                  <span className="mono text-xs text-[var(--text-2)]">{hoursLabel(b.minutes)}</span>
                </div>
                <HBar pct={(b.minutes / maxSubject) * 100} />
              </div>
            ))}
          </div>
        </Frame>
      </div>

      <SectionHead title="School approval behaviour" icon={Clock} />
      <TableWrap minWidth={860}
        head={['School', 'Average decision time', 'Reviewed', 'Still waiting', `Over ${data.settings.approvalSlaHours}h`, 'Approval rate']}>
        {speed.map((r) => (
          <tr key={r.school.id}>
            <td>{r.school.name}</td>
            <td className="num" style={r.avgH > data.settings.approvalSlaHours ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>
              {r.avgH ? `${r.avgH.toFixed(1)}h` : '—'}
            </td>
            <td className="num">{r.reviewed}</td>
            <td className="num">{r.waiting}</td>
            <td className="num" style={r.stale ? { color: 'var(--bad)' } : undefined}>{r.stale}</td>
            <td className="num">{pct(r.rate)}</td>
          </tr>
        ))}
      </TableWrap>

      <div className="mt-8">
        <SectionHead title="Teacher capacity, last 7 days" icon={Users} />
        <TableWrap minWidth={780} head={['Teacher', 'Weekly hours', 'Schools', 'Load', 'Approval rate']}>
          {capacity.map((c) => (
            <tr key={c.teacher.id}>
              <td>
                <span className="block font-medium">{c.teacher.name}</span>
                <span className="mono text-xs text-[var(--text-3)]">{c.teacher.id}</span>
              </td>
              <td className="num">{c.weekly.toFixed(1)}</td>
              <td className="num">{c.schools}</td>
              <td className="num" style={{ color: c.band === 'High' ? 'var(--warn)' : c.band === 'Low' ? 'var(--text-3)' : 'inherit' }}>
                {c.band}
              </td>
              <td className="num">{pct(c.rate)}</td>
            </tr>
          ))}
        </TableWrap>
        <p className="text-xs text-[var(--text-3)] mt-3 max-w-[70ch]">
          Load bands are workload signals, not performance judgements — a low week may simply mean a
          school was on break. Read them alongside the assignment history before acting.
        </p>
      </div>
    </>
  );
}
