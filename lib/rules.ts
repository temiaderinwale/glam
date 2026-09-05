/* Teach Clock — business rules.

   Pure functions, no I/O. Everything here is enforced again in the data layer
   before a write, and again in firestore.rules on the server, because an
   interface that only *looks* correct is not accountability. The BR numbers
   refer to the SRS.

   The rule that matters commercially: only APPROVED hours are validated service
   delivery. Nothing else is ever billed or paid. */

import type {
  AdminAccount,
  Assignment, OrgSettings, Role, SessionFlag, SessionStatus, TeachingSession, UserProfile
} from './types';

/* ---------- time ---------- */

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function durationOf(start: string, end: string): number {
  return toMinutes(end) - toMinutes(start);
}

/** BR-015: duration is always derived, never typed. */
export function periodsOf(minutes: number, periodMinutes: number): number {
  return Math.max(1, Math.round(minutes / Math.max(1, periodMinutes)));
}

export const overlaps = (aS: string, aE: string, bS: string, bE: string) =>
  toMinutes(aS) < toMinutes(bE) && toMinutes(bS) < toMinutes(aE);

/* ---------- who may do what ---------- */

/** BR-002: a teacher may only submit to a school they are actively assigned to. */
export function activeAssignment(
  assignments: Assignment[], teacherId: string, schoolId: string, onDate: string
): Assignment | undefined {
  return assignments.find((a) =>
    a.teacherId === teacherId && a.schoolId === schoolId && a.status === 'active' &&
    a.startDate <= onDate && (!a.endDate || a.endDate >= onDate));
}

/* ---------- BR-020…BR-024: administration of administrators ----------

   One grade governs the other. A super admin decides who may administer the
   platform at all; a standard admin runs the firm's day-to-day but has no say
   over accounts. Two guards keep that from collapsing into a coup:

     BR-023  a super admin can never freeze, deactivate or reject whoever
             promoted them. Promotion is not a weapon you turn on its source.
     BR-024  the founder — the first administrator ever registered — is immune
             to freeze and deactivate from everyone. Without this, a chain of
             promotions can end with the platform locked out of itself.

   Both are enforced here, and the same function backs the button's disabled
   state and the write, so the interface can never offer what the rule refuses. */

export type AdminAction = 'approve' | 'suspend' | 'deactivate' | 'reactivate' | 'promote';

/** BR-020: only an active super admin administers other administrators. */
export function canManageAdmins(actor: AdminAccount | null): boolean {
  return !!actor && actor.level === 'super' && actor.status === 'active';
}

/** The reason an action is refused, or null when it is allowed. */
export function adminActionIssue(
  actor: AdminAccount | null, target: AdminAccount, action: AdminAction
): string | null {
  if (!canManageAdmins(actor)) return 'Only an active super admin can manage administrators.';
  const me = actor as AdminAccount;

  // BR-021: nobody administers their own account.
  if (me.id === target.id) return 'You cannot change your own account.';

  const removes = action === 'suspend' || action === 'deactivate';

  // BR-024: the founder is never frozen or deactivated.
  if (removes && target.founder) {
    return 'The founding super admin cannot be frozen or deactivated.';
  }

  // BR-023: never act against the super admin who promoted you.
  if (removes && me.promotedBy && me.promotedBy === target.id) {
    return `${target.name} promoted you to super admin, so you cannot freeze or deactivate them.`;
  }

  switch (action) {
    case 'approve':
      if (target.status !== 'pending') return 'Only a pending administrator can be approved.';
      return null;
    case 'suspend':
      if (target.status !== 'active') return 'Only an active administrator can be frozen.';
      return null;
    case 'deactivate':
      if (target.status === 'rejected') return 'That administrator is already deactivated.';
      return null;
    case 'reactivate':
      if (target.status === 'active') return 'That administrator is already active.';
      return null;
    case 'promote':
      if (target.level === 'super') return `${target.name} is already a super admin.`;
      if (target.status !== 'active') return 'Approve the administrator before promoting them.';
      return null;
    default:
      return 'Unknown action.';
  }
}

export const canAdminAct = (
  actor: AdminAccount | null, target: AdminAccount, action: AdminAction
) => adminActionIssue(actor, target, action) === null;

