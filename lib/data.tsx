'use client';
/* Teach Clock — the data layer the whole application talks to.

   One provider owns the org's collections and exposes the workflow as verbs:
   submitSession, approveSession, requestCorrection, assignTeacher, and so on.
   Three things happen inside every verb, in this order, and none of them is
   optional:

     1. the business rule is checked (lib/rules.ts),
     2. the record is written,
     3. an audit entry is appended and the right people are notified.

   Doing it here rather than in the pages is what guarantees a correction made
   from the approval queue and the same correction made from a session detail
   produce identical history. */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode
} from 'react';
import { emptyCollections, makeRepo, newId, nextId, type Collections, type Repo } from './repo';
import {
  ensureFounder, firebaseReady, reRequestApproval, requestAccountDeletion,
  resolveAccountDeletion, saveOwnProfile, watchUsers, writeAdminGrade
} from './firebase';
import {
  DEFAULT_SETTINGS, adminActionIssue, approvalSide, awaitingFrom, canManageAdmins,
  canReview, canTransition, detectFlags, durationOf, fullySigned, periodsOf,
  validateSession, visibleSessions,
  type AdminAction, type Issue, type SessionDraft
} from './rules';
import { isPending, needsTeacherAction } from './compute';
import { nowISO, todayISO } from './format';
import { useGlam } from './store';
import type {
  AcademicSession, AccountStatus, AdminAccount, Assignment, AuditEntry, ClassLevel,
  DocumentMeta, Notification, OrgSettings, School, SessionStatus, Subject, Teacher,
  TeachingSession, UserProfile
} from './types';

/* The shape held before the repo answers. Derived, not written out — see
   emptyCollections() for why. */
const EMPTY: Collections = emptyCollections();

type Ctx = {
  ready: boolean;
  source: 'firestore' | 'memory';
  data: Collections;
  today: string;
  /** Sessions this account is allowed to see — BR-011 in one place. */
  mySessions: TeachingSession[];
  myNotifications: Notification[];
  unread: number;

  // sessions
  saveSession(draft: SessionDraft, opts?: { id?: string; submit?: boolean }): Promise<{ ok: boolean; issues: Issue[]; id?: string }>;
  reviewSession(id: string, to: SessionStatus, reason?: string): Promise<boolean>;
  resubmitSession(id: string, draft: SessionDraft, note: string): Promise<{ ok: boolean; issues: Issue[] }>;
  cancelSession(id: string, reason: string): Promise<boolean>;

  /** Everything waiting on this account, whatever kind of account it is. */
  pendingItems: PendingItem[];
  /** Every identity document the firm can see. Empty in preview. */
  liveUsers: UserProfile[];
  /** Teachers and schools waiting for the firm to activate them. */
  pendingSignups: UserProfile[];
  /** Accounts whose holder has asked to close them. Super admins decide. */
  deleteRequests: UserProfile[];
  /** Edit your own record. Email, role, status and grade are not yours to set. */
  saveMyProfile(patch: Partial<UserProfile>): Promise<boolean>;
  /** Ask for your own account to be closed. */
  askToCloseMyAccount(reason: string): Promise<boolean>;
  /** A refused account asking to be reconsidered. */
  askForApprovalAgain(): Promise<boolean>;
  /** Sign this account's side of an assignment. BR-027 needs both. */
  signAssignment(id: string, approve: boolean, reason?: string): Promise<boolean>;
  reviseMyAssignment(id: string, subjects: string[], classes: string[]): Promise<boolean>;
  withdrawFromSchool(id: string, reason?: string): Promise<boolean>;
  /** What is still outstanding on a record, phrased for a person. */
  awaiting(r: { schoolApprovedAt?: string; adminApprovedAt?: string }): string;
  /** A super admin's answer to that request. */
  decideDeletion(uid: string, approve: boolean): Promise<boolean>;
  /** Activate or refuse a teacher or school registration. */
  decideRegistration(uid: string, approve: boolean): Promise<boolean>;
  /** Every administrator the module should list: the live roster when signed
      in, the demo fixture in preview. */
  adminRoster: AdminAccount[];
  /** The AdminAccount behind the signed-in administrator, if there is one. */
  myAdmin: AdminAccount | null;
  /** True only for an active super admin — gates the Admin Manager module. */
  isSuperAdmin: boolean;
  /** Why `action` is refused against `target`, or null when it is allowed. */
  adminIssue(target: AdminAccount, action: AdminAction): string | null;
  setAdminStatus(id: string, status: AccountStatus, reason?: string): Promise<boolean>;
  promoteAdmin(id: string): Promise<boolean>;

  // network
  saveTeacher(t: Partial<Teacher> & { id?: string }): Promise<string>;
  saveSchool(s: Partial<School> & { id?: string }): Promise<string>;
  setAccountStatus(kind: 'teacher' | 'school', id: string, status: Teacher['status'], reason?: string): Promise<void>;
  saveAssignment(a: Partial<Assignment> & { id?: string }): Promise<string>;
  decideAssignment(id: string, to: Assignment['status'], reason?: string): Promise<void>;

  // reference data
  saveSubject(s: Partial<Subject> & { id?: string }): Promise<void>;
  saveClass(c: Partial<ClassLevel> & { id?: string }): Promise<void>;
  saveAcademicSession(a: Partial<AcademicSession> & { id?: string }): Promise<void>;
  saveDocument(d: Omit<DocumentMeta, 'id' | 'uploadedAt' | 'uploadedBy'>): Promise<void>;
  removeDocument(id: string): Promise<void>;
  saveSettings(s: OrgSettings): Promise<void>;

  markNotificationsRead(): Promise<void>;
  resetDemoData(): void;
};

/** One thing waiting on the signed-in account, whoever they are. Derived live
    rather than stored, so the bell can never disagree with the modules. */
export type PendingItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
};

const DataCtx = createContext<Ctx | null>(null);

export const useData = () => {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData must be used inside <DataProvider>');
  return c;
};

/** An administrator's identity document seen as a roster row. One record, two
    shapes: users/{uid} is what Firestore stores and what the rules read;
    AdminAccount is what lib/rules.ts and the module work in. */
export function adminFromProfile(p: UserProfile): AdminAccount {
  return {
    id: p.adminId ?? p.uid,
    uid: p.uid,
    name: p.displayName || p.email,
    firstName: p.firstName,
    surname: p.surname,
    email: p.email,
    phone: p.phone,
    level: p.adminLevel ?? 'standard',
    status: p.status,
    promotedBy: p.promotedBy,
    founder: p.founder,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

/** "Mrs. Folake Adeyemi" → "Folake". A title is not a name, and the demo
    contacts carry them. */
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'engr']);

