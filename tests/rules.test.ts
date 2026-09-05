/* Teach Clock — business rule verification.

   Run with `npm test`. These assertions are the SRS business rules stated as
   code: if one of them fails, the platform is no longer accountable, whatever
   the interface looks like. */

import {
  activeAssignment, adminActionIssue, canAdminAct, canEdit, canManageAdmins, canReview,
  canTransition, detectFlags, durationOf, periodsOf, validateSession, visibleSessions,
  DEFAULT_SETTINGS
} from '../lib/rules';
import { adminSigned, awaitingFrom, fullySigned, schoolSigned } from '../lib/rules';
import { COLLECTION_KEYS, planFor, type RepoScope } from '../lib/repo';
import type { AdminAccount, Assignment, TeachingSession, UserProfile } from '../lib/types';

const today = '2026-08-25';
const asn: Assignment[] = [{
  id: 'ASN-1', teacherId: 'TCH-1', schoolId: 'SCH-1', subjects: ['Physics'], classes: ['SS2'],
  startDate: '2026-01-01', assignedBy: 'admin', origin: 'admin', status: 'active', createdAt: ''
}];
const base = {
  teacherId: 'TCH-1', schoolId: 'SCH-1', subject: 'Physics', className: 'SS2',
  date: today, startTime: '09:00', endTime: '12:00', topic: 'Motion',
  teachingType: 'regular' as const
};
const ctx = { assignments: asn, settings: DEFAULT_SETTINGS, today };
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

ok('duration is derived from the times', durationOf('09:00', '12:00') === 180);
ok('periods computed from settings', periodsOf(180, 45) === 4);
ok('valid session passes', validateSession(base, ctx).length === 0);
ok('BR-002 blocks an unassigned school',
   validateSession({ ...base, schoolId: 'SCH-9' }, ctx).some((i) => i.field === 'schoolId'));
ok('BR-002 blocks a subject outside the assignment',
   validateSession({ ...base, subject: 'Biology' }, ctx).some((i) => i.field === 'subject'));
ok('future dates rejected',
   validateSession({ ...base, date: '2026-09-01' }, ctx).some((i) => i.field === 'date'));
ok('end before start rejected',
   validateSession({ ...base, startTime: '12:00', endTime: '09:00' }, ctx).some((i) => i.field === 'endTime'));

const existing: TeachingSession[] = [{
  id: 'TS-1', teacherId: 'TCH-1', teacherName: 'T', schoolId: 'SCH-1', schoolName: 'S',
  subject: 'Physics', className: 'SS2', date: today, startTime: '09:00', endTime: '12:00',
  durationMinutes: 180, periods: 4, topic: 'x', teachingType: 'regular', status: 'pending',
  createdAt: '', updatedAt: ''
}];
ok('BR-013 detects an exact duplicate',
   detectFlags(base, existing, DEFAULT_SETTINGS, today).some((f) => f.kind === 'duplicate'));
ok('BR-013 detects an overlap',
   detectFlags({ ...base, startTime: '10:00', endTime: '13:00' }, existing, DEFAULT_SETTINGS, today)
     .some((f) => f.kind === 'overlap'));
ok('BR-013 flags an over-long day',
   detectFlags({ ...base, startTime: '06:00', endTime: '17:00' }, existing, DEFAULT_SETTINGS, today)
     .some((f) => f.kind === 'long-day'));

const teacher: UserProfile = { uid: 'u1', role: 'teacher', status: 'active', orgId: 'o',
  teacherId: 'TCH-1', displayName: 'T', email: '', phone: '', createdAt: '' };
const school: UserProfile = { ...teacher, uid: 'u2', role: 'school', teacherId: undefined, schoolId: 'SCH-1' };
const other: UserProfile = { ...school, uid: 'u3', schoolId: 'SCH-9' };
const admin: UserProfile = { ...teacher, uid: 'u4', role: 'admin', teacherId: undefined };
const approved: TeachingSession = { ...existing[0], status: 'approved' };

ok('BR-010 a teacher cannot review their own session', canReview(teacher, existing[0]) === false);
ok('BR-009 the owning school can review', canReview(school, existing[0]) === true);
ok('BR-011 another school cannot review', canReview(other, existing[0]) === false);
ok('BR-012 the administrator can review', canReview(admin, existing[0]) === true);
ok('BR-005 an approved session is not ordinarily editable', canEdit(teacher, approved) === false);
ok('a rejected session is editable by its teacher',
   canEdit(teacher, { ...existing[0], status: 'rejected' }) === true);
