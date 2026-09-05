/* Teach Clock — domain model.

   These interfaces are the contract between the in-memory repository and
   Firestore: both satisfy them, so nothing above lib/repo.ts knows or cares
   which one is running. Documents live under orgs/{orgId}/… ; the only
   top-level collection is users/{uid}. */

export type Role = 'teacher' | 'school' | 'admin';
export type AccountStatus = 'pending' | 'active' | 'suspended' | 'rejected';

/** Administrators come in two grades. Only a super admin governs other admins. */
export type AdminLevel = 'standard' | 'super';

/** users/{uid} — the identity record, written at registration. */
export type UserProfile = {
  uid: string;
  role: Role;
  status: AccountStatus;
  orgId: string;
  teacherId?: string;
  schoolId?: string;
  displayName: string;
  /* Captured as parts at registration. displayName stays the single rendered
     name — the school's own name on a school account — so nothing downstream
     needs to know the account was collected in pieces. */
  firstName?: string;
  surname?: string;
  /* School accounts: the administrator who owns the login. */
  contactFirstName?: string;
  contactSurname?: string;
  /* Admin accounts only. users/{uid} is the source of truth for a live
     administrator — the org roster is demo data — so the profile carries the
     whole grade, not just a hint of it. */
  adminLevel?: AdminLevel;
  adminId?: string;
  /** Who granted super status. BR-023 reads this to refuse acting on them. */
  promotedBy?: string;
  /** The first administrator ever registered. BR-024 makes them untouchable. */
  founder?: boolean;
  /* Closing an account is a request, not an action: the holder asks, a super
     admin decides. BR-025. */
  deleteRequestedAt?: string;
  deleteRequestReason?: string;
  deletedAt?: string;
  email: string;
  phone: string;
  photoURL?: string;
  createdAt: string;
  updatedAt?: string;
};

/** orgs/{orgId}/admins/{id} — the firm's own staff, and the queue of people
    asking to join it. Kept beside Teacher and School because it is the same
    kind of record: an account the firm decides to let transact. */
export type AdminAccount = {
  id: string;                  // ADM-000101
  /** Set once the person's users/{uid} login is linked to this record. */
  uid?: string;
  name: string;
  firstName?: string;
  surname?: string;
  email: string;
  phone: string;
  level: AdminLevel;
  status: AccountStatus;
  /** The super admin who granted this account its super status. A super admin
      can never freeze or deactivate whoever promoted them. */
  promotedBy?: string;
  /** The first administrator on the platform. Immune to freeze and deactivate,
      so the org can never be locked out of its own administration. */
  founder?: boolean;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
};

export type Teacher = {
  id: string;                 // TCH-000123
  uid?: string;
  name: string;
  email: string;
  phone: string;
  subjects: string[];
  qualification: string;
  experienceYears?: number;
  hourlyRate: number;         // naira — what the firm pays
  joined: string;
  status: AccountStatus;
  notes?: string;
};

export type School = {
  id: string;                 // SCH-000054
  uid?: string;
  name: string;
  shortName: string;
  address: string;
  city: string;
  contact: string;
  email: string;
  phone: string;
  hourlyRate: number;         // naira — what the school is billed
  contractedHours: number;    // per calendar month
  openTime?: string;
  closeTime?: string;
  status: AccountStatus;
  notes?: string;
};

export type Assignment = {
  id: string;                 // ASN-000411
  teacherId: string;
  schoolId: string;
  subjects: string[];
  classes: string[];
  startDate: string;
  endDate?: string;
  assignedBy: string;
  /** requested → active once BOTH sides below have signed off. */
  status: 'requested' | 'active' | 'ended' | 'rejected';
  /* BR-027: a teacher joining a school is two decisions, not one — the school
     accepts them into the building, and the firm accepts the placement. Each
     is stamped separately and the assignment is only active with both. */
  schoolApprovedAt?: string;
  schoolApprovedBy?: string;
  adminApprovedAt?: string;
  adminApprovedBy?: string;
  origin: 'admin' | 'teacher-request' | 'school-request';
  notes?: string;
  createdAt: string;
};