function firstNameOf(full?: string): string {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  const head = (parts[0] ?? '').replace(/\.$/, '').toLowerCase();
  return (TITLES.has(head) ? parts[1] : parts[0]) ?? '';
}

/** The identity used for writes. In preview there is no account, so the
    switcher's role stands in — every write still records who did it. */
function actorOf(profile: UserProfile | null, role: UserProfile['role'], data: Collections): UserProfile {
  if (profile) return profile;
  const teacher = data.teachers.find((t) => t.status === 'active');
  const school = data.schools.find((s) => s.status === 'active');
  return {
    uid: 'preview',
    role,
    status: 'active',
    orgId: 'glampter',
    teacherId: role === 'teacher' ? teacher?.id : undefined,
    schoolId: role === 'school' ? school?.id : undefined,
    displayName: role === 'teacher' ? (teacher?.name ?? 'Teacher')
      : role === 'school' ? (school?.name ?? 'School') : 'Glampter Operations',
    /* Name parts too, so anything that greets a person by name behaves the same
       in preview as it does for a real account — a school registers under the
       school's name, and the person behind it is its contact. */
    ...(role === 'teacher'
      ? { firstName: firstNameOf(teacher?.name) }
      : role === 'school'
        ? { contactFirstName: firstNameOf(school?.contact) }
        : { firstName: 'Glampter' }),
    email: '', phone: '', createdAt: nowISO()
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { profile, role, stage, preview, refresh, say } = useGlam();
  const [repo, setRepo] = useState<Repo | null>(null);
  const [data, setData] = useState<Collections>(EMPTY);
  const [ready, setReady] = useState(false);

  /* Firestore once an approved account is in session; otherwise the in-memory
     repository, so the whole product is operable in preview. */
  useEffect(() => {
    if (stage === 'loading') return;
    /* The demo fixture exists so an unauthenticated PREVIEW is reviewable — it
       is not something a real account should ever be offered. Anyone holding a
       profile reads the organisation's own records, whatever their status, so a
       pending teacher is shown the firm's real schools and subjects (usually
       none yet) rather than five fictional schools they could request. */
    /* The scope decides which query each collection gets: the rules refuse an
       unfiltered list to anyone but an admin, so a teacher and a school have to
       ask narrowly to be answered at all. */
    const r = makeRepo(Boolean(profile), {
      role: profile?.role ?? null,
      teacherId: profile?.teacherId ?? null,
      schoolId: profile?.schoolId ?? null
    });
    setRepo(r);
    const unsub = r.subscribe((c) => { setData(c); setReady(true); });
    void r.load().then((c) => { setData(c); setReady(true); });
    return unsub;
  }, [stage, profile]);

  const today = data.settings ? todayISO(data.settings.timezone) : todayISO();
  const actor = useMemo(() => actorOf(profile, role, data), [profile, role, data]);

  /* ---------- write helpers ---------- */

  const writeAudit = useCallback(async (
    entry: Omit<AuditEntry, 'id' | 'at' | 'actor' | 'actorRole'>
  ) => {
    if (!repo) return;
    await repo.put('auditLogs', {
      ...entry,
      id: newId('AUD'),
      at: nowISO(),
      actor: actor.displayName,
      actorRole: actor.role
    });
  }, [repo, data.auditLogs, actor]);

  const notify = useCallback(async (
    items: Omit<Notification, 'id' | 'read' | 'createdAt'>[]
  ) => {
    if (!repo || !items.length) return;
    await repo.putMany('notifications', items.map((n) => ({
      ...n,
      id: newId('NTF'),
      read: false,
      createdAt: nowISO()
    })));
  }, [repo]);

  /* ---------- sessions ---------- */

  const saveSession: Ctx['saveSession'] = useCallback(async (draft, opts = {}) => {
    if (!repo) return { ok: false, issues: [] };
    const issues = validateSession(draft, { assignments: data.assignments, settings: data.settings, today });
    if (issues.length) return { ok: false, issues };

    const teacher = data.teachers.find((t) => t.id === draft.teacherId);
    const school = data.schools.find((s) => s.id === draft.schoolId);
    const existing = opts.id ? data.sessions.find((s) => s.id === opts.id) : undefined;
    const minutes = durationOf(draft.startTime, draft.endTime);
    const id = opts.id ?? newId('TS');
    const submit = opts.submit ?? true;

    const record: TeachingSession = {
      ...(existing ?? {} as TeachingSession),
      id,
      teacherId: draft.teacherId,
      teacherName: teacher?.name ?? actor.displayName,
      schoolId: draft.schoolId,
      schoolName: school?.name ?? '',
      subject: draft.subject,
      className: draft.className,
      academicSessionId: data.academicSessions.find((a) => a.current)?.id,
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      durationMinutes: minutes,                                   // BR-015
      periods: periodsOf(minutes, data.settings.periodMinutes),
      topic: draft.topic,
      teachingType: draft.teachingType,
      teacherComment: draft.teacherComment,
      status: submit ? 'submitted' : 'draft',
      submittedAt: submit ? nowISO() : existing?.submittedAt,
      flags: detectFlags(draft, data.sessions.filter((s) => s.id !== id), data.settings, today),
      createdAt: existing?.createdAt ?? nowISO(),
      updatedAt: nowISO()
    };

    await repo.put('sessions', record);
    await writeAudit({
      action: existing ? 'session.update' : 'session.create',
      objectType: 'session', objectId: id,
      summary: `${submit ? 'Submitted' : 'Saved draft for'} ${record.subject} · ${record.className} ` +
               `(${(minutes / 60).toFixed(1)} hrs) at ${record.schoolName}`,
      after: record.status
    });
    if (submit) {
      await notify([{
        kind: 'session-submitted',
        title: 'New teaching session submitted',
        body: `${record.teacherName} submitted ${(minutes / 60).toFixed(1)} hours of ${record.subject} for ${record.className}.`,
        audienceRole: 'school', audienceId: record.schoolId, href: '/approvals'
      }, {
        kind: 'session-submitted',
        title: `${record.teacherName} submitted a session`,
        body: `${record.subject} · ${record.className} at ${record.schoolName}.`,
        audienceRole: 'admin', href: '/sessions'
      }]);
    }
    return { ok: true, issues: [], id };
  }, [repo, data, today, actor, writeAudit, notify]);

  const reviewSession: Ctx['reviewSession'] = useCallback(async (id, to, reason) => {
    if (!repo) return false;
    const s = data.sessions.find((x) => x.id === id);
    if (!s) return false;
    if (!canReview(actor, s)) { say('You cannot review that session.'); return false; }
    if (!canTransition(s.status, to)) { say(`A ${s.status} session cannot move to ${to}.`); return false; }
    if ((to === 'rejected' || to === 'correction') && !reason?.trim()) {
      say('A reason is required.'); return false;                  // BR-007 / BR-008
    }

    const patch: TeachingSession = {
      ...s,
      status: to,
      reviewedAt: nowISO(),
      reviewedBy: actor.displayName,
      rejectionReason: to === 'rejected' ? reason : s.rejectionReason,
      correctionReason: to === 'correction' ? reason : s.correctionReason,
      schoolComment: reason ?? s.schoolComment,
      updatedAt: nowISO()
    };
    await repo.put('sessions', patch);
    await writeAudit({
      action: `session.${to}`, objectType: 'session', objectId: id,
      summary: `${to === 'approved' ? 'Approved' : to === 'rejected' ? 'Rejected' : 'Requested correction on'} ` +
               `${s.subject} · ${s.className} at ${s.schoolName}` + (reason ? ` — ${reason}` : ''),
      before: s.status, after: to
    });
    await notify([{
      kind: to === 'approved' ? 'session-approved' : to === 'rejected' ? 'session-rejected' : 'session-correction',
      title: to === 'approved' ? 'Your session was approved'
        : to === 'rejected' ? 'A session was rejected' : 'A session needs your correction',
      body: `${s.subject} · ${s.className} at ${s.schoolName} on ${s.date}.` + (reason ? ` ${reason}` : ''),
      audienceRole: 'teacher', audienceId: s.teacherId, href: '/sessions'
    }]);
    return true;
  }, [repo, data.sessions, actor, writeAudit, notify, say]);

  const resubmitSession: Ctx['resubmitSession'] = useCallback(async (id, draft, note) => {
    if (!repo) return { ok: false, issues: [] };
    const s = data.sessions.find((x) => x.id === id);
    if (!s) return { ok: false, issues: [] };
    const issues = validateSession(draft, { assignments: data.assignments, settings: data.settings, today });
    if (issues.length) return { ok: false, issues };

    const minutes = durationOf(draft.startTime, draft.endTime);
    /* BR-006: the prior version is kept, so a correction is visible rather than
       silent. This is the difference between a log and a record. */
    const revisions = [...(s.revisions ?? []), {
      at: nowISO(), by: actor.displayName, reason: note,
      before: {
        date: s.date, startTime: s.startTime, endTime: s.endTime,
        durationMinutes: s.durationMinutes, subject: s.subject,
        className: s.className, topic: s.topic
      }
    }];

    await repo.put('sessions', {
      ...s,
      subject: draft.subject, className: draft.className, date: draft.date,
      startTime: draft.startTime, endTime: draft.endTime,
      durationMinutes: minutes, periods: periodsOf(minutes, data.settings.periodMinutes),
      topic: draft.topic, teachingType: draft.teachingType, teacherComment: note,
      status: 'resubmitted', submittedAt: nowISO(), updatedAt: nowISO(),
      rejectionReason: undefined, correctionReason: undefined,
      revisions
    });
    await writeAudit({
      action: 'session.resubmit', objectType: 'session', objectId: id,
      summary: `Corrected and resubmitted ${s.subject} · ${s.className} — ${note}`,
      before: `${s.startTime}–${s.endTime}`, after: `${draft.startTime}–${draft.endTime}`
    });
    await notify([{
      kind: 'session-resubmitted', title: 'A corrected session is ready for review',
      body: `${s.teacherName} resubmitted ${s.subject} · ${s.className}. ${note}`,
      audienceRole: 'school', audienceId: s.schoolId, href: '/approvals'
    }]);
    return { ok: true, issues: [] };
  }, [repo, data, today, actor, writeAudit, notify]);

  const cancelSession: Ctx['cancelSession'] = useCallback(async (id, reason) => {
    if (!repo || !reason.trim()) return false;
    const s = data.sessions.find((x) => x.id === id);
    if (!s) return false;
    await repo.put('sessions', { ...s, status: 'cancelled', cancelReason: reason, updatedAt: nowISO() });
    await writeAudit({
      action: 'session.cancel', objectType: 'session', objectId: id,
      summary: `Cancelled ${s.subject} · ${s.className} at ${s.schoolName} — ${reason}`,
      before: s.status, after: 'cancelled'
    });
    return true;
  }, [repo, data.sessions, writeAudit]);

  /* ---------- network ---------- */

  const saveTeacher: Ctx['saveTeacher'] = useCallback(async (t) => {
    if (!repo) return '';
    const id = t.id ?? nextId('TCH', data.teachers);
    const existing = data.teachers.find((x) => x.id === id);
    const rec: Teacher = {
      name: '', email: '', phone: '', subjects: [], qualification: '',
      hourlyRate: 3000, joined: today, status: 'pending',
      ...existing, ...t, id
    };
    await repo.put('teachers', rec);
    await writeAudit({
      action: existing ? 'teacher.update' : 'teacher.create', objectType: 'teacher', objectId: id,
      summary: `${existing ? 'Updated' : 'Created'} teacher ${rec.name}`
    });
    return id;
  }, [repo, data.teachers, data.settings, today, writeAudit]);

  const saveSchool: Ctx['saveSchool'] = useCallback(async (s) => {
    if (!repo) return '';
    const id = s.id ?? nextId('SCH', data.schools);
    const existing = data.schools.find((x) => x.id === id);
    const rec: School = {
      name: '', shortName: '', address: '', city: 'Abeokuta', contact: '', email: '', phone: '',
      hourlyRate: 5000, contractedHours: 80, status: 'pending',
      ...existing, ...s, id
    };
    if (!rec.shortName) rec.shortName = rec.name.replace(/ (School|College|Academy)$/, '');
    await repo.put('schools', rec);
    await writeAudit({
      action: existing ? 'school.update' : 'school.create', objectType: 'school', objectId: id,
      summary: `${existing ? 'Updated' : 'Created'} school ${rec.name}`
    });
    return id;
  }, [repo, data.schools, writeAudit]);

  /* ---------- administrators ----------
     Every write re-checks the same rule the button used to decide whether to
     render itself, so a stale page or a hand-crafted call cannot get past it. */

  /* Live administrators, straight from users/{uid}. Registration writes that
     document and firestore.rules grades people by it, so it is the only honest
     source for a real account — the org's `admins` collection is a preview
     fixture and was never synchronised with it. */
  const [liveUsers, setLiveUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (stage !== 'ready' || role !== 'admin' || !firebaseReady) { setLiveUsers([]); return; }
    return watchUsers(setLiveUsers);
  }, [stage, role]);

  const liveAdmins = useMemo(
    () => liveUsers.filter((u) => u.role === 'admin'), [liveUsers]);

  const pendingSignups = useMemo(
    () => liveUsers
      .filter((u) => u.status === 'pending' && !u.deletedAt)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [liveUsers]);

  const deleteRequests = useMemo(
    () => liveUsers.filter((u) => !!u.deleteRequestedAt && !u.deletedAt), [liveUsers]);

  /* The first administrator settles the founder slot on sign-in, because the
     attempt made during registration can legitimately have failed — rules not
     yet deployed, or a lost race. Without this a platform can end up with no
     super admin and no way to appoint one. */
  useEffect(() => {
    if (stage !== 'ready' || !profile || profile.role !== 'admin' || !firebaseReady) return;
    void ensureFounder(profile);
  }, [stage, profile]);

  const adminRoster = useMemo<AdminAccount[]>(
    () => (liveAdmins.length ? liveAdmins.map(adminFromProfile) : data.admins),
    [liveAdmins, data.admins]);

  const myAdmin = useMemo<AdminAccount | null>(() => {
    if (role !== 'admin') return null;
    /* A signed-in administrator is graded by their own profile. The roster row
       may not exist — nothing ever created one — and requiring it is what made
       the module invisible to the very account that owns it. */
    if (profile && profile.role === 'admin') return adminFromProfile(profile);
    /* Preview has no account at all, so it stands in as the founder — that is
       what makes the module reviewable before anyone has registered. */
    return preview ? (data.admins.find((a) => a.founder) ?? null) : null;
  }, [role, profile, preview, data.admins]);

  const isSuperAdmin = canManageAdmins(myAdmin);

  const adminIssue: Ctx['adminIssue'] = useCallback(
    (target, action) => adminActionIssue(myAdmin, target, action), [myAdmin]);

  const setAdminStatus: Ctx['setAdminStatus'] = useCallback(async (id, status, reason) => {
    if (!repo) return false;
    const target = adminRoster.find((a) => a.id === id);
    if (!target) return false;

    const action: AdminAction =
      status === 'active' ? (target.status === 'pending' ? 'approve' : 'reactivate')
        : status === 'suspended' ? 'suspend' : 'deactivate';

    const issue = adminActionIssue(myAdmin, target, action);
    if (issue) { say(issue); return false; }

    if (target.uid) {
      await writeAdminGrade(target.uid, { status });
    } else {
      await repo.put('admins', {
        ...target, status, updatedAt: nowISO(), ...(reason ? { notes: reason } : {})
      });
    }
    await writeAudit({
      action: `admin.${action}`, objectType: 'admin', objectId: id,
      summary: `${target.name} ${action === 'approve' ? 'approved as administrator'
        : action === 'suspend' ? 'frozen'
        : action === 'reactivate' ? 'reactivated'
        : 'deactivated'}` + (reason ? ` — ${reason}` : ''),
      before: target.status, after: status
    });
    say(`${target.name} ${status === 'active' ? 'is now active'
      : status === 'suspended' ? 'is frozen' : 'is deactivated'}.`);
    return true;
  }, [repo, adminRoster, myAdmin, writeAudit, say]);

  const promoteAdmin: Ctx['promoteAdmin'] = useCallback(async (id) => {
    if (!repo) return false;
    const target = adminRoster.find((a) => a.id === id);
    if (!target || !myAdmin) return false;

    const issue = adminActionIssue(myAdmin, target, 'promote');
    if (issue) { say(issue); return false; }

    /* promotedBy is the whole of BR-023: it is what later stops this account
       from freezing the person who granted it. */
    if (target.uid) {
      await writeAdminGrade(target.uid, { adminLevel: 'super', promotedBy: myAdmin.id });
    } else {
      await repo.put('admins', {
        ...target, level: 'super', promotedBy: myAdmin.id, updatedAt: nowISO()
      });
    }
    await writeAudit({
      action: 'admin.promote', objectType: 'admin', objectId: id,
      summary: `${target.name} promoted to super admin by ${myAdmin.name}`,
      before: 'standard', after: 'super'
    });
    say(`${target.name} is now a super admin.`);
    return true;
  }, [repo, adminRoster, myAdmin, writeAudit, say]);

  /* ---------- binding an account to its organisation record ----------

     The rules match a teacher to their own work through me().teacherId, so an
     account without that link can read but never write — which is exactly what
     made "request to teach in a school" fail.

     It has to be repaired from the administrator's session, not the account's
     own. A teacher may only read teachers/{id} where me().teacherId == id, so
     an account with no link can see nothing in that collection and cannot find
     the very record that would supply it. An administrator can read every
     account and write both halves, so this is the only session where the
     repair is possible at all.

     Two things are fixed here, in order: the org record an account approved
     before records existed never got, and the profile link an account approved
     before the link existed never got. Both are idempotent. */

  useEffect(() => {
    if (stage !== 'ready' || role !== 'admin' || !repo || !ready || !firebaseReady) return;

    for (const u of liveUsers) {
      if (u.status !== 'active' || u.deletedAt) continue;

      if (u.role === 'teacher') {
        const rec = data.teachers.find((t) => t.uid === u.uid);
        if (!rec) {
          void repo.put('teachers', {
            id: nextId('TCH', data.teachers), uid: u.uid, name: u.displayName || u.email,
            email: u.email, phone: u.phone, subjects: [], qualification: '',
            experienceYears: 0, hourlyRate: 0, joined: nowISO().slice(0, 10), status: 'active'
          });
        } else if (u.teacherId !== rec.id) {
          void writeAdminGrade(u.uid, { teacherId: rec.id });
        }
      }

      if (u.role === 'school') {
        const rec = data.schools.find((s) => s.uid === u.uid);
        if (!rec) {
          void repo.put('schools', {
            id: nextId('SCH', data.schools), uid: u.uid, name: u.displayName || u.email,
            shortName: u.displayName || u.email, address: '', city: '',
            contact: [u.contactFirstName, u.contactSurname].filter(Boolean).join(' '),
            email: u.email, phone: u.phone, hourlyRate: 0, contractedHours: 0,
            openTime: '07:30', closeTime: '16:00', status: 'active'
          });
        } else if (u.schoolId !== rec.id) {
          void writeAdminGrade(u.uid, { schoolId: rec.id });
        }
      }
    }
  }, [stage, role, repo, ready, liveUsers, data.teachers, data.schools]);

  const saveMyProfile: Ctx['saveMyProfile'] = useCallback(async (patch) => {
    if (!profile?.uid) return false;
    await saveOwnProfile(profile.uid, patch);
    say('Profile saved.');
    return true;
  }, [profile, say]);

  const askToCloseMyAccount: Ctx['askToCloseMyAccount'] = useCallback(async (reason) => {
    if (!profile?.uid) return false;
    await requestAccountDeletion(profile.uid, reason);
    /* Every super admin is told, because any of them can answer it. */
    await notify([{
      kind: 'account-delete-requested',
      title: 'Account closure requested',
      body: `${profile.displayName} asked for their ${profile.role} account to be closed — ${reason}`,
      audienceRole: 'admin',
      href: '/admin-manager'
    }]);
    await writeAudit({
      action: 'account.delete-requested', objectType: 'account', objectId: profile.uid,
      summary: `${profile.displayName} asked to close their account — ${reason}`
    });
    say('Request sent. A super admin will review it.');
    return true;
  }, [profile, notify, writeAudit, say]);

  const askForApprovalAgain: Ctx['askForApprovalAgain'] = useCallback(async () => {
    if (!profile?.uid) return false;
    try {
      await reRequestApproval(profile.uid);
    } catch {
      say('That did not send. Check your connection and try again.');
      return false;
    }
    /* Deliberately no notification write. A refused account is not `active`,
       and firestore.rules only lets an active member of the org create one —
       so that write was rejected and surfaced as an error overlay even though
       the request itself had already gone through. The firm sees the account
       in its registration queue anyway, because that queue is derived from
       users/{uid}.status, which is precisely what just changed. */
    await refresh();   // re-read the profile so the banner flips without a reload
    say('Sent. The firm will look at your account again.');
    return true;
  }, [profile, refresh, say]);

  const decideDeletion: Ctx['decideDeletion'] = useCallback(async (uid, approve) => {
    if (!isSuperAdmin) { say('Only a super admin can decide an account closure.'); return false; }
    const target = liveUsers.find((u) => u.uid === uid);
    await resolveAccountDeletion(uid, approve);
    await writeAudit({
      action: approve ? 'account.delete-approved' : 'account.delete-declined',
      objectType: 'account', objectId: uid,
      summary: `${target?.displayName ?? uid} closure ${approve ? 'approved' : 'declined'}`
    });
    say(approve ? 'Account closed.' : 'Closure declined.');
    return true;
  }, [isSuperAdmin, liveUsers, writeAudit, say]);

  const decideRegistration: Ctx['decideRegistration'] = useCallback(async (uid, approve) => {
    if (role !== 'admin') return false;
    const target = liveUsers.find((u) => u.uid === uid);
    if (!target) return false;

    /* Only a super admin decides another administrator. */
    if (target.role === 'admin' && !isSuperAdmin) {
      say('Approval from a super admin is needed for an administrator account.');
      return false;
    }

    /* Approving is also what binds the account to its organisation record. The
       rules match a teacher to their own work through me().teacherId, so
       without this link an approved teacher cannot create anything — which is
       exactly why requesting a school came back as a permission error. */
    let teacherId = data.teachers.find((x) => x.uid === uid)?.id;
    let schoolId = data.schools.find((x) => x.uid === uid)?.id;

    if (approve && repo) {
      if (target.role === 'school' && !schoolId) {
        schoolId = nextId('SCH', data.schools);
        await repo.put('schools', {
          id: schoolId,
          uid,
          name: target.displayName,
          shortName: target.displayName,
          address: '', city: '',
          contact: [target.contactFirstName, target.contactSurname].filter(Boolean).join(' '),
          email: target.email,
          phone: target.phone,
          hourlyRate: 0,
          contractedHours: 0,
          openTime: '07:30', closeTime: '16:00',
          status: 'active'
        });
      }
      if (target.role === 'teacher' && !teacherId) {
        teacherId = nextId('TCH', data.teachers);
        await repo.put('teachers', {
          id: teacherId,
          uid,
          name: target.displayName,
          email: target.email,
          phone: target.phone,
          subjects: [],
          qualification: '',
          experienceYears: 0,
          hourlyRate: 0,
          joined: nowISO().slice(0, 10),
          status: 'active'
        });
      }
    }

    await writeAdminGrade(uid, {
      status: approve ? 'active' : 'rejected',
      ...(approve && teacherId ? { teacherId } : {}),
      ...(approve && schoolId ? { schoolId } : {})
    });

    await writeAudit({
      action: approve ? 'account.approved' : 'account.rejected',
      objectType: 'account', objectId: uid,
      summary: `${target.displayName || uid} (${target.role}) ${approve ? 'activated' : 'rejected'}`
    });
    say(approve ? 'Registration approved.' : 'Registration rejected.');
    return true;
  }, [role, isSuperAdmin, liveUsers, repo, data.schools, data.teachers, writeAudit, say]);

  const setAccountStatus: Ctx['setAccountStatus'] = useCallback(async (kind, id, status, reason) => {
    if (!repo) return;
    const key = kind === 'teacher' ? 'teachers' : 'schools';
    const list = kind === 'teacher' ? data.teachers : data.schools;
    const rec = list.find((x) => x.id === id);
    if (!rec) return;
    await repo.put(key, { ...rec, status } as Teacher & School);
    await writeAudit({
      action: `${kind}.${status}`, objectType: kind, objectId: id,
      summary: `${rec.name} set to ${status}` + (reason ? ` — ${reason}` : ''),
      before: rec.status, after: status
    });
    if (status === 'active') {
      await notify([{
        kind: 'account-approved', title: 'Your account has been approved',
        body: `Glampter Consults activated ${rec.name}. You can now use the platform.`,
        audienceRole: kind, audienceId: id, href: '/dashboard'
      }]);
    }
  }, [repo, data.teachers, data.schools, writeAudit, notify]);

  const saveAssignment: Ctx['saveAssignment'] = useCallback(async (a) => {
    if (!repo) return '';
    const id = a.id ?? newId('ASN');
    const existing = data.assignments.find((x) => x.id === id);
    const rec: Assignment = {
      teacherId: '', schoolId: '', subjects: [], classes: [], startDate: today,
      assignedBy: actor.displayName, origin: 'admin', status: 'active', createdAt: nowISO(),
      ...existing, ...a, id
    };

    /* The record is the request. If this fails there is nothing to report on,
       so it is the only failure the person needs to hear about. */
    try {
      await repo.put('assignments', rec);
    } catch {
      say('That request could not be sent. Check your connection and try again.');
      return '';
    }

    const teacher = data.teachers.find((t) => t.id === rec.teacherId);
    const school = data.schools.find((s) => s.id === rec.schoolId);

    /* Everything below is best-effort. The request already exists; a trail or a
       notification that cannot be written must not surface as a failed request
       — an unhandled rejection here is what put an error on screen after a
       submission that had actually succeeded. */
    try {
      await writeAudit({
        action: existing ? 'assignment.update' : 'assignment.create',
        objectType: 'assignment', objectId: id,
        summary: `${teacher?.name ?? rec.teacherId} → ${school?.name ?? rec.schoolId} (${rec.subjects.join(', ') || 'all subjects'})`
      });
    } catch { /* the record stands without its audit line */ }

    try {
      if (!existing && rec.status === 'active') {
        await notify([{
          kind: 'assignment-created', title: 'You have a new school assignment',
          body: `You are assigned to ${school?.name ?? 'a school'} from ${rec.startDate}.`,
          audienceRole: 'teacher', audienceId: rec.teacherId, href: '/my-schools'
        }]);
      }
      if (!existing && rec.status === 'requested') {
        /* Both signatories, because BR-027 needs both of them to act, and the
           teacher so they can see it is with the right people. */
        await notify([
          {
            kind: 'assignment-requested', title: 'Request to teach',
            body: `${teacher?.name ?? 'A teacher'} asked to teach at ${school?.name ?? 'your school'}.`,
            audienceRole: 'school', audienceId: rec.schoolId, href: '/dashboard'
          },
          {
            kind: 'assignment-requested', title: 'Request to teach',
            body: `${teacher?.name ?? 'A teacher'} asked to teach at ${school?.name ?? 'a school'}.`,
            audienceRole: 'admin', href: '/dashboard'
          },
          {
            kind: 'assignment-requested', title: 'Request sent',
            body: `Waiting on ${school?.name ?? 'the school'} and Glampter to approve.`,
            audienceRole: 'teacher', audienceId: rec.teacherId, href: '/my-schools'
          }
        ]);
      }
    } catch { /* the request stands without its notifications */ }

    return id;
  }, [repo, data.assignments, data.teachers, data.schools, today, actor, writeAudit, notify, say]);

  /* ---------- BR-027: an assignment needs both keys ----------

     The account signs its own side and nothing else. The record only becomes
     active once the other side is already in, so neither the school nor the
     firm can place a teacher on its own. */

  const signAssignment: Ctx['signAssignment'] = useCallback(async (id, approve, reason) => {
    if (!repo) return false;
    const a = data.assignments.find((x) => x.id === id);
    if (!a) return false;

    const side = approvalSide(actor.role);
    if (!side) { say('Only a school or an administrator can decide this.'); return false; }

    /* An account still waiting on its own approval cannot approve anyone. */
    if (actor.status !== 'active') {
      say('Approval from a super admin is needed before you can decide requests.');
      return false;
    }
    if (side === 'school' && a.schoolId !== actor.schoolId) {
      say('That request belongs to another school.');
      return false;
    }

    if (!approve) {
      try {
        await repo.put('assignments', { ...a, status: 'rejected', notes: reason ?? a.notes });
      } catch {
        say('That decision could not be saved. Check your connection and try again.');
        return false;
      }
      /* Best-effort from here: the rejection is already recorded, and a trail
         that will not write must never present itself as a decision that did
         not happen. */
      try {
        await writeAudit({
          action: 'assignment.rejected', objectType: 'assignment', objectId: id,
          summary: 'Assignment ' + id + ' rejected by the ' + side + (reason ? ' - ' + reason : ''),
          before: a.status, after: 'rejected'
        });
      } catch { /* the rejection stands without its audit line */ }
      try {
        await notify([{
          kind: 'assignment-created', title: 'Your request was rejected',
          body: reason || 'The ' + side + ' rejected your request to teach.',
          audienceRole: 'teacher', audienceId: a.teacherId, href: '/my-schools'
        }]);
      } catch { /* the rejection stands without its notification */ }
      say('Request rejected.');
      return true;
    }

    const stamped = {
      ...a,
      ...(side === 'school'
        ? { schoolApprovedAt: nowISO(), schoolApprovedBy: actor.displayName }
        : { adminApprovedAt: nowISO(), adminApprovedBy: actor.displayName })
    };
    const done = fullySigned(stamped);

    /* The stamp is the decision. If it will not save there is nothing to
       announce, and that is the only failure worth interrupting someone for -
       everything after it is a trail, and a trail that cannot be written must
       never present itself as a decision that did not happen. */
    try {
      await repo.put('assignments', { ...stamped, status: done ? 'active' : 'requested' });
    } catch {
      say('That decision could not be saved. Check your connection and try again.');
      return false;
    }

    try {
      await writeAudit({
        action: 'assignment.' + side + '-approved', objectType: 'assignment', objectId: id,
        summary: 'Assignment ' + id + ' approved by the ' + side
                 + (done ? ' - now active' : ' - ' + awaitingFrom(stamped)),
        before: a.status, after: done ? 'active' : 'requested'
      });
    } catch { /* the decision stands without its audit line */ }

    /* Everyone who is still needed, and the teacher either way. */
    const audiences: Notification['audienceRole'][] = done ? ['teacher'] : ['teacher', side === 'school' ? 'admin' : 'school'];
    try {
      await notify(audiences.map((audienceRole) => ({
        kind: 'assignment-created' as const,
        title: done ? 'Assignment approved' : 'One approval in, one to go',
        body: done
          ? 'The school and Glampter have both approved the placement.'
          : awaitingFrom(stamped) + ' on this request to teach.',
        audienceRole,
        audienceId: audienceRole === 'teacher' ? a.teacherId : undefined,
        href: audienceRole === 'teacher' ? '/my-schools' : '/assignments'
      })));
    } catch { /* the decision stands without its notifications */ }

    say(done ? 'Approved. The placement is now active.' : 'Approved. ' + awaitingFrom(stamped) + '.');
    return true;
  }, [repo, data.assignments, actor, writeAudit, notify, say]);

  /* Revising what you cover is a change to what was agreed, so it goes back
     through both keys rather than quietly widening itself. */
  const reviseMyAssignment: Ctx['reviseMyAssignment'] = useCallback(async (id, subjects, classes) => {
    if (!repo) return false;
    const a = data.assignments.find((x) => x.id === id);
    if (!a || a.teacherId !== actor.teacherId) return false;

    try {
      await repo.put('assignments', {
        ...a, subjects, classes, status: 'requested',
        /* Emptied rather than removed: the repository strips undefined before
           it writes, so '' is how a stamp is actually taken back off. */
        schoolApprovedAt: '', schoolApprovedBy: '', adminApprovedAt: '', adminApprovedBy: ''
      });
    } catch {
      say('That change could not be saved. Check your connection and try again.');
      return false;
    }

    const school = data.schools.find((s) => s.id === a.schoolId);
    try {
      await writeAudit({
        action: 'assignment.revised', objectType: 'assignment', objectId: id,
        summary: 'Coverage revised at ' + (school?.name ?? a.schoolId)
                 + ' - ' + (subjects.join(', ') || 'any subject'),
        before: a.status, after: 'requested'
      });
    } catch { /* the change stands without its audit line */ }
    try {
      await notify(['school', 'admin'].map((audienceRole) => ({
        kind: 'assignment-requested' as const,
        title: 'Revised request to teach',
        body: (data.teachers.find((t) => t.id === a.teacherId)?.name ?? 'A teacher')
              + ' changed what they cover at ' + (school?.name ?? 'a school') + '.',
        audienceRole: audienceRole as Notification['audienceRole'],
        audienceId: audienceRole === 'school' ? a.schoolId : undefined,
        href: '/dashboard'
      })));
    } catch { /* the change stands without its notifications */ }

    say('Sent. The school and Glampter both approve the new subjects and classes.');
    return true;
  }, [repo, data.assignments, data.schools, data.teachers, actor, writeAudit, notify, say]);

  /* Withdrawing ends the placement. The record is kept and dated, because the
     sessions already taught under it still have to reconcile. */
  const withdrawFromSchool: Ctx['withdrawFromSchool'] = useCallback(async (id, reason) => {
    if (!repo) return false;
    const a = data.assignments.find((x) => x.id === id);
    if (!a || a.teacherId !== actor.teacherId) return false;

    try {
      await repo.put('assignments', {
        ...a, status: 'ended', endDate: today, notes: reason ?? a.notes
      });
    } catch {
      say('That could not be saved. Check your connection and try again.');
      return false;
    }

    const school = data.schools.find((s) => s.id === a.schoolId);
    try {
      await writeAudit({
        action: 'assignment.withdrawn', objectType: 'assignment', objectId: id,
        summary: 'Teacher withdrew from ' + (school?.name ?? a.schoolId)
                 + (reason ? ' - ' + reason : ''),
        before: a.status, after: 'ended'
      });
    } catch { /* the withdrawal stands without its audit line */ }
    try {
      await notify(['school', 'admin'].map((audienceRole) => ({
        kind: 'assignment-created' as const,
        title: 'Teacher withdrew from a school',
        body: (data.teachers.find((t) => t.id === a.teacherId)?.name ?? 'A teacher')
              + ' has withdrawn from ' + (school?.name ?? 'a school')
              + (reason ? ' - ' + reason : '.'),
        audienceRole: audienceRole as Notification['audienceRole'],
        audienceId: audienceRole === 'school' ? a.schoolId : undefined,
        href: '/assignments'
      })));
    } catch { /* the withdrawal stands without its notifications */ }

    say('You have withdrawn from ' + (school?.name ?? 'the school') + '.');
    return true;
  }, [repo, data.assignments, data.schools, data.teachers, actor, today, writeAudit, notify, say]);

  const awaiting: Ctx['awaiting'] = useCallback((r) => awaitingFrom(r), []);

  const decideAssignment: Ctx['decideAssignment'] = useCallback(async (id, to, reason) => {
    if (!repo) return;
    const a = data.assignments.find((x) => x.id === id);
    if (!a) return;
    await repo.put('assignments', {
      ...a, status: to, endDate: to === 'ended' ? today : a.endDate, notes: reason ?? a.notes
    });
    await writeAudit({
      action: `assignment.${to}`, objectType: 'assignment', objectId: id,
      summary: `Assignment ${id} ${to}` + (reason ? ` — ${reason}` : ''),
      before: a.status, after: to
    });
    if (to === 'active' || to === 'rejected') {
      await notify([{
        kind: 'assignment-created',
        title: to === 'active' ? 'Your assignment request was approved' : 'Your assignment request was declined',
        body: reason || `Request ${id} was ${to === 'active' ? 'approved' : 'declined'}.`,
        audienceRole: 'teacher', audienceId: a.teacherId, href: '/my-schools'
      }]);
    }
  }, [repo, data.assignments, today, writeAudit, notify]);

  /* ---------- reference data ---------- */

  const saveSubject: Ctx['saveSubject'] = useCallback(async (s) => {
    if (!repo) return;
    const id = s.id ?? nextId('SUB', data.subjects);
    await repo.put('subjects', { name: '', active: true, ...data.subjects.find((x) => x.id === id), ...s, id });
    await writeAudit({ action: 'subject.save', objectType: 'subject', objectId: id, summary: `Subject ${s.name ?? id} saved` });
  }, [repo, data.subjects, writeAudit]);

  const saveClass: Ctx['saveClass'] = useCallback(async (c) => {
    if (!repo) return;
    const id = c.id ?? nextId('CLS', data.classes);
    await repo.put('classes', {
      name: '', order: data.classes.length + 1, active: true,
      ...data.classes.find((x) => x.id === id), ...c, id
    });
    await writeAudit({ action: 'class.save', objectType: 'class', objectId: id, summary: `Class ${c.name ?? id} saved` });
  }, [repo, data.classes, writeAudit]);

  const saveAcademicSession: Ctx['saveAcademicSession'] = useCallback(async (a) => {
    if (!repo) return;
    const id = a.id ?? nextId('ACD', data.academicSessions);
    if (a.current) {
      await repo.putMany('academicSessions',
        data.academicSessions.map((x) => ({ ...x, current: x.id === id })));
    }
    await repo.put('academicSessions', {
      name: '', term: '', startDate: today, endDate: today, current: false,
      ...data.academicSessions.find((x) => x.id === id), ...a, id
    });
    await writeAudit({ action: 'academic.save', objectType: 'settings', objectId: id, summary: `Academic period ${a.name ?? id} saved` });
  }, [repo, data.academicSessions, today, writeAudit]);

  const saveDocument: Ctx['saveDocument'] = useCallback(async (d) => {
    if (!repo) return;
    const id = nextId('DOC', data.documents);
    await repo.put('documents', { ...d, id, uploadedBy: actor.displayName, uploadedAt: nowISO() });
    await writeAudit({ action: 'document.upload', objectType: 'document', objectId: id, summary: `Uploaded ${d.name}` });
  }, [repo, data.documents, actor, writeAudit]);

  const removeDocument: Ctx['removeDocument'] = useCallback(async (id) => {
    if (!repo) return;
    const d = data.documents.find((x) => x.id === id);
    await repo.remove('documents', id);
    await writeAudit({ action: 'document.remove', objectType: 'document', objectId: id, summary: `Removed ${d?.name ?? id}` });
  }, [repo, data.documents, writeAudit]);

  const saveSettings: Ctx['saveSettings'] = useCallback(async (s) => {
    if (!repo) return;
    await repo.saveSettings(s);
    await writeAudit({ action: 'settings.update', objectType: 'settings', objectId: 'config', summary: 'Organisation settings updated' });
  }, [repo, writeAudit]);

  /* ---------- notifications ---------- */

  const mine = useMemo(() => data.notifications.filter((n) =>
    n.audienceRole === actor.role &&
    (!n.audienceId || n.audienceId === actor.teacherId || n.audienceId === actor.schoolId)
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.notifications, actor]);

  const markNotificationsRead = useCallback(async () => {
    if (!repo) return;
    const unreadOnes = mine.filter((n) => !n.read);
    if (unreadOnes.length) await repo.putMany('notifications', unreadOnes.map((n) => ({ ...n, read: true })));
  }, [repo, mine]);

  const resetDemoData = useCallback(() => {
    try { sessionStorage.removeItem('glam_repo_v1'); } catch { /* private mode */ }
    window.location.reload();
  }, []);

  /* ---------- what is waiting on you ----------

     Every account type has a queue; they are just different queues. Reading
     them off live records rather than stored notifications means the bell and
     the module it points at can never disagree, and it works for an account
     that has never had a notification written for it. */

  const mySessions = useMemo(
    () => visibleSessions(actor, data.sessions), [actor, data.sessions]);

  const pendingItems = useMemo<PendingItem[]>(() => {
    const out: PendingItem[] = [];
    const sessionLine = (s: TeachingSession) =>
      `${s.subject} · ${s.className} · ${s.schoolName}`;

    /* BR-027 requests, from whichever side is being waited on. Read off the
       records rather than off stored notifications, so the bell and the queue
       it points at cannot disagree. */
    const requests = data.assignments.filter((a) => a.status === 'requested');
    const schoolName = (id: string) => data.schools.find((s) => s.id === id)?.name ?? id;
    const teacherName = (id: string) => data.teachers.find((t) => t.id === id)?.name ?? id;
    const covers = (a: Assignment) =>
      (a.subjects.join(', ') || 'Any subject') + ' · ' + (a.classes.join(', ') || 'any class');

    if (role === 'teacher') {
      for (const a of requests.filter((x) => x.teacherId === actor.teacherId)) {
        out.push({
          id: a.id, title: 'Request to teach at ' + schoolName(a.schoolId),
          detail: awaitingFrom(a), href: '/my-schools'
        });
      }
      for (const s of mySessions.filter(isPending)) {
        out.push({
          id: s.id, title: 'Waiting on the school', detail: sessionLine(s),
          href: '/sessions'
        });
      }
      for (const s of mySessions.filter(needsTeacherAction)) {
        out.push({
          id: s.id, title: s.status === 'rejected' ? 'Rejected — needs your attention' : 'Correction requested',
          detail: s.rejectionReason ?? s.correctionReason ?? sessionLine(s),
          href: '/sessions'
        });
      }
    } else if (role === 'school') {
      for (const a of requests.filter(
        (x) => x.schoolId === actor.schoolId && !x.schoolApprovedAt)) {
        out.push({
          id: a.id, title: 'Request to teach awaiting your approval',
          detail: teacherName(a.teacherId) + ' — ' + covers(a), href: '/dashboard'
        });
      }
      for (const s of mySessions.filter(isPending)) {
        out.push({
          id: s.id, title: 'Session awaiting your approval',
          detail: `${sessionLine(s)} — ${s.teacherName}`, href: '/approvals'
        });
      }
    } else {
      for (const a of requests.filter((x) => !x.adminApprovedAt)) {
        out.push({
          id: a.id, title: 'Request to teach awaiting Glampter',
          detail: teacherName(a.teacherId) + ' → ' + schoolName(a.schoolId), href: '/dashboard'
        });
      }
      for (const u of pendingSignups) {
        out.push({
          id: 'reg-' + u.uid, title: `${u.role === 'school' ? 'School' : 'Teacher'} registration`,
          detail: `${u.displayName || u.email} — awaiting approval`, href: '/dashboard'
        });
      }
      for (const a of adminRoster.filter((x) => x.status === 'pending')) {
        out.push({
          id: 'adm-' + a.id, title: 'Administrator registration',
          detail: `${a.name} — awaiting a super admin`, href: '/admin-manager'
        });
      }
      for (const u of deleteRequests) {
        out.push({
          id: 'del-' + u.uid, title: 'Account closure requested',
          detail: `${u.displayName || u.email} — ${u.deleteRequestReason ?? 'no reason given'}`,
          href: '/dashboard'
        });
      }
      for (const s of mySessions.filter(isPending)) {
        out.push({
          id: s.id, title: 'Session pending approval',
          detail: `${sessionLine(s)} — ${s.teacherName}`, href: '/approvals'
        });
      }
    }
    return out;
  }, [role, actor, data.assignments, data.schools, data.teachers,
      mySessions, pendingSignups, adminRoster, deleteRequests]);

  const value = useMemo<Ctx>(() => ({
    ready, source: repo?.kind ?? 'memory', data, today,
    mySessions,
    myNotifications: mine,
    unread: mine.filter((n) => !n.read).length,
    saveSession, reviewSession, resubmitSession, cancelSession,
    pendingItems, liveUsers, pendingSignups, deleteRequests,
    saveMyProfile, askToCloseMyAccount, askForApprovalAgain, signAssignment, awaiting,
    reviseMyAssignment, withdrawFromSchool,
    decideDeletion, decideRegistration,
    adminRoster, myAdmin, isSuperAdmin, adminIssue, setAdminStatus, promoteAdmin,
    saveTeacher, saveSchool, setAccountStatus, saveAssignment, decideAssignment,
    saveSubject, saveClass, saveAcademicSession, saveDocument, removeDocument, saveSettings,
    markNotificationsRead, resetDemoData
  }), [ready, repo, data, today, actor, mine, saveSession, reviewSession, resubmitSession,
    cancelSession, mySessions, pendingItems, liveUsers, pendingSignups, deleteRequests,
    saveMyProfile, askToCloseMyAccount, askForApprovalAgain, signAssignment, awaiting,
    reviseMyAssignment, withdrawFromSchool,
    decideDeletion, decideRegistration,
    adminRoster, myAdmin, isSuperAdmin, adminIssue, setAdminStatus, promoteAdmin,
    saveTeacher, saveSchool, setAccountStatus, saveAssignment, decideAssignment,
    saveSubject, saveClass, saveAcademicSession, saveDocument, removeDocument, saveSettings,
    markNotificationsRead, resetDemoData]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

/** The acting identity, for pages that need to scope a query. */
export function useActor(): UserProfile {
  const { profile, role } = useGlam();
  const { data } = useData();
  return useMemo(() => actorOf(profile, role, data), [profile, role, data]);
}