/* ---------- BR-027 / BR-028: two keys, not one ----------

   A teacher joining a school, and a period they then teach, are each two
   decisions: the school confirms what happened in its building, and the firm
   accepts it as billable service. Neither side can complete the record alone,
   and the same shape is used for both so there is one thing to learn. */

export type TwoKey = {
  schoolApprovedAt?: string;
  adminApprovedAt?: string;
};

/** Which side this account signs. */
export const approvalSide = (role: Role): 'school' | 'admin' | null =>
  role === 'school' ? 'school' : role === 'admin' ? 'admin' : null;

export const schoolSigned = (r: TwoKey) => Boolean(r.schoolApprovedAt);
export const adminSigned = (r: TwoKey) => Boolean(r.adminApprovedAt);
export const fullySigned = (r: TwoKey) => schoolSigned(r) && adminSigned(r);

/** What is still outstanding, said the way a person would say it. */
export function awaitingFrom(r: TwoKey): string {
  if (fullySigned(r)) return '';
  if (!schoolSigned(r) && !adminSigned(r)) return 'Waiting on the school and Glampter';
  /* One key in. Naming the half that is already done is the difference between
     "pending" and knowing who is actually being waited on. */
  if (!schoolSigned(r)) return 'Glampter has approved - waiting on the school';
  return 'The school has approved - waiting on Glampter';
}

/** BR-009 / BR-011: a school only ever touches its own records. */
export function canReview(user: UserProfile, s: TeachingSession): boolean {
  if (user.role === 'admin') return true;
  // BR-010: a teacher can never approve their own session
  if (user.role === 'teacher') return false;
  return user.role === 'school' && user.schoolId === s.schoolId;
}

/** BR-005: an approved session is closed to ordinary editing. */
export function canEdit(user: UserProfile, s: TeachingSession): boolean {
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher' || user.teacherId !== s.teacherId) return false;
  return s.status === 'draft' || s.status === 'rejected' || s.status === 'correction';
}

export function visibleSessions(user: UserProfile, all: TeachingSession[]): TeachingSession[] {
  if (user.role === 'admin') return all;
  if (user.role === 'school') return all.filter((s) => s.schoolId === user.schoolId);
  return all.filter((s) => s.teacherId === user.teacherId);
}

/* ---------- validation ---------- */

export type Issue = { field: string; message: string };

export type SessionDraft = {
  teacherId: string; schoolId: string; subject: string; className: string;
  date: string; startTime: string; endTime: string; topic: string;
  teachingType: TeachingSession['teachingType']; teacherComment?: string;
};

export function validateSession(
  d: SessionDraft, ctx: { assignments: Assignment[]; settings: OrgSettings; today: string }
): Issue[] {
  const out: Issue[] = [];
  if (!d.schoolId) out.push({ field: 'schoolId', message: 'Choose the school you taught at.' });
  if (!d.subject) out.push({ field: 'subject', message: 'Choose the subject.' });
  if (!d.className) out.push({ field: 'className', message: 'Choose the class.' });
  if (!d.date) out.push({ field: 'date', message: 'Enter the date you taught.' });
  if (!d.topic.trim()) out.push({ field: 'topic', message: 'Say what the class covered.' });

  if (d.date > ctx.today) {
    out.push({ field: 'date', message: 'You cannot log a session for a future date.' });
  }
  if (d.startTime && d.endTime) {
    const mins = durationOf(d.startTime, d.endTime);
    if (mins <= 0) out.push({ field: 'endTime', message: 'The end time must come after the start time.' });
    else if (mins > ctx.settings.maxDailyHours * 60) {
      out.push({ field: 'endTime', message: `That is longer than a ${ctx.settings.maxDailyHours}-hour teaching day.` });
    }
  }
  // BR-002
  if (d.schoolId && d.date) {
    const asn = activeAssignment(ctx.assignments, d.teacherId, d.schoolId, d.date);
    if (!asn) {
      out.push({ field: 'schoolId', message: 'You are not assigned to that school on that date. Request access first.' });
    } else {
      if (d.subject && asn.subjects.length && !asn.subjects.includes(d.subject)) {
        out.push({ field: 'subject', message: 'Your assignment there does not cover that subject.' });
      }
      if (d.className && asn.classes.length && !asn.classes.includes(d.className)) {
        out.push({ field: 'className', message: 'Your assignment there does not cover that class.' });
      }
    }
  }
  return out;
}

