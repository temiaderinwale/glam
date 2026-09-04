'use client';
/* The teaching calendar. A month grid of what was actually recorded, so a
   school can see at a glance which expected days have nothing against them —
   the missing session is the useful signal here, not the present one. */

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Frame, Kpi, KpiGrid, PageHead, SectionHead, Select, Toolbar } from '@/components/ui';
import { SessionDetail } from '@/components/SessionParts';
import { STATUS_TONE, STATUS_LABEL, isPending, minutes } from '@/lib/compute';
import { useActor, useData } from '@/lib/data';
import { dateLong, hours, hoursLabel } from '@/lib/format';
import type { TeachingSession } from '@/lib/types';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthGrid(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDow = (first.getUTCDay() + 6) % 7;              // Monday-first
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: { date: string; out: boolean }[] = [];
  for (let i = 0; i < startDow; i++) {
    const d = new Date(Date.UTC(y, m - 1, 1 - (startDow - i)));
    cells.push({ date: d.toISOString().slice(0, 10), out: true });
  }
  for (let d = 1; d <= days; d++) {
    cells.push({ date: `${ym}-${String(d).padStart(2, '0')}`, out: false });
  }
  while (cells.length % 7) {
    const last = new Date(cells[cells.length - 1].date + 'T00:00:00Z');
    last.setUTCDate(last.getUTCDate() + 1);
    cells.push({ date: last.toISOString().slice(0, 10), out: true });
  }
  return cells;
}

export default function SchedulePage() {
  const actor = useActor();
  const { data, mySessions, today } = useData();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [schoolId, setSchoolId] = useState('all');
  const [open, setOpen] = useState<TeachingSession | null>(null);

  const scoped = useMemo(() =>
    mySessions.filter((s) => schoolId === 'all' || s.schoolId === schoolId),
    [mySessions, schoolId]);

  const byDate = useMemo(() => {
    const map = new Map<string, TeachingSession[]>();
    scoped.forEach((s) => map.set(s.date, [...(map.get(s.date) ?? []), s]));
    return map;
  }, [scoped]);

  const cells = monthGrid(ym);
  const inMonthSessions = scoped.filter((s) => s.date.startsWith(ym));
  const shift = (n: number) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setYm(d.toISOString().slice(0, 7));
  };
  const label = new Date(ym + '-01T00:00:00Z')
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <>
      <PageHead title="Schedule"
        sub={actor.role === 'school'
          ? 'What was taught at your school, day by day. Empty weekdays are worth a question.'
          : 'Your teaching month at a glance.'}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <span className="font-display font-bold text-sm min-w-[140px] text-center">{label}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
        } />

      <KpiGrid cols={4} className="mb-6">
        <Kpi label="Sessions this month" value={String(inMonthSessions.length)} sub={label} />
        <Kpi label="Hours recorded" value={hours(minutes(inMonthSessions))} sub="all statuses" tone="info" />
        <Kpi label="Awaiting approval" value={String(inMonthSessions.filter(isPending).length)} sub="still unconfirmed" tone="warn" />
        <Kpi label="Teaching days" value={String(new Set(inMonthSessions.map((s) => s.date)).size)} sub="days with activity" tone="ok" />
      </KpiGrid>

      {actor.role !== 'teacher' ? (
        <Toolbar>
          <div className="min-w-[200px]">
            <Select id="cal-school" label="School" value={schoolId} onChange={setSchoolId}
              options={[{ value: 'all', label: 'All schools' },
                ...data.schools.map((s) => ({ value: s.id, label: s.shortName }))]} />
          </div>
        </Toolbar>
      ) : null}

      <SectionHead title="Recorded teaching" icon={CalendarDays} />
      <div className="cal">
        {DOW.map((d) => <div className="cal-head" key={d}>{d}</div>)}
        {cells.map((c) => {
          const list = byDate.get(c.date) ?? [];
          return (
            <div key={c.date}
              className={`cal-day${c.out ? ' is-out' : ''}${c.date === today ? ' is-today' : ''}`}>
              <span className="cal-num">{Number(c.date.slice(-2))}</span>
              {list.slice(0, 3).map((s) => (
                <button key={s.id} className={`cal-ev is-${STATUS_TONE[s.status]}`} onClick={() => setOpen(s)}
                  title={`${s.subject} · ${s.className} · ${hoursLabel(s.durationMinutes)}`}>
                  {s.startTime} {actor.role === 'teacher' ? s.schoolName.split(' ')[0] : s.teacherName.split(' ')[0]} · {s.subject}
                </button>
              ))}
              {list.length > 3 ? (
                <span className="text-[10px] text-[var(--text-3)]">+{list.length - 3} more</span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 mt-4">
        {(['approved', 'pending', 'rejected'] as const).map((k) => (
          <span key={k} className="flex items-center gap-2 text-sm text-[var(--text-2)]">
            <Badge tone={STATUS_TONE[k]}>{STATUS_LABEL[k]}</Badge>
          </span>
        ))}
      </div>

      <SessionDetail session={open} open={Boolean(open)} onClose={() => setOpen(null)} />
    </>
  );
}