ok('BR-011 scoping hides another school\'s records',
   visibleSessions(other, existing).length === 0 && visibleSessions(school, existing).length === 1);
ok('transition pending → approved allowed', canTransition('pending', 'approved') === true);
ok('transition approved → pending refused', canTransition('approved', 'pending') === false);
ok('transition rejected → resubmitted allowed', canTransition('rejected', 'resubmitted') === true);

/* ---------- BR-020…BR-024: administering administrators ---------- */

const mk = (over: Partial<AdminAccount> & { id: string }): AdminAccount => ({
  name: over.id, email: `${over.id}@glampter.ng`, phone: '0800',
  level: 'standard', status: 'active', createdAt: '', ...over
});

const founder   = mk({ id: 'A-founder', level: 'super', founder: true });
const promoted  = mk({ id: 'A-promoted', level: 'super', promotedBy: 'A-founder' });
const sibling   = mk({ id: 'A-sibling', level: 'super', promotedBy: 'A-founder' });
/* A promotion chain two deep, so the promoter is not also the founder — that
   is the only way to observe BR-023 on its own rather than behind BR-024. */
const leaf      = mk({ id: 'A-leaf', level: 'super', promotedBy: 'A-sibling' });
const standard  = mk({ id: 'A-standard' });
const pendingAd = mk({ id: 'A-pending', status: 'pending' });
const frozen    = mk({ id: 'A-frozen', status: 'suspended' });

ok('BR-020 a standard admin cannot manage admins', canManageAdmins(standard) === false);
ok('BR-020 a super admin can manage admins', canManageAdmins(founder) === true);
ok('BR-020 a frozen super admin cannot manage admins',
   canManageAdmins({ ...founder, status: 'suspended' }) === false);
ok('BR-020 nobody signed in cannot manage admins', canManageAdmins(null) === false);

ok('BR-021 nobody administers their own account',
   canAdminAct(founder, founder, 'deactivate') === false);

ok('a super admin approves a pending admin', canAdminAct(founder, pendingAd, 'approve') === true);
ok('only a pending admin can be approved', canAdminAct(founder, standard, 'approve') === false);
ok('a super admin freezes a standard admin', canAdminAct(founder, standard, 'suspend') === true);
ok('a frozen admin can be reactivated', canAdminAct(founder, frozen, 'reactivate') === true);

ok('a super admin promotes an active standard admin',
   canAdminAct(founder, standard, 'promote') === true);
ok('a pending admin cannot be promoted', canAdminAct(founder, pendingAd, 'promote') === false);
ok('an existing super admin cannot be promoted again',
   canAdminAct(founder, promoted, 'promote') === false);

/* The rule the whole design turns on. */
ok('BR-023 a promoted super admin cannot freeze their promoter',
   canAdminAct(promoted, founder, 'suspend') === false);
ok('BR-023 a promoted super admin cannot deactivate their promoter',
   canAdminAct(promoted, founder, 'deactivate') === false);
ok('BR-023 the refusal names the promoter',
   (adminActionIssue(leaf, sibling, 'suspend') ?? '').includes('promoted you'));
ok('BR-024 outranks BR-023 when the promoter is also the founder',
   (adminActionIssue(promoted, founder, 'suspend') ?? '').includes('founding super admin'));
ok('BR-023 does not block acting on an unrelated super admin',
   canAdminAct(promoted, sibling, 'suspend') === true);
ok('BR-023 the promoter may still act on the account they promoted',
   canAdminAct(founder, promoted, 'suspend') === true);

ok('BR-024 the founder cannot be frozen by anyone',
   canAdminAct(sibling, founder, 'suspend') === false);
ok('BR-024 the founder cannot be deactivated by anyone',
   canAdminAct(sibling, founder, 'deactivate') === false);


/* ---------- the repository asks only for what the rules will answer ----------

   Every read rule but the admin's names a field of the document, and a
   Firestore list is refused whole if a single document it would return fails
   that rule. So the query the repository issues has to be narrow enough that
   everything it can return already satisfies the clause. These assertions hold
   each plan against the clause in firestore.rules it stands in for: if a rule
   is tightened and the plan is not, the query starts being refused silently
   and a teacher or a school is shown an empty platform. */