export type LifecycleState =
  | 'assigned' | 'scheduled' | 'taught' | 'submitted'
  | 'verified' | 'approved' | 'reported' | 'billed';

export type SessionStatus =
  | 'draft' | 'submitted' | 'pending' | 'approved'
  | 'rejected' | 'correction' | 'resubmitted' | 'cancelled';

/** The atomic object: a teaching session moving through verification. */
export type TeachingSession = {
  id: string;                 // TS-000928
  teacherId: string;
  teacherName: string;
  schoolId: string;
  schoolName: string;
  subject: string;
  className: string;
  academicSessionId?: string;
  date: string;               // YYYY-MM-DD
  startTime: string;          // HH:MM
  endTime: string;            // HH:MM
  durationMinutes: number;    // always derived from the times, never typed
  periods: number;
  topic: string;
  teachingType: 'regular' | 'revision' | 'remedial' | 'exam-prep' | 'extra';
  status: SessionStatus;
  teacherComment?: string;
  schoolComment?: string;
  rejectionReason?: string;
  correctionReason?: string;
  cancelReason?: string;
  submittedAt?: string;
  /* BR-028: a period is validated service only once the school confirms it
     happened AND the firm accepts it. Same two-key shape as an assignment. */
  schoolApprovedAt?: string;
  schoolApprovedBy?: string;
  adminApprovedAt?: string;
  adminApprovedBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  flags?: SessionFlag[];
  /** Prior versions kept whenever a record is corrected — BR-006. */
  revisions?: SessionRevision[];
  createdAt: string;
  updatedAt: string;
};

export type SessionFlag = {
  kind: 'duplicate' | 'overlap' | 'long-day' | 'outside-hours' | 'late-submission';
  detail: string;
};

export type SessionRevision = {
  at: string;
  by: string;
  reason: string;
  before: Partial<TeachingSession>;
};

export type Subject = { id: string; name: string; active: boolean };

export type ClassLevel = {
  id: string; name: string; schoolId?: string; order: number; active: boolean;
};

export type AcademicSession = {
  id: string; name: string; term: string;
  startDate: string; endDate: string; current: boolean;
};

export type NotificationKind =
  | 'session-submitted' | 'session-approved' | 'session-rejected'
  | 'session-correction' | 'session-resubmitted'
  | 'account-approved' | 'assignment-created' | 'assignment-requested'
  | 'registration-received' | 'stale-approval'
  | 'account-delete-requested';

export type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Who should see it: a role, or a specific teacher/school. */
  audienceRole: Role;
  audienceId?: string;
  href?: string;
  read: boolean;
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  actorRole: Role;
  action: string;
  objectType: 'session' | 'teacher' | 'school' | 'admin' | 'assignment' | 'subject' | 'class' | 'settings' | 'document' | 'account';
  objectId: string;
  summary: string;
  before?: string;
  after?: string;
};

export type DocumentMeta = {
  id: string;
  name: string;
  kind: 'certificate' | 'identification' | 'cv' | 'contract' | 'agreement' | 'other';
  ownerType: 'teacher' | 'school' | 'org';
  ownerId: string;
  sizeBytes: number;
  mime: string;
  uploadedBy: string;
  uploadedAt: string;
  /** Storage path when Firebase Storage is configured; blank in demo mode. */
  storagePath?: string;
};

export type OrgSettings = {
  orgName: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  timezone: string;
  currency: string;
  periodMinutes: number;        // one standard teaching period
  approvalSlaHours: number;     // pending beyond this is an exception
  maxDailyHours: number;        // above this a session is flagged
  schoolOpen: string;
  schoolClose: string;
  lateSubmissionDays: number;
  requireEvidence: boolean;
  allowTeacherRequests: boolean;
};

export type NavStatus = 'live' | 'soon';
