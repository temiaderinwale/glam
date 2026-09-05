'use client';
/* Teach Clock — dashboard. One route, three compositions.

   Every figure below resolves through lib/compute.ts against lib/demo.ts. None
   is written into the JSX, which is why this page and /financials reconcile. */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BarChart3, Building2, CalendarCheck, CheckCircle2, ClipboardCheck,
  Clock, FileWarning, GraduationCap, Inbox, PlusCircle, TrendingUp, UserPlus, Users, X
} from 'lucide-react';
import {
  ApprovalPair, Badge, EmptyState, Frame, Kpi, KpiGrid, LifecycleRail, PageHead,
  SectionHead, Skeleton, TableWrap, railFor
} from '@/components/ui';
import {
  STATUS_LABEL, STATUS_TONE, approvalRate, approvedMinutes, dailySeries, groupMinutes,
  inLastDays, inMonth, isPending, minutes, needsTeacherAction, onDate
} from '@/lib/compute';
import AssignmentQueue from '@/components/AssignmentQueue';
 import { useActor, useData } from '@/lib/data';
import { ago, dateFull, dateShort, greeting, hours, hoursLabel, orgHour, pct } from '@/lib/format';
import { useGlam } from '@/lib/store';
import type { Assignment, TeachingSession, UserProfile } from '@/lib/types';

export default function DashboardPage() {
  const { role } = useGlam();
  const { ready } = useData();

  if (!ready) {
    return (
      <>
        <PageHead title="Dashboard" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton lines={4} /><Skeleton lines={4} /><Skeleton lines={5} /><Skeleton lines={5} />
        </div>
      </>
    );
  }

  return (
    <>
      {role === 'teacher' ? <TeacherView /> : role === 'school' ? <SchoolView /> : <AdminView />}
    </>
  );
}

/* ================= Teacher ================= */

/* ---------- who is being greeted, and when ---------- */

/* Seeded with the same value the server rendered, then corrected on mount and
   kept honest every minute, so a dashboard left open overnight does not still
   say good afternoon. */