const TEACHER: RepoScope = { role: 'teacher', teacherId: 'TCH-1', schoolId: null };
const SCHOOL: RepoScope = { role: 'school', teacherId: null, schoolId: 'SCH-1' };
const ADMIN: RepoScope = { role: 'admin' };
const UNLINKED: RepoScope = { role: 'teacher', teacherId: null, schoolId: null };

const plan = (k: Parameters<typeof planFor>[0], s: RepoScope, want: unknown) =>
  JSON.stringify(planFor(k, s)) === JSON.stringify(want);

// isAdmin() looks at no field of the document, so an admin alone can list.
ok('an admin can list every collection unfiltered',
   COLLECTION_KEYS.every((k) => planFor(k, ADMIN) === 'all'));

// BR-011 and BR-027, as queries: the two-sided records, filtered to your side.
ok('a teacher reads only their own assignments',
   plan('assignments', TEACHER, { field: 'teacherId', value: 'TCH-1' }));
ok('a school reads only the assignments at its school',
   plan('assignments', SCHOOL, { field: 'schoolId', value: 'SCH-1' }));
ok('a teacher reads only their own sessions',
   plan('sessions', TEACHER, { field: 'teacherId', value: 'TCH-1' }));
ok('a school reads only the sessions at its school',
   plan('sessions', SCHOOL, { field: 'schoolId', value: 'SCH-1' }));

// The two directory rules, each the mirror of the other.
ok('a teacher may list every school, to have one to request',
   planFor('schools', TEACHER) === 'all');
ok('a school reads only its own record', plan('schools', SCHOOL, { docId: 'SCH-1' }));
ok('a school may list the teachers in its building',
   planFor('teachers', SCHOOL) === 'all');
ok('a teacher reads only their own record', plan('teachers', TEACHER, { docId: 'TCH-1' }));

// Addressed post, and owned files.
ok('a teacher reads only post addressed to them',
   plan('notifications', TEACHER, { field: 'audienceId', value: 'TCH-1' }));
ok('a school reads only its own documents',
   plan('documents', SCHOOL, { field: 'ownerId', value: 'SCH-1' }));

// Admin-only collections are not asked for rather than asked for and refused.
ok('a teacher does not ask for the administrator list',
   planFor('admins', TEACHER) === 'none');
ok('a school does not ask for the audit trail',
   planFor('auditLogs', SCHOOL) === 'none');

// Reference data is organisation-wide, and readable by everyone in it.
ok('subjects are readable across the organisation',
   planFor('subjects', TEACHER) === 'all' && planFor('subjects', SCHOOL) === 'all');
ok('classes are readable across the organisation',
   planFor('classes', TEACHER) === 'all' && planFor('classes', SCHOOL) === 'all');

/* An approved account whose profile has not been linked to its record yet must
   ask for nothing rather than ask for everything: an unfiltered query is
   refused, and a refusal is indistinguishable from an empty platform. */
ok('an unlinked teacher asks for no assignments',
   planFor('assignments', UNLINKED) === 'none');
ok('an unlinked teacher can still see the schools',
   planFor('schools', UNLINKED) === 'all');


/* ---------- BR-027: two keys, and a request that says which one is missing ----

   A request to teach is granted by the school and by the firm, and by neither
   alone. Until both have turned their key the request is still pending - and
   "pending" on its own is not an answer, so the state names the half that has
   already signed and the half still being waited on. */

const unsigned = {};
const bySchool = { schoolApprovedAt: '2026-09-05T09:00:00.000Z' };
const byAdmin = { adminApprovedAt: '2026-09-05T09:00:00.000Z' };
const byBoth = { ...bySchool, ...byAdmin };

ok('BR-027 neither key alone completes the request',
   !fullySigned(bySchool) && !fullySigned(byAdmin));
ok('BR-027 both keys together complete it', fullySigned(byBoth));
ok('BR-027 each side is read independently',
   schoolSigned(bySchool) && !adminSigned(bySchool)
   && adminSigned(byAdmin) && !schoolSigned(byAdmin));

ok('a fresh request is waiting on both',
   awaitingFrom(unsigned) === 'Waiting on the school and Glampter');
ok('when the school has signed, the state says so and names Glampter',
   awaitingFrom(bySchool) === 'The school has approved - waiting on Glampter');
ok('when Glampter has signed, the state says so and names the school',
   awaitingFrom(byAdmin) === 'Glampter has approved - waiting on the school');
ok('a complete request is waiting on nobody', awaitingFrom(byBoth) === '');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