/* ---------- BR-013: duplicate and overlap detection ----------
   Suspicious records are flagged for review, not silently rejected — a real
   double period and a double entry look identical to a validator. */

export function detectFlags(
  d: SessionDraft, existing: TeachingSession[], settings: OrgSettings, now: string
): SessionFlag[] {
  const flags: SessionFlag[] = [];
  const sameDay = existing.filter(
    (s) => s.teacherId === d.teacherId && s.date === d.date && s.status !== 'cancelled'
  );

  const dup = sameDay.find(
    (s) => s.schoolId === d.schoolId && s.startTime === d.startTime && s.endTime === d.endTime
  );
  if (dup) flags.push({ kind: 'duplicate', detail: `Matches ${dup.id} exactly — same school, date and times.` });

  const clash = sameDay.find(
    (s) => !dup || s.id !== dup.id
      ? overlaps(d.startTime, d.endTime, s.startTime, s.endTime) : false
  );
  if (clash) flags.push({ kind: 'overlap', detail: `Overlaps ${clash.id} (${clash.startTime}–${clash.endTime}).` });

  const dayMinutes = sameDay.reduce((a, s) => a + s.durationMinutes, 0) + durationOf(d.startTime, d.endTime);
  if (dayMinutes > settings.maxDailyHours * 60) {
    flags.push({ kind: 'long-day', detail: `${(dayMinutes / 60).toFixed(1)} hours logged for this day.` });
  }
  if (d.startTime < settings.schoolOpen || d.endTime > settings.schoolClose) {
    flags.push({ kind: 'outside-hours', detail: `Outside school hours (${settings.schoolOpen}–${settings.schoolClose}).` });
  }
  const days = Math.round(
    (new Date(now + 'T00:00:00Z').getTime() - new Date(d.date + 'T00:00:00Z').getTime()) / 86400000);
  if (days > settings.lateSubmissionDays) {
    flags.push({ kind: 'late-submission', detail: `Submitted ${days} days after the class.` });
  }
  return flags;
}

/* ---------- status transitions ---------- */

const ALLOWED: Record<SessionStatus, SessionStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['pending', 'approved', 'rejected', 'correction', 'cancelled'],
  pending: ['approved', 'rejected', 'correction', 'cancelled'],
  resubmitted: ['approved', 'rejected', 'correction', 'cancelled'],
  correction: ['resubmitted', 'cancelled'],
  rejected: ['resubmitted', 'cancelled'],
  approved: ['cancelled'],          // BR-006: only via an authorised correction
  cancelled: []
};

export const canTransition = (from: SessionStatus, to: SessionStatus) =>
  ALLOWED[from]?.includes(to) ?? false;

/** BR-004: a submitted session is never deleted, only cancelled with a reason. */
export const isDeletable = (s: TeachingSession) => s.status === 'draft';

export function requiresReason(to: SessionStatus): boolean {
  return to === 'rejected' || to === 'correction' || to === 'cancelled';
}

/* ---------- role helpers ---------- */

export const roleLabel: Record<Role, string> = {
  teacher: 'Teacher', school: 'School', admin: 'Administrator'
};

export const DEFAULT_SETTINGS: OrgSettings = {
  orgName: 'Glampter Consults',
  tagline: 'Bringing Answers To You',
  email: 'glampterconsults@gmail.com',
  phone: '0903 046 2106',
  address: 'Glampter Office, Apena Bankole Plaza, Iporo-Ake, Abeokuta, Ogun State',
  timezone: 'Africa/Lagos',
  currency: 'NGN',
  periodMinutes: 45,
  approvalSlaHours: 48,
  maxDailyHours: 8,
  schoolOpen: '07:00',
  schoolClose: '18:00',
  lateSubmissionDays: 7,
  requireEvidence: false,
  allowTeacherRequests: true
};
