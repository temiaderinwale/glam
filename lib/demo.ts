/* Teach Clock — demo dataset.
   Deterministic: one seeded PRNG, no Date.now() inside generation, so every
   render and every reviewer sees the same numbers. Typed against lib/types.ts,
   which is also the shape of the Firestore documents in Phase 2 — swapping the
   source is a data-layer change and nothing above it moves.

   The dataset is anchored to a fixed "today" so the figures never drift. */

import { DEFAULT_SETTINGS } from './rules';
import type {
  AcademicSession, AdminAccount, Assignment, AuditEntry, ClassLevel, DocumentMeta,
  Notification, School, SessionStatus, Subject, Teacher, TeachingSession
} from './types';
import type { Collections } from './repo';

/** Anchor date. Everything ("today", "this week") is computed against this. */
export const TODAY = '2026-08-25';

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260825);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

/* Fisher–Yates, and it has to be: a sort() comparator that returns a random
   value draws an engine-dependent number of times — Node and V8-in-the-browser
   disagree — which shifts every later draw and hands the server and the client
   two different datasets, i.e. a hydration mismatch. This always draws exactly
   n − 1 times, so the stream stays in step everywhere. */
function shuffle<T>(a: readonly T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pad = (n: number, w = 6) => String(n).padStart(w, '0');
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function shiftDays(base: string, days: number) {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

export const SUBJECTS = [
  'Mathematics', 'English Language', 'Physics', 'Chemistry', 'Biology',
  'Further Mathematics', 'Computer Science', 'Economics'
];

export const CLASSES = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'];

export const TOPICS: Record<string, string[]> = {
  'Mathematics': ['Quadratic equations', 'Surds', 'Bearings', 'Mensuration', 'Logarithms'],
  'English Language': ['Comprehension', 'Lexis and structure', 'Summary writing', 'Oral English'],
  'Physics': ['Motion', 'Waves', 'Electric fields', 'Heat energy', 'Simple harmonic motion'],
  'Chemistry': ['Mole concept', 'Chemical bonding', 'Rates of reaction', 'Electrolysis'],
  'Biology': ['Ecology', 'Genetics', 'Nutrition', 'Circulatory system'],
  'Further Mathematics': ['Matrices', 'Vectors', 'Differentiation', 'Binomial expansion'],
  'Computer Science': ['Spreadsheet formulas', 'Program flowcharts', 'Number bases', 'Networking basics'],
  'Economics': ['Demand and supply', 'Market structures', 'National income', 'Money and inflation']
};

/* ---------- Schools: Abeokuta / Ogun State ---------- */
export const schools: School[] = [
  {
    id: 'SCH-000012', name: 'BMS Montessori School', shortName: 'BMS Montessori',
    address: '14 Quarry Road, Iporo-Ake', city: 'Abeokuta', contact: 'Mrs. Folake Adeyemi',
    email: 'admin@bmsmontessori.ng', phone: '0803 412 7788',
    hourlyRate: 5000, contractedHours: 120, openTime: '07:30', closeTime: '16:00', status: 'active'
  },
  {
    id: 'SCH-000018', name: 'Grace Academy', shortName: 'Grace Academy',
    address: '7 Oke-Ilewo Crescent', city: 'Abeokuta', contact: 'Mr. Tunde Bakare',
    email: 'office@graceacademy.ng', phone: '0806 331 2094',
    hourlyRate: 4500, contractedHours: 90, openTime: '08:00', closeTime: '15:30', status: 'active'
  },
  {
    id: 'SCH-000024', name: 'Ake Comprehensive College', shortName: 'Ake Comprehensive',
    address: 'Km 3 Ibadan Road, Ake', city: 'Abeokuta', contact: 'Dr. Nkechi Obi',
    email: 'principal@akecollege.ng', phone: '0810 776 5521',
    hourlyRate: 5500, contractedHours: 150, openTime: '07:00', closeTime: '17:00', status: 'active'
  },
  {
    id: 'SCH-000031', name: 'Sagamu International School', shortName: 'Sagamu International',
    address: '22 Akarigbo Street', city: 'Sagamu', contact: 'Mr. Segun Ilesanmi',
    email: 'hello@sagamuintl.ng', phone: '0805 220 4417',
    hourlyRate: 6000, contractedHours: 80, openTime: '08:00', closeTime: '16:00', status: 'active'
  },
  {
    id: 'SCH-000037', name: 'Olumo Heights Academy', shortName: 'Olumo Heights',
    address: '5 Olumo Rock Way, Ikija', city: 'Abeokuta', contact: 'Mrs. Bisi Ogunleye',
    email: 'contact@olumoheights.ng', phone: '0813 908 6612',
    hourlyRate: 4800, contractedHours: 60, openTime: '07:30', closeTime: '15:00', status: 'active'
  }
];

/* ---------- Teachers ---------- */
const teacherSeed: [string, string[], string, number][] = [
  ['John Adeyinka', ['Physics', 'Further Mathematics'], 'B.Ed Physics, UNILAG', 3200],
  ['Jane Okonkwo', ['English Language'], 'B.A English, OAU', 3000],
  ['Peter Balogun', ['Mathematics', 'Further Mathematics'], 'B.Sc Mathematics, FUNAAB', 3400],
  ['Amaka Eze', ['Biology', 'Chemistry'], 'B.Sc Biochemistry, UI', 3100],
  ['Ibrahim Suleiman', ['Chemistry'], 'M.Sc Chemistry, ABU', 3600],
  ['Grace Oyelaran', ['Computer Science'], 'B.Sc Computer Science, Covenant', 3500],
  ['Samuel Adeoti', ['Economics'], 'B.Sc Economics, OOU', 2900],
  ['Halima Yusuf', ['Mathematics', 'Physics'], 'B.Ed Mathematics, FUNAAB', 3300]
];

export const teachers: Teacher[] = teacherSeed.map((t, i) => ({
  id: `TCH-${pad(101 + i * 7)}`,
  name: t[0],
  email: t[0].toLowerCase().replace(/[^a-z]+/g, '.') + '@glampter.ng',
  phone: `080${between(2, 9)} ${between(100, 999)} ${between(1000, 9999)}`,
  subjects: t[1],
  qualification: t[2],
  experienceYears: 3 + (i % 9),
  hourlyRate: t[3],
  joined: shiftDays(TODAY, -between(120, 700)),
  status: 'active'
}));

/** The signed-in teacher in the Teacher dashboard preview. */
export const CURRENT_TEACHER_ID = teachers[0].id;
/** The signed-in school in the School dashboard preview. */
export const CURRENT_SCHOOL_ID = schools[0].id;

/* ---------- Assignments: each teacher serves 2–3 schools ---------- */
export const assignments: Assignment[] = (() => {
  const out: Assignment[] = [];
  let n = 401;
  teachers.forEach((t, ti) => {
    const count = ti === 0 ? 3 : between(2, 3);
    const shuffled = shuffle(schools).slice(0, count);
    shuffled.forEach((s) => {
      const start = shiftDays(TODAY, -between(90, 300));
      out.push({
        id: `ASN-${pad(n++)}`,
        teacherId: t.id,
        schoolId: s.id,
        subjects: t.subjects,
        classes: [pick(CLASSES), pick(CLASSES)].filter((v, i, a) => a.indexOf(v) === i),
        startDate: start,
        assignedBy: 'Glampter Operations',
        origin: 'admin',
        status: 'active',
        createdAt: `${start}T09:00:00`
      });
    });
  });
  return out;
})();

/* ---------- Sessions: ~120 across the last 60 days ---------- */
const STATUS_MIX: SessionStatus[] = [
  ...Array(78).fill('approved'),
  ...Array(14).fill('pending'),
  ...Array(5).fill('rejected'),
  ...Array(3).fill('correction')
] as SessionStatus[];

const REJECTIONS = [
  'The class ended at 11:00 AM, not 12:00 PM.',
  'This period was covered by our own staff.',
  'No record of this class on the day timetable.'
];

const CORRECTIONS = [
  'Duration looks longer than the timetabled period — please check.',
  'Class recorded as SS2; register shows SS1.'
];

export const sessions: TeachingSession[] = (() => {
  const out: TeachingSession[] = [];
  let n = 801;
  for (let day = 59; day >= 0; day--) {
    const date = shiftDays(TODAY, -day);
    const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
    if (weekday === 0 || weekday === 6) continue;           // schools sit Mon–Fri
    const perDay = between(1, 4);
    for (let k = 0; k < perDay; k++) {
      const asn = assignments[Math.floor(rnd() * assignments.length)];
      const teacher = teachers.find((t) => t.id === asn.teacherId)!;
      const school = schools.find((s) => s.id === asn.schoolId)!;
      const subject = pick(asn.subjects);
      const startHour = between(8, 13);
      const lengthH = pick([1, 2, 2, 3]);
      const start = `${String(startHour).padStart(2, '0')}:00`;
      const end = `${String(startHour + lengthH).padStart(2, '0')}:00`;

      let status: SessionStatus = STATUS_MIX[Math.floor(rnd() * STATUS_MIX.length)];
      /* Anything from the last two days is still moving through review — a
         realistic queue is what makes the school dashboard worth looking at. */
      if (day <= 1) status = rnd() < 0.65 ? 'pending' : status;
      if (day > 45 && status === 'pending') status = 'approved';

      const submittedAt = `${date}T${String(startHour + lengthH).padStart(2, '0')}:${between(10, 55)}:00`;

      out.push({
        id: `TS-${pad(n++)}`,
        teacherId: teacher.id,
        teacherName: teacher.name,
        schoolId: school.id,
        schoolName: school.name,
        subject,
        className: pick(asn.classes),
        date,
        startTime: start,
        endTime: end,
        durationMinutes: lengthH * 60,
        periods: Math.round((lengthH * 60) / 45),
        topic: pick(TOPICS[subject] || ['General revision']),
        teachingType: pick(['regular', 'regular', 'revision', 'remedial', 'exam-prep'] as const),
        status,
        submittedAt,
        reviewedAt: status === 'approved' || status === 'rejected'
          ? `${shiftDays(date, 1)}T09:${between(10, 55)}:00` : undefined,
        reviewedBy: status === 'approved' || status === 'rejected' ? school.contact : undefined,
        rejectionReason: status === 'rejected' ? pick(REJECTIONS) : undefined,
        correctionReason: status === 'correction' ? pick(CORRECTIONS) : undefined,
        flags: rnd() < 0.035
          ? [{ kind: pick(['duplicate', 'overlap', 'long-day'] as const),
               detail: 'Flagged automatically on submission — review before approving.' }]
          : undefined,
        createdAt: submittedAt,
        updatedAt: submittedAt
      });
    }
  }
  /* Give the default teacher enough of their own history for the dashboard to
     read as a real week rather than a scatter. */
  return out;
})();

export const findTeacher = (id: string) => teachers.find((t) => t.id === id);
export const findSchool = (id: string) => schools.find((s) => s.id === id);

/* ---------- reference data ---------- */

export const subjects: Subject[] = SUBJECTS.map((name, i) => ({
  id: `SUB-${pad(i + 1, 4)}`, name, active: true
}));

export const classes: ClassLevel[] = CLASSES.map((name, i) => ({
  id: `CLS-${pad(i + 1, 4)}`, name, order: i + 1, active: true
}));

export const academicSessions: AcademicSession[] = [
  { id: 'ACD-0001', name: '2025/2026', term: 'Third Term',
    startDate: '2026-04-20', endDate: '2026-07-24', current: false },
  { id: 'ACD-0002', name: '2026/2027', term: 'First Term',
    startDate: '2026-08-10', endDate: '2026-12-11', current: true }
];

/* Three teachers and two schools waiting on the administrator — the queue that
   makes the admin dashboard's "needs attention" band real rather than a count. */
export const pendingTeachers: Teacher[] = [
  ['Kemi Adewale', ['Mathematics'], 'B.Sc Mathematics, LASU', 3000],
  ['Tobi Fashola', ['English Language'], 'B.A English, UNILORIN', 2900],
  ['Chidi Nwosu', ['Chemistry', 'Biology'], 'B.Sc Industrial Chemistry, FUTA', 3200]
].map((t, i) => ({
  id: `TCH-${pad(200 + i * 3)}`,
  name: t[0] as string,
  email: (t[0] as string).toLowerCase().replace(/[^a-z]+/g, '.') + '@glampter.ng',
  phone: `0807 ${between(100, 999)} ${between(1000, 9999)}`,
  subjects: t[1] as string[],
  qualification: t[2] as string,
  experienceYears: 2 + i,
  hourlyRate: t[3] as number,
  joined: shiftDays(TODAY, -(i + 1) * 2),
  status: 'pending' as const
}));

export const pendingSchools: School[] = [
  {
    id: 'SCH-000044', name: 'Redeemed Heights College', shortName: 'Redeemed Heights',
    address: '3 Ibara Housing Estate', city: 'Abeokuta', contact: 'Pastor Dele Ajayi',
    email: 'admin@redeemedheights.ng', phone: '0802 554 1123',
    hourlyRate: 5000, contractedHours: 70, openTime: '07:30', closeTime: '15:30', status: 'pending'
  },
  {
    id: 'SCH-000051', name: 'Ijebu Model Academy', shortName: 'Ijebu Model',
    address: '18 Folagbade Street', city: 'Ijebu-Ode', contact: 'Mrs. Ronke Salami',
    email: 'office@ijebumodel.ng', phone: '0809 233 8890',
    hourlyRate: 4600, contractedHours: 55, openTime: '08:00', closeTime: '15:00', status: 'pending'
  }
];

/** Teacher requests awaiting an administrator decision — the Option B workflow. */
export const requestedAssignments: Assignment[] = [
  {
    id: 'ASN-000480', teacherId: teachers[3].id, schoolId: schools[4].id,
    subjects: ['Biology'], classes: ['SS1', 'SS2'],
    startDate: shiftDays(TODAY, 3), assignedBy: teachers[3].name,
    origin: 'teacher-request', status: 'requested',
    notes: 'I already cover Chemistry nearby on Tuesdays and Thursdays.',
    createdAt: `${shiftDays(TODAY, -2)}T11:20:00`
  }
];

export const documents: DocumentMeta[] = [
  { id: 'DOC-000001', name: 'John Adeyinka — B.Ed certificate.pdf', kind: 'certificate',
    ownerType: 'teacher', ownerId: teachers[0].id, sizeBytes: 482_113, mime: 'application/pdf',
    uploadedBy: 'Glampter Operations', uploadedAt: `${shiftDays(TODAY, -120)}T10:12:00` },
  { id: 'DOC-000002', name: 'John Adeyinka — NYSC discharge.pdf', kind: 'identification',
    ownerType: 'teacher', ownerId: teachers[0].id, sizeBytes: 301_882, mime: 'application/pdf',
    uploadedBy: 'Glampter Operations', uploadedAt: `${shiftDays(TODAY, -120)}T10:14:00` },
  { id: 'DOC-000003', name: 'BMS Montessori — service agreement 2026.pdf', kind: 'agreement',
    ownerType: 'school', ownerId: schools[0].id, sizeBytes: 743_220, mime: 'application/pdf',
    uploadedBy: 'Glampter Operations', uploadedAt: `${shiftDays(TODAY, -60)}T15:40:00` },
  { id: 'DOC-000004', name: 'Ake Comprehensive — contract addendum.pdf', kind: 'contract',
    ownerType: 'school', ownerId: schools[2].id, sizeBytes: 219_004, mime: 'application/pdf',
    uploadedBy: 'Glampter Operations', uploadedAt: `${shiftDays(TODAY, -31)}T09:05:00` }
];

/** A short opening audit trail, so the log is never an empty page on first run. */
export const auditLogs: AuditEntry[] = sessions
  .filter((s) => s.status === 'approved')
  .slice(0, 12)
  .map((s, i) => ({
    id: `AUD-${pad(i + 1)}`,
    at: s.reviewedAt || s.submittedAt || `${s.date}T10:00:00`,
    actor: s.reviewedBy || 'Glampter Operations',
    actorRole: 'school' as const,
    action: 'session.approve',
    objectType: 'session' as const,
    objectId: s.id,
    summary: `Approved ${s.subject} · ${s.className} (${(s.durationMinutes / 60).toFixed(1)} hrs) at ${s.schoolName}`,
    before: 'pending',
    after: 'approved'
  }));

export const notifications: Notification[] = [
  {
    id: 'NTF-000001', kind: 'registration-received',
    title: 'Three teacher registrations awaiting review',
    body: 'Kemi Adewale, Tobi Fashola and Chidi Nwosu have registered and need approval.',
    audienceRole: 'admin', href: '/teachers', read: false,
    createdAt: `${shiftDays(TODAY, -1)}T08:30:00`
  },
  {
    id: 'NTF-000002', kind: 'assignment-requested',
    title: 'Assignment request from Amaka Eze',
    body: 'Amaka Eze has asked to teach Biology at Olumo Heights Academy.',
    audienceRole: 'admin', href: '/assignments', read: false,
    createdAt: `${shiftDays(TODAY, -2)}T11:20:00`
  },
  {
    id: 'NTF-000003', kind: 'session-submitted',
    title: 'New teaching session submitted',
    body: 'John Adeyinka submitted a 3-hour Physics session for SS2.',
    audienceRole: 'school', audienceId: CURRENT_SCHOOL_ID, href: '/approvals', read: false,
    createdAt: `${TODAY}T12:05:00`
  },
  {
    id: 'NTF-000004', kind: 'session-rejected',
    title: 'A session needs your correction',
    body: 'BMS Montessori School asked you to correct the times on one session.',
    audienceRole: 'teacher', audienceId: CURRENT_TEACHER_ID, href: '/sessions', read: false,
    createdAt: `${shiftDays(TODAY, -1)}T16:40:00`
  }
];

/** The starting dataset, assembled once. Every repository begins here. */
/* ---------- Administrators ----------
   Hardcoded, never drawn from the PRNG: taking draws here would shift every
   later value in the stream and change the whole dataset. */
export const admins: AdminAccount[] = [
  {
    id: 'ADM-000101', name: 'Bola Adeyemo', firstName: 'Bola', surname: 'Adeyemo',
    email: 'bola.adeyemo@glampter.ng', phone: '0803 200 1101',
    level: 'super', status: 'active', founder: true,
    createdAt: `${shiftDays(TODAY, -640)}T09:00:00`
  },
  {
    id: 'ADM-000102', name: 'Yemi Ogunleye', firstName: 'Yemi', surname: 'Ogunleye',
    email: 'yemi.ogunleye@glampter.ng', phone: '0806 200 1102',
    level: 'super', status: 'active', promotedBy: 'ADM-000101',
    createdAt: `${shiftDays(TODAY, -410)}T10:20:00`
  },
  {
    id: 'ADM-000103', name: 'Chidi Okafor', firstName: 'Chidi', surname: 'Okafor',
    email: 'chidi.okafor@glampter.ng', phone: '0810 200 1103',
    level: 'standard', status: 'active',
    createdAt: `${shiftDays(TODAY, -180)}T11:05:00`
  },
  {
    id: 'ADM-000104', name: 'Ngozi Uche', firstName: 'Ngozi', surname: 'Uche',
    email: 'ngozi.uche@glampter.ng', phone: '0805 200 1104',
    level: 'standard', status: 'pending',
    createdAt: `${shiftDays(TODAY, -3)}T08:40:00`
  },
  {
    id: 'ADM-000105', name: 'Musa Danjuma', firstName: 'Musa', surname: 'Danjuma',
    email: 'musa.danjuma@glampter.ng', phone: '0802 200 1105',
    level: 'standard', status: 'suspended',
    createdAt: `${shiftDays(TODAY, -95)}T14:15:00`,
    notes: 'Frozen pending a records review.'
  }
];

export function seed(): Collections {
  return {
    admins,
    teachers: [...teachers, ...pendingTeachers],
    schools: [...schools, ...pendingSchools],
    assignments: [...assignments, ...requestedAssignments],
    sessions,
    subjects,
    classes,
    academicSessions,
    notifications,
    auditLogs,
    documents,
    settings: DEFAULT_SETTINGS
  };
}
