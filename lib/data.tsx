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
import { emptyCollections, makeRepo, nextId, type Collections, type Repo } from './repo';
import {
  DEFAULT_SETTINGS, adminActionIssue, canManageAdmins, canReview, canTransition,
  detectFlags, durationOf, periodsOf, validateSession, visibleSessions,
  type AdminAction, type Issue, type SessionDraft
} from './rules';
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

const DataCtx = createContext<Ctx | null>(null);

export const useData = () => {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData must be used inside <DataProvider>');
  return c;
};

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
    email: '', phone: '', createdAt: nowISO()
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { profile, role, stage, preview, say } = useGlam();
  const [repo, setRepo] = useState<Repo | null>(null);
  const [data, setData] = useState<Collections>(EMPTY);
  const [ready, setReady] = useState(false);

  /* Firestore once an approved account is in session; otherwise the in-memory
     repository, so the whole product is operable in preview. */
  useEffect(() => {
    if (stage === 'loading') return;
    const r = makeRepo(stage === 'ready');
    setRepo(r);
    const unsub = r.subscribe((c) => { setData(c); setReady(true); });
    void r.load().then((c) => { setData(c); setReady(true); });
    return unsub;
  }, [stage]);

  const today = data.settings ? todayISO(data.settings.timezone) : todayISO();
  const actor = useMemo(() => actorOf(profile, role, data), [profile, role, data]);

  /* ---------- write helpers ---------- */

  const writeAudit = useCallback(async (
    entry: Omit<AuditEntry, 'id' | 'at' | 'actor' | 'actorRole'>
  ) => {
    if (!repo) return;
    await repo.put('auditLogs', {
      ...entry,
      id: nextId('AUD', data.auditLogs),
      at: nowISO(),
      actor: actor.displayName,
      actorRole: actor.role
    });
  }, [repo, data.auditLogs, actor]);

  const notify = useCallback(async (
    items: Omit<Notification, 'id' | 'read' | 'createdAt'>[]
  ) => {
    if (!repo || !items.length) return;
    const base = data.notifications;
    await repo.putMany('notifications', items.map((n, i) => ({
      ...n,
      id: nextId('NTF', [...base, ...Array.from({ length: i }, (_, k) => ({ id: `NTF-${k}` }))]),
      read: false,
      createdAt: nowISO()
    })));
  }, [repo, data.notifications]);

  /* ---------- sessions ---------- */

  const saveSession: Ctx['saveSession'] = useCallback(async (draft, opts = {}) => {
    if (!repo) return { ok: false, issues: [] };
    const issues = validateSession(draft, { assignments: data.assignments, settings: data.settings, today });
    if (issues.length) return { ok: false, issues };

    const teacher = data.teachers.find((t) => t.id === draft.teacherId);
    const school = data.schools.find((s) => s.id === draft.schoolId);
    const existing = opts.id ? data.sessions.find((s) => s.id === opts.id) : undefined;
    const minutes = durationOf(draft.startTime, draft.endTime);
    const id = opts.id ?? nextId('TS', data.sessions);
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

  const myAdmin = useMemo<AdminAccount | null>(() => {
    if (role !== 'admin') return null;
    const linked = profile?.uid ? data.admins.find((a) => a.uid === profile.uid) : undefined;
    if (linked) return linked;
    /* Preview has no account at all, so it stands in as the founder — that is
       what makes the module reviewable before anyone has registered. A real
       signed-in admin with no linked record deliberately gets nothing. */
    return preview ? (data.admins.find((a) => a.founder) ?? null) : null;
  }, [role, profile, preview, data.admins]);

  const isSuperAdmin = canManageAdmins(myAdmin);

  const adminIssue: Ctx['adminIssue'] = useCallback(
    (target, action) => adminActionIssue(myAdmin, target, action), [myAdmin]);

  const setAdminStatus: Ctx['setAdminStatus'] = useCallback(async (id, status, reason) => {
    if (!repo) return false;
    const target = data.admins.find((a) => a.id === id);
    if (!target) return false;

    const action: AdminAction =
      status === 'active' ? (target.status === 'pending' ? 'approve' : 'reactivate')
        : status === 'suspended' ? 'suspend' : 'deactivate';

    const issue = adminActionIssue(myAdmin, target, action);
    if (issue) { say(issue); return false; }

    const next: AdminAccount = {
      ...target, status, updatedAt: nowISO(), ...(reason ? { notes: reason } : {})
    };
    await repo.put('admins', next);
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
  }, [repo, data.admins, myAdmin, writeAudit, say]);

  const promoteAdmin: Ctx['promoteAdmin'] = useCallback(async (id) => {
    if (!repo) return false;
    const target = data.admins.find((a) => a.id === id);
    if (!target || !myAdmin) return false;

    const issue = adminActionIssue(myAdmin, target, 'promote');
    if (issue) { say(issue); return false; }

    /* promotedBy is the whole of BR-023: it is what later stops this account
       from freezing the person who granted it. */
    await repo.put('admins', {
      ...target, level: 'super', promotedBy: myAdmin.id, updatedAt: nowISO()
    });
    await writeAudit({
      action: 'admin.promote', objectType: 'admin', objectId: id,
      summary: `${target.name} promoted to super admin by ${myAdmin.name}`,
      before: 'standard', after: 'super'
    });
    say(`${target.name} is now a super admin.`);
    return true;
  }, [repo, data.admins, myAdmin, writeAudit, say]);

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
    const id = a.id ?? nextId('ASN', data.assignments);
    const existing = data.assignments.find((x) => x.id === id);
    const rec: Assignment = {
      teacherId: '', schoolId: '', subjects: [], classes: [], startDate: today,
      assignedBy: actor.displayName, origin: 'admin', status: 'active', createdAt: nowISO(),
      ...existing, ...a, id
    };
    await repo.put('assignments', rec);
    const teacher = data.teachers.find((t) => t.id === rec.teacherId);
    const school = data.schools.find((s) => s.id === rec.schoolId);
    await writeAudit({
      action: existing ? 'assignment.update' : 'assignment.create',
      objectType: 'assignment', objectId: id,
      summary: `${teacher?.name ?? rec.teacherId} → ${school?.name ?? rec.schoolId} (${rec.subjects.join(', ') || 'all subjects'})`
    });
    if (!existing && rec.status === 'active') {
      await notify([{
        kind: 'assignment-created', title: 'You have a new school assignment',
        body: `You are assigned to ${school?.name ?? 'a school'} from ${rec.startDate}.`,
        audienceRole: 'teacher', audienceId: rec.teacherId, href: '/my-schools'
      }]);
    }
    if (!existing && rec.status === 'requested') {
      await notify([{
        kind: 'assignment-requested', title: 'Assignment request',
        body: `${teacher?.name ?? 'A teacher'} asked to teach at ${school?.name ?? 'a school'}.`,
        audienceRole: 'admin', href: '/assignments'
      }]);
    }
    return id;
  }, [repo, data.assignments, data.teachers, data.schools, today, actor, writeAudit, notify]);

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

  const value = useMemo<Ctx>(() => ({
    ready, source: repo?.kind ?? 'memory', data, today,
    mySessions: visibleSessions(actor, data.sessions),
    myNotifications: mine,
    unread: mine.filter((n) => !n.read).length,
    saveSession, reviewSession, resubmitSession, cancelSession,
    myAdmin, isSuperAdmin, adminIssue, setAdminStatus, promoteAdmin,
    saveTeacher, saveSchool, setAccountStatus, saveAssignment, decideAssignment,
    saveSubject, saveClass, saveAcademicSession, saveDocument, removeDocument, saveSettings,
    markNotificationsRead, resetDemoData
  }), [ready, repo, data, today, actor, mine, saveSession, reviewSession, resubmitSession,
    cancelSession, myAdmin, isSuperAdmin, adminIssue, setAdminStatus, promoteAdmin,
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