function useGreeting() {
  const [hour, setHour] = useState(() => orgHour());
  useEffect(() => {
    setHour(orgHour());
    const id = window.setInterval(() => setHour(orgHour()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return greeting(hour);
}

/* The name on the account, not the name on a demo record. A school registers
   under the school's name, so the person to greet is the administrator who
   owns the login. */
function useFirstName() {
  const { profile } = useGlam();
  const actor = useActor();
  const source =
    profile?.firstName?.trim()
    || profile?.contactFirstName?.trim()
    || (profile?.role === 'school' ? '' : profile?.displayName?.trim())
    || actor.firstName?.trim()
    || actor.contactFirstName?.trim()
    || (actor.role === 'school' ? '' : actor.displayName?.trim())
    || '';
  return source.split(/\s+/)[0] || 'there';
}

function TeacherView() {
  const hello = useGreeting();
  const firstName = useFirstName();
  const actor = useActor();
  const { data, mySessions, today: TODAY } = useData();
  const mine = useMemo(
    () => mySessions.filter((s) => s.teacherId === actor.teacherId), [mySessions, actor.teacherId]);
  const teacher = data.teachers.find((t) => t.id === actor.teacherId);
  const today = onDate(mine);
  const week = inLastDays(mine, 7);
  const month = inMonth(mine);
  const attention = mine.filter(needsTeacherAction).slice(0, 3);
  const recent = [...mine].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const days = dailySeries(mine, 14);
  const maxDay = Math.max(1, ...days.map((d) => d.minutes));
  const bySchool = groupMinutes(month, (s) => s.schoolName, true);
  const maxSchool = Math.max(1, ...bySchool.map((b) => b.minutes));
  const myAssignments = data.assignments.filter((a) => a.teacherId === actor.teacherId && a.status === 'active');

  return (
    <>
      <PageHead
        title={`${hello}, ${firstName}`}
        sub={`Your teaching for ${dateFull(TODAY)}. Clock a period as soon as the period ends - it takes under a minute.`}
        actions={<Link href="/sessions/new" className="btn btn-primary">
          <PlusCircle size={16} aria-hidden="true" /> Clock Period
        </Link>}
      />

      <MyRequests />

      <KpiGrid cols={3} className="mb-6">
        <Kpi label="Today" value={hours(minutes(today))} sub={`${today.length} Period${today.length === 1 ? '' : 's'}`} accent icon={Clock} />
        <Kpi label="This week" value={hours(minutes(week))} sub="last 7 days" icon={CalendarCheck} />
        <Kpi label="This month" value={hours(minutes(month))} sub="all statuses" icon={BarChart3} />
        <Kpi label="Pending approval" value={String(mine.filter(isPending).length)} sub="waiting on schools" tone="warn" icon={Inbox} />
        <Kpi label="Approved" value={String(mine.filter((s) => s.status === 'approved').length)} sub={`${hoursLabel(approvedMinutes(mine))} confirmed`} tone="ok" icon={CheckCircle2} />
        <Kpi label="Assigned schools" value={String(myAssignments.length)} sub="you can submit to these" icon={Building2} />
      </KpiGrid>

      {attention.length ? (
        <section className="mb-6">
          <SectionHead title="Needs your attention" icon={FileWarning} />
          <div className="flex flex-col gap-2.5">
            {attention.map((s) => (
              <Frame key={s.id} className="flex flex-wrap items-center gap-4 justify-between"
                pad={false}>
                <div className="p-4 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="mono text-xs text-[var(--text-3)]">{s.id}</span>
                    <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                  </div>
                  <p className="mt-2 font-semibold">{s.subject} · {s.className} · {s.schoolName}</p>
                  <p className="mt-1 text-sm text-[var(--text-2)] max-w-[62ch]">
                    {s.rejectionReason || s.schoolComment}
                  </p>
                </div>
                <div className="p-4">
                  <Link href="/sessions" className="btn btn-ghost btn-sm">Correct and resubmit</Link>
                </div>
              </Frame>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <Frame>
          <SectionHead title="Teaching hours, last 14 days" icon={TrendingUp}
            right={<span className="mono text-xs">{hoursLabel(minutes(inLastDays(mine, 14)))}</span>} />
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

        <Frame>
          <SectionHead title="Approved hours by school, this month" icon={Building2} />
          {bySchool.length ? (
            <div className="flex flex-col gap-4 mt-1">
              {bySchool.map((b) => (
                <div key={b.key}>
                  <div className="flex items-baseline justify-between text-sm mb-1.5">
                    <span className="truncate pr-3">{b.key}</span>
                    <span className="mono text-xs text-[var(--text-2)]">{hoursLabel(b.minutes)}</span>
                  </div>
                  <div className="hbar"><div className="hbar-fill" style={{ width: `${(b.minutes / maxSchool) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Building2} title="No approved hours yet this month"
              text="Once a school confirms one of your sessions, its hours appear here." />
          )}
        </Frame>
      </div>

      <section>
        <SectionHead title="Recent sessions" icon={ClipboardCheck}
          right={<Link href="/sessions" className="underline underline-offset-2">See all</Link>} />
        <div className="flex flex-col gap-2.5">
          {recent.map((s) => <SessionCard key={s.id} s={s} />)}
        </div>
      </section>
    </>
  );
}

function SessionCard({ s }: { s: TeachingSession }) {
  return (
    <Frame>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="mono text-xs text-[var(--text-3)]">{s.id}</span>
            <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
          </div>
          <p className="mt-2 font-semibold">{s.subject} · {s.className}</p>
          <p className="text-sm text-[var(--text-2)]">{s.schoolName} · {s.topic}</p>
        </div>
        <div className="text-right">
          <p className="mono text-sm">{s.startTime}–{s.endTime}</p>
          <p className="text-xs text-[var(--text-3)]">{dateShort(s.date)} · {hoursLabel(s.durationMinutes)}</p>
        </div>
      </div>
      <div className="mt-4 pt-3.5 border-t" style={{ borderColor: 'var(--border)' }}>
        <LifecycleRail upto={railFor(s.status)} mini />
      </div>
    </Frame>
  );
}

/* ================= School ================= */

function SchoolView() {
  const hello = useGreeting();
  const firstName = useFirstName();
  const actor = useActor();
  const { data, mySessions, today: TODAY } = useData();
  const mine = useMemo(
    () => mySessions.filter((s) => s.schoolId === actor.schoolId), [mySessions, actor.schoolId]);
  const school = data.schools.find((s) => s.id === actor.schoolId);
  const today = onDate(mine);
  const queue = mine.filter(isPending).sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  const activeToday = new Set(today.map((s) => s.teacherId)).size;
  const bySubject = groupMinutes(inMonth(mine), (s) => s.subject, true).slice(0, 6);
  const maxSubject = Math.max(1, ...bySubject.map((b) => b.minutes));

  const teacherActivity = data.teachers
    .map((t) => {
      const list = mine.filter((s) => s.teacherId === t.id);
      return {
        t,
        today: minutes(list.filter((s) => s.date === TODAY)),
        week: minutes(inLastDays(list, 7)),
        month: minutes(inLastDays(list, 30))
      };
    })
    .filter((r) => r.month > 0)
    .sort((a, b) => b.month - a.month);

  return (
    <>
      <PageHead
        title={`${hello}, ${firstName}`}
        sub="Confirm what was delivered. Approving a session makes it an official record; rejecting one always needs a reason."
        actions={<Link href="/approvals" className="btn btn-primary">
          <ClipboardCheck size={16} aria-hidden="true" /> Review queue ({queue.length})
        </Link>}
      />

      <AssignmentQueue />

      <KpiGrid cols={3} className="mb-6">
        <Kpi label="Awaiting your approval" value={String(queue.length)} sub="oldest first" tone="warn" icon={Inbox} />
        <Kpi label="Teachers in today" value={String(activeToday)} sub={`${today.length} sessions submitted`} icon={GraduationCap} />
        <Kpi label="Hours today" value={hours(minutes(today))} sub="all statuses" icon={Clock} />
        <Kpi label="This week" value={hours(minutes(inLastDays(mine, 7)))} sub="last 7 days" icon={CalendarCheck} />
        <Kpi label="Approved this month" value={hours(approvedMinutes(inMonth(mine)))} sub={`of ${school?.contractedHours ?? 0} contracted`} tone="ok" icon={CheckCircle2} />
        <Kpi label="Approval rate" value={pct(approvalRate(mine))} sub="of sessions you reviewed" tone="info" icon={BarChart3} />
      </KpiGrid>

      <section className="mb-6">
        <SectionHead title="Pending approval" icon={ClipboardCheck}
          right={<Link href="/approvals" className="underline underline-offset-2">Open queue</Link>} />
        {queue.length ? (
          <TableWrap head={['Session', 'Teacher', 'Subject / class', 'Date', 'Duration', 'Submitted']} minWidth={780}>
            {queue.slice(0, 6).map((s) => (
              <tr key={s.id}>
                <td className="mono text-xs">{s.id}</td>
                <td className="text-right">{s.teacherName}</td>
                <td className="text-right">{s.subject} · {s.className}</td>
                <td className="num">{dateShort(s.date)}</td>
                <td className="num">{hoursLabel(s.durationMinutes)}</td>
                <td className="num">{s.submittedAt ? ago(s.submittedAt, new Date(TODAY + 'T15:00:00')) : '—'}</td>
              </tr>
            ))}
          </TableWrap>
        ) : (
          <EmptyState icon={CheckCircle2} title="Nothing waiting on you"
            text="Every session submitted to this school has been reviewed. New submissions appear here as teachers send them." />
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <Frame>
          <SectionHead title="Teacher activity" icon={Users} />
          <TableWrap head={['Teacher', 'Today', '7 days', '30 days']} minWidth={420}>
            {teacherActivity.map((r) => (
              <tr key={r.t.id}>
                <td>
                  <span className="block font-medium">{r.t.name}</span>
                  <span className="mono text-xs text-[var(--text-3)]">{r.t.id}</span>
                </td>
                <td className="num">{hours(r.today)}</td>
                <td className="num">{hours(r.week)}</td>
                <td className="num">{hours(r.month)}</td>
              </tr>
            ))}
          </TableWrap>
        </Frame>

        <Frame>
          <SectionHead title="Approved hours by subject, this month" icon={BarChart3} />
          <div className="flex flex-col gap-4 mt-1">
            {bySubject.map((b) => (
              <div key={b.key}>
                <div className="flex items-baseline justify-between text-sm mb-1.5">
                  <span className="truncate pr-3">{b.key}</span>
                  <span className="mono text-xs text-[var(--text-2)]">{hoursLabel(b.minutes)}</span>
                </div>
                <div className="hbar"><div className="hbar-fill" style={{ width: `${(b.minutes / maxSubject) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Frame>
      </div>
    </>
  );
}

/* ================= Administrator ================= */

function AdminView() {
  const hello = useGreeting();
  const firstName = useFirstName();
  const { data, mySessions, today: TODAY } = useData();
  const all = mySessions;
  const month = inMonth(all);
  const bySchool = groupMinutes(month, (s) => s.schoolName, true);
  const byTeacher = groupMinutes(month, (s) => s.teacherName, true).slice(0, 6);
  const maxSchool = Math.max(1, ...bySchool.map((b) => b.minutes));
  const maxTeacher = Math.max(1, ...byTeacher.map((b) => b.minutes));
  const feed = [...all]
    .filter((s) => s.submittedAt)
    .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
    .slice(0, 7);

  return (
    <>
      <PageHead
        title={`${hello}, ${firstName}`}
        sub="Exceptions first. Everything below is drawn from approved teaching records across every school."
        actions={<Link href="/financials" className="btn btn-primary">
          <BarChart3 size={16} aria-hidden="true" /> Financial overview
        </Link>}
      />

      <SignupQueue />
      <AssignmentQueue />
      <ClosureQueue />

      <KpiGrid cols={4} className="mb-6">
        <Kpi label="Active schools" value={String(data.schools.filter((s) => s.status === 'active').length)} icon={Building2} />
        <Kpi label="Active teachers" value={String(data.teachers.filter((t) => t.status === 'active').length)} icon={GraduationCap} />
        <Kpi label="Approved this month" value={hours(approvedMinutes(month))} sub="across all schools" tone="ok" icon={CheckCircle2} />
        <Kpi label="Approval rate" value={pct(approvalRate(all))} sub="across all schools" tone="info" icon={BarChart3} />
      </KpiGrid>

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <Frame>
          <SectionHead title="Approved hours by school, this month" icon={Building2} />
          <div className="flex flex-col gap-4 mt-1">
            {bySchool.map((b) => (
              <div key={b.key}>
                <div className="flex items-baseline justify-between text-sm mb-1.5">
                  <span className="truncate pr-3">{b.key}</span>
                  <span className="mono text-xs text-[var(--text-2)]">{hoursLabel(b.minutes)}</span>
                </div>
                <div className="hbar"><div className="hbar-fill" style={{ width: `${(b.minutes / maxSchool) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Frame>

        <Frame>
          <SectionHead title="Top teachers by approved hours" icon={GraduationCap} />
          <div className="flex flex-col gap-4 mt-1">
            {byTeacher.map((b) => (
              <div key={b.key}>
                <div className="flex items-baseline justify-between text-sm mb-1.5">
                  <span className="truncate pr-3">{b.key}</span>
                  <span className="mono text-xs text-[var(--text-2)]">{hoursLabel(b.minutes)}</span>
                </div>
                <div className="hbar"><div className="hbar-fill is-ink" style={{ width: `${(b.minutes / maxTeacher) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Frame>
      </div>

      <section>
        <SectionHead title="Latest submissions" icon={ClipboardCheck}
          right={<Link href="/sessions" className="underline underline-offset-2">See all</Link>} />
        <TableWrap head={['Session', 'Teacher', 'School', 'Subject', 'Duration', 'Status']} minWidth={820}>
          {feed.map((s) => (
            <tr key={s.id}>
              <td className="mono text-xs">{s.id}</td>
              <td className="text-right">{s.teacherName}</td>
              <td className="text-right">{s.schoolName}</td>
              <td className="text-right">{s.subject}</td>
              <td className="num">{hoursLabel(s.durationMinutes)}</td>
              <td className="text-right"><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge></td>
            </tr>
          ))}
        </TableWrap>
      </section>
    </>
  );
}

/* ---------- Live registration queue ----------

   Real accounts, not demo records: these are users/{uid} documents written by
   registration, so a teacher who signed up ten seconds ago is in this list. It
   renders nothing at all when the queue is empty, because an empty queue is
   not news. */

function WhoRow({ u, children }: { u: UserProfile; children: React.ReactNode }) {
  return (
    <tr>
      <td>
        <div className="font-semibold">{u.displayName || u.email}</div>
        <div className="text-xs text-[var(--text-2)]">{u.email}</div>
      </td>
      <td><Badge tone={u.role === 'school' ? 'info' : 'mute'}>
        {u.role === 'school' ? 'School' : u.role === 'admin' ? 'Administrator' : 'Teacher'}
      </Badge></td>
      <td className="text-sm text-[var(--text-2)]">{u.phone || '—'}</td>
      <td className="text-sm text-[var(--text-2)]">
        {u.createdAt ? dateShort(u.createdAt.slice(0, 10)) : '—'}
      </td>
      <td>{children}</td>
    </tr>
  );
}

function SignupQueue() {
  const { pendingSignups, decideRegistration } = useData();
  if (!pendingSignups.length) return null;

  return (
    <section className="mb-6">
      <SectionHead title="Registrations awaiting approval" icon={UserPlus}
        right={`${pendingSignups.length} waiting`} />
      <TableWrap minWidth={760} head={['Who', 'Type', 'Phone', 'Registered', 'Decision']}>
        {pendingSignups.map((u) => (
          <WhoRow key={u.uid} u={u}>
            <div className="flex flex-wrap gap-1.5">
              <button className="btn btn-ghost btn-sm"
                onClick={() => void decideRegistration(u.uid, true)}>
                <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" /> Approve
              </button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--bad)' }}
                onClick={() => void decideRegistration(u.uid, false)}>
                <X size={14} strokeWidth={2} aria-hidden="true" /> Reject
              </button>
            </div>
          </WhoRow>
        ))}
      </TableWrap>
    </section>
  );
}

/* ---------- BR-025: closures, which only a super admin may answer ---------- */

function ClosureQueue() {
  const { deleteRequests, decideDeletion, isSuperAdmin } = useData();
  if (!deleteRequests.length) return null;

  return (
    <section className="mb-6">
      <SectionHead title="Account closures requested" icon={AlertTriangle}
        right={isSuperAdmin ? `${deleteRequests.length} to decide` : 'super admins decide these'} />
      <TableWrap minWidth={760} head={['Who', 'Type', 'Phone', 'Asked', 'Decision']}>
        {deleteRequests.map((u) => (
          <WhoRow key={u.uid} u={u}>
            <div>
              {u.deleteRequestReason ? (
                <p className="text-xs text-[var(--text-2)] mb-1.5 max-w-[32ch]">{u.deleteRequestReason}</p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                <button className="btn btn-ghost btn-sm" disabled={!isSuperAdmin}
                  title={isSuperAdmin ? 'Approve closure' : 'Only a super admin can decide this'}
                  style={isSuperAdmin ? { color: 'var(--bad)' } : undefined}
                  onClick={() => void decideDeletion(u.uid, true)}>
                  <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" /> Approve closure
                </button>
                <button className="btn btn-ghost btn-sm" disabled={!isSuperAdmin}
                  title={isSuperAdmin ? 'Decline' : 'Only a super admin can decide this'}
                  onClick={() => void decideDeletion(u.uid, false)}>
                  <X size={14} strokeWidth={2} aria-hidden="true" /> Decline
                </button>
              </div>
            </div>
          </WhoRow>
        ))}
      </TableWrap>
    </section>
  );
}


/* ---------- BR-027, from the teacher's side ----------

   The same two keys the school and the firm see, so a teacher can tell which
   half of the decision is outstanding rather than just "pending". */

function MyRequests() {
  const actor = useActor();
  const { data, awaiting } = useData();

  const mine = data.assignments.filter(
    (a) => a.teacherId === actor.teacherId && a.status === 'requested');
  if (!mine.length) return null;

  return (
    <section className="mb-6">
      <SectionHead title="Your requests to teach" icon={Clock}
        right={`${mine.length} awaiting a decision`} />
      <TableWrap minWidth={720} head={['School', 'Covers', 'Requested', 'Approvals']}>
        {mine.map((a) => {
          const school = data.schools.find((s) => s.id === a.schoolId);
          return (
            <tr key={a.id}>
              <td className="font-semibold">{school?.name ?? a.schoolId}</td>
              <td className="text-sm text-[var(--text-2)]">
                {a.subjects.join(', ') || 'Any subject'} · {a.classes.join(', ') || 'any class'}
              </td>
              <td className="text-sm text-[var(--text-2)]">
                {a.createdAt ? dateShort(a.createdAt.slice(0, 10)) : '—'}
              </td>
              <td>
                <ApprovalPair school={a.schoolApprovedAt} admin={a.adminApprovedAt} />
                <div className="text-xs text-[var(--text-3)] mt-1">{awaiting(a)}</div>
              </td>
            </tr>
          );
        })}
      </TableWrap>
    </section>
  );
}
