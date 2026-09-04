/* Teach Clock — derived figures.
   Every number the interface shows resolves through this file. Nothing is
   hard-coded in JSX, which is why the dashboard and the report reconcile.

   The distinction that matters commercially: only APPROVED hours are validated
   service delivery. Submitted, pending and rejected hours are tracked but never
   counted as delivered, and never billed. */

import { TODAY, shiftDays } from './demo';
import type { LifecycleState, School, SessionStatus, Teacher, TeachingSession } from './types';

export const LIFECYCLE: { key: LifecycleState; label: string }[] = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'taught', label: 'Taught' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'verified', label: 'Verified' },
  { key: 'approved', label: 'Approved' },
  { key: 'reported', label: 'Reported' },
  { key: 'billed', label: 'Billed' }
];

/** How far along the rail a session sits, 0–8. */
export function lifecycleIndex(status: SessionStatus): number {
  switch (status) {
    case 'cancelled': return 0;
    case 'draft': return 3;
    case 'submitted':
    case 'resubmitted': return 4;
    case 'pending': return 4;
    case 'correction': return 4;
    case 'rejected': return 4;
    case 'approved': return 6;
    default: return 3;
  }
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  correction: 'Correction requested',
  resubmitted: 'Resubmitted',
  cancelled: 'Cancelled'
};

export const STATUS_TONE: Record<SessionStatus, 'ok' | 'warn' | 'bad' | 'info' | 'mute'> = {
  draft: 'mute',
  submitted: 'info',
  pending: 'warn',
  approved: 'ok',
  rejected: 'bad',
  correction: 'bad',
  resubmitted: 'info',
  cancelled: 'mute'
};

export const isApproved = (s: TeachingSession) => s.status === 'approved';
export const isPending = (s: TeachingSession) => s.status === 'pending' || s.status === 'submitted' || s.status === 'resubmitted';
export const needsTeacherAction = (s: TeachingSession) => s.status === 'rejected' || s.status === 'correction';

export const minutes = (list: TeachingSession[]) => list.reduce((a, s) => a + s.durationMinutes, 0);
export const approvedMinutes = (list: TeachingSession[]) => minutes(list.filter(isApproved));
export const pendingMinutes = (list: TeachingSession[]) => minutes(list.filter(isPending));
export const rejectedMinutes = (list: TeachingSession[]) => minutes(list.filter((s) => s.status === 'rejected'));

/* ---------- Date windows, all measured against the fixed anchor ---------- */
export const onDate = (list: TeachingSession[], date = TODAY) => list.filter((s) => s.date === date);

export function inLastDays(list: TeachingSession[], days: number, end = TODAY) {
  const from = shiftDays(end, -(days - 1));
  return list.filter((s) => s.date >= from && s.date <= end);
}

export function inMonth(list: TeachingSession[], ym = TODAY.slice(0, 7)) {
  return list.filter((s) => s.date.startsWith(ym));
}

export type RangeKey = 'today' | 'week' | 'month' | 'lastMonth' | 'cycle' | 'all';

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  lastMonth: 'Last month',
  cycle: 'Billing cycle (25th–24th)',
  all: 'All time'
};

export function applyRange(list: TeachingSession[], range: RangeKey): TeachingSession[] {
  switch (range) {
    case 'today': return onDate(list);
    case 'week': return inLastDays(list, 7);
    case 'month': return inMonth(list);
    case 'lastMonth': {
      const d = new Date(TODAY + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - 1);
      return inMonth(list, d.toISOString().slice(0, 7));
    }
    case 'cycle': {
      /* Contracts here do not align to calendar months — the firm bills 25th to
         24th, so the report has to be able to as well. */
      const end = TODAY;
      const d = new Date(TODAY + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - 1);
      const start = `${d.toISOString().slice(0, 8)}25`;
      return list.filter((s) => s.date >= start && s.date <= end);
    }
    default: return list;
  }
}

/* ---------- Rates ---------- */
export function approvalRate(list: TeachingSession[]): number {
  const reviewed = list.filter((s) => s.status === 'approved' || s.status === 'rejected');
  if (!reviewed.length) return 0;
  return (reviewed.filter(isApproved).length / reviewed.length) * 100;
}

/** Sessions sitting in a school's queue for longer than the SLA the firm cares about. */
export function stalePending(list: TeachingSession[], overHours = 48): TeachingSession[] {
  const cutoff = new Date(TODAY + 'T09:00:00Z').getTime() - overHours * 3600_000;
  return list.filter((s) => isPending(s) && s.submittedAt && new Date(s.submittedAt).getTime() < cutoff);
}

/* ---------- Grouping ---------- */
export function groupMinutes<T extends string>(
  list: TeachingSession[], key: (s: TeachingSession) => T, approvedOnly = false
): { key: T; minutes: number; count: number }[] {
  const map = new Map<T, { minutes: number; count: number }>();
  for (const s of list) {
    if (approvedOnly && !isApproved(s)) continue;
    const k = key(s);
    const cur = map.get(k) || { minutes: 0, count: 0 };
    cur.minutes += s.durationMinutes;
    cur.count += 1;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([k, v]) => ({ key: k, ...v }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** Hours per day for a bar chart, oldest first, gaps filled with zero. */
export function dailySeries(list: TeachingSession[], days: number, end = TODAY) {
  const out: { date: string; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDays(end, -i);
    out.push({ date, minutes: minutes(list.filter((s) => s.date === date)) });
  }
  return out;
}

/** Approved hours and value by calendar month, oldest first. */
export function monthlySeries(list: TeachingSession[], schools: School[]) {
  const map = new Map<string, { minutes: number; value: number }>();
  for (const s of list) {
    if (!isApproved(s)) continue;
    const ym = s.date.slice(0, 7);
    const rate = schools.find((x) => x.id === s.schoolId)?.hourlyRate ?? 0;
    const cur = map.get(ym) || { minutes: 0, value: 0 };
    cur.minutes += s.durationMinutes;
    cur.value += (s.durationMinutes / 60) * rate;
    map.set(ym, cur);
  }
  return [...map.entries()].map(([ym, v]) => ({ ym, ...v })).sort((a, b) => a.ym.localeCompare(b.ym));
}

/* ---------- Money ---------- */
export type SchoolRow = {
  school: School;
  approvedMinutes: number;
  pendingMinutes: number;
  billable: number;
  approvalRate: number;
  sessions: number;
};

export function schoolRows(list: TeachingSession[], schools: School[]): SchoolRow[] {
  return schools
    .map((school) => {
      const mine = list.filter((s) => s.schoolId === school.id);
      const appr = approvedMinutes(mine);
      return {
        school,
        approvedMinutes: appr,
        pendingMinutes: pendingMinutes(mine),
        billable: (appr / 60) * school.hourlyRate,
        approvalRate: approvalRate(mine),
        sessions: mine.length
      };
    })
    .filter((r) => r.sessions > 0)
    .sort((a, b) => b.billable - a.billable);
}

export type TeacherRow = {
  teacher: Teacher;
  approvedMinutes: number;
  pendingMinutes: number;
  payable: number;
  schools: number;
  approvalRate: number;
};

export function teacherRows(list: TeachingSession[], teachers: Teacher[]): TeacherRow[] {
  return teachers
    .map((teacher) => {
      const mine = list.filter((s) => s.teacherId === teacher.id);
      const appr = approvedMinutes(mine);
      return {
        teacher,
        approvedMinutes: appr,
        pendingMinutes: pendingMinutes(mine),
        payable: (appr / 60) * teacher.hourlyRate,
        schools: new Set(mine.map((s) => s.schoolId)).size,
        approvalRate: approvalRate(mine)
      };
    })
    .filter((r) => r.approvedMinutes > 0 || r.pendingMinutes > 0)
    .sort((a, b) => b.payable - a.payable);
}

/** Contracted vs delivered, per school, for the current month. */
export function utilisation(list: TeachingSession[], schools: School[]) {
  const month = inMonth(list);
  return schools.map((school) => {
    const mine = month.filter((s) => s.schoolId === school.id);
    const approvedH = approvedMinutes(mine) / 60;
    const deliveredH = minutes(mine) / 60;
    return {
      school,
      contracted: school.contractedHours,
      delivered: deliveredH,
      approved: approvedH,
      remaining: Math.max(0, school.contractedHours - approvedH),
      overrun: Math.max(0, approvedH - school.contractedHours)
    };
  });
}
