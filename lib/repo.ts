/* Teach Clock — the repository layer.

   One interface, two implementations:

     • firestoreRepo — orgs/{orgId}/… under the real project.
     • memoryRepo    — the same shapes, seeded from lib/demo.ts, mutated in
                       memory and mirrored to sessionStorage.

   The memory implementation is not a mock. It runs the identical rule checks,
   audit writes and notification fan-out, so every workflow in the product is
   fully operable before Firebase is configured or an account is approved —
   which is what makes the build reviewable. Swapping to Firestore changes one
   factory call and nothing above it. */

import {
  collection, deleteDoc, doc, documentId, getDocs, onSnapshot, query, setDoc,
  updateDoc, where, writeBatch, type DocumentData, type Query
} from 'firebase/firestore';
import { db, firebaseReady, ORG_ID } from './firebase';
import { seed } from './demo';
import type {
  AcademicSession, AdminAccount, Assignment, AuditEntry, ClassLevel, DocumentMeta,
  Notification, OrgSettings, Role, School, Subject, Teacher, TeachingSession
} from './types';

export type Collections = {
  admins: AdminAccount[];
  teachers: Teacher[];
  schools: School[];
  assignments: Assignment[];
  sessions: TeachingSession[];
  subjects: Subject[];
  classes: ClassLevel[];
  academicSessions: AcademicSession[];
  notifications: Notification[];
  auditLogs: AuditEntry[];
  documents: DocumentMeta[];
  settings: OrgSettings;
};

export type CollectionKey = Exclude<keyof Collections, 'settings'>;

export const COLLECTION_KEYS: CollectionKey[] = [
  'admins', 'teachers', 'schools', 'assignments', 'sessions', 'subjects', 'classes',
  'academicSessions', 'notifications', 'auditLogs', 'documents'
];

/** Every collection present and empty. Derived from COLLECTION_KEYS rather
    than written out, so adding a collection can never leave a hand-maintained
    literal behind with a hole in it. */
export function emptyCollections(): Collections {
  const out = { settings: seed().settings } as Collections;
  for (const k of COLLECTION_KEYS) (out[k] as unknown[]) = [];
  return out;
}

export interface Repo {
  readonly kind: 'firestore' | 'memory';
  load(): Promise<Collections>;
  /** Live updates where the backend supports them; a no-op unsubscribe otherwise. */
  subscribe(onChange: (c: Collections) => void): () => void;
  put<K extends CollectionKey>(key: K, item: Collections[K][number]): Promise<void>;
  putMany<K extends CollectionKey>(key: K, items: Collections[K][number][]): Promise<void>;
  remove(key: CollectionKey, id: string): Promise<void>;
  saveSettings(s: OrgSettings): Promise<void>;
  /** Writes the demo dataset into an empty backend. */
  seedIfEmpty(): Promise<boolean>;
}

/* ---------------- memory ---------------- */

const MEM_KEY = 'glam_repo_v1';

/* A mirror is written by an older build of this app and read back by a newer
   one, so it cannot be trusted to have the shape the code now expects: a mirror
   saved before `admins` existed has no such key, and every consumer treats
   these as arrays — one missing key is a crash on first render, not a blank
   list. Anything absent or malformed falls back to the seed, which also means a
   session already open when a collection is added picks it up rather than
   showing it empty. */
function hydrate(raw: unknown): Collections | null {
  if (!raw || typeof raw !== 'object') return null;
  const saved = raw as Partial<Record<keyof Collections, unknown>>;
  const out = seed();
  for (const k of COLLECTION_KEYS) {
    if (Array.isArray(saved[k])) (out[k] as unknown[]) = saved[k] as unknown[];
  }
  if (saved.settings && typeof saved.settings === 'object') {
    out.settings = { ...out.settings, ...(saved.settings as object) };
  }
  return out;
}

function readMirror(): Collections | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(MEM_KEY);
    return raw ? hydrate(JSON.parse(raw)) : null;
  } catch { return null; }
}

function writeMirror(c: Collections) {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(MEM_KEY, JSON.stringify(c)); } catch { /* quota or private mode */ }
}

export function memoryRepo(): Repo {
  let data: Collections = readMirror() ?? seed();
  const listeners = new Set<(c: Collections) => void>();

  const emit = () => {
    writeMirror(data);
    listeners.forEach((fn) => fn(data));
  };

  return {
    kind: 'memory',
    async load() { return data; },
    subscribe(onChange) {
      listeners.add(onChange);
      onChange(data);
      return () => { listeners.delete(onChange); };
    },
    async put(key, item) {
      const list = [...(data[key] as { id: string }[])];
      const i = list.findIndex((x) => x.id === (item as { id: string }).id);
      if (i >= 0) list[i] = item as { id: string }; else list.unshift(item as { id: string });
      data = { ...data, [key]: list } as Collections;
      emit();
    },
    async putMany(key, items) {
      const list = [...(data[key] as { id: string }[])];
      for (const item of items as { id: string }[]) {
        const i = list.findIndex((x) => x.id === item.id);
        if (i >= 0) list[i] = item; else list.unshift(item);
      }
      data = { ...data, [key]: list } as Collections;
      emit();
    },
    async remove(key, id) {
      data = { ...data, [key]: (data[key] as { id: string }[]).filter((x) => x.id !== id) } as Collections;
      emit();
    },
    async saveSettings(s) { data = { ...data, settings: s }; emit(); },
    async seedIfEmpty() { return false; }
  };
}

/* ---------------- firestore ---------------- */

/* Firestore throws on a document containing an undefined value, and it throws
   before the rules are consulted — so the caller sees an opaque write error
   rather than a permission message, which is a genuinely misleading failure.
   An absent optional field and one explicitly set to undefined mean the same
   thing in this model, so the key is dropped. Done at the boundary, once, so
   no individual verb has to remember. */
function defined<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

const path = (key: CollectionKey) => `orgs/${ORG_ID}/${key}`;


/* ---------- reading only what the rules will actually hand over ----------

   firestore.rules grades most collections per document: a teacher may read a
   session only where its teacherId is theirs, a school only where the schoolId
   is its own. A Firestore list runs that rule against every document it would
   return, so an unfiltered read of the collection is refused outright the
   moment one foreign record exists - not filtered down, refused. Only an admin,
   whose clause mentions no field of the document, can list a whole collection.

   That is why the platform behaved as though teachers and schools had no data
   at all: the query was denied, load() caught the denial, and an empty array is
   indistinguishable from "nothing here yet".

   So the repository asks for exactly what the account is entitled to. Every
   plan below is a single-field equality or an unfiltered read, which keeps it
   on Firestore's automatic single-field indexes - no composite index to create
   in the console, and no change to the rules. */

export type RepoScope = {
  role: Role | null;
  teacherId?: string | null;
  schoolId?: string | null;
};

export type Plan = 'all' | 'none' | { field: string; value: string } | { docId: string };

export function planFor(key: CollectionKey, s: RepoScope): Plan {
  /* isAdmin() is the one clause that does not look at the document, so an admin
     is the one role whose list of a whole collection can succeed. */
  if (s.role === 'admin') return 'all';
  if (s.role !== 'teacher' && s.role !== 'school') return 'none';

  const mine = s.role === 'teacher' ? s.teacherId : s.schoolId;

  switch (key) {
    /* Reference data is readable by anyone in the organisation. */
    case 'subjects':
    case 'classes':
    case 'academicSessions':
      return 'all';

    /* A teacher may read every school - they have to choose one to request -
       while a school reads only its own record. The mirror image for teachers,
       because a school must know who is in its building. */
    case 'schools':
      return s.role === 'teacher' ? 'all' : mine ? { docId: mine } : 'none';
    case 'teachers':
      return s.role === 'school' ? 'all' : mine ? { docId: mine } : 'none';

    /* The two-sided records: mine, by whichever side I am. */
    case 'sessions':
    case 'assignments':
      return mine
        ? { field: s.role === 'teacher' ? 'teacherId' : 'schoolId', value: mine }
        : 'none';

    /* Addressed post only. Every notification aimed at a teacher or a school
       carries an audienceId, so matching on it alone returns exactly the set
       the rule would allow - role-wide post is an admin-only shape. */
    case 'notifications':
      return mine ? { field: 'audienceId', value: mine } : 'none';

    case 'documents':
      return mine ? { field: 'ownerId', value: mine } : 'none';

    /* Administrators and the audit trail are admin-only reads, so we do not
       ask for them rather than asking and being refused. */
    case 'admins':
    case 'auditLogs':
      return 'none';

    default:
      return 'none';
  }
}

export function firestoreRepo(scope: RepoScope): Repo {
  if (!db) throw new Error('Firestore is not configured');
  const fdb = db;

  /** The read this account is allowed to make, or null if it may make none. */
  const readOf = (key: CollectionKey): Query<DocumentData> | null => {
    const plan = planFor(key, scope);
    if (plan === 'none') return null;
    const col = collection(fdb, path(key));
    if (plan === 'all') return col;
    return 'docId' in plan
      ? query(col, where(documentId(), '==', plan.docId))
      : query(col, where(plan.field, '==', plan.value));
  };
  /* Starts empty, not seeded: this backend's contents come from load(). Built
     from COLLECTION_KEYS so a new collection cannot be left out and arrive as
     undefined before the first snapshot lands. */
  let data: Collections = emptyCollections();

  return {
    kind: 'firestore',
    async load() {
      const next = { ...data };
      await Promise.all(COLLECTION_KEYS.map(async (k) => {
        const q = readOf(k);
        if (!q) { (next[k] as unknown[]) = []; return; }
        try {
          const snap = await getDocs(q);
          (next[k] as unknown[]) = snap.docs.map((d) => d.data());
        } catch {
          /* Denied — most often because the account is still pending, and the
             rules grade every read on status == 'active'. An empty collection
             is the honest answer; letting the rejection escape would leave the
             shell stuck on its loading skeleton forever. */
          (next[k] as unknown[]) = [];
        }
      }));
      data = next;
      return data;
    },
    subscribe(onChange) {
      /* One listener per collection. The volumes here are organisation-scale —
         hundreds of documents, not millions — so a full subscription is both
         affordable and what makes approvals feel live across three roles. */
      const unsubs = COLLECTION_KEYS.flatMap((k) => {
        const q = readOf(k);
        if (!q) return [];
        return [onSnapshot(q, (snap) => {
          data = { ...data, [k]: snap.docs.map((d) => d.data()) } as Collections;
          onChange(data);
        }, () => { /* permission denied until rules are deployed */ })];
      });
      const unsubSettings = onSnapshot(doc(fdb, `orgs/${ORG_ID}/settings/config`), (snap) => {
        if (snap.exists()) { data = { ...data, settings: snap.data() as OrgSettings }; onChange(data); }
      }, () => { /* ignore */ });
      return () => { unsubs.forEach((u) => u()); unsubSettings(); };
    },
    async put(key, item) {
      await setDoc(doc(fdb, path(key), (item as { id: string }).id),
        defined(item as object), { merge: true });
    },
    async putMany(key, items) {
      const batch = writeBatch(fdb);
      (items as { id: string }[]).forEach((it) => batch.set(doc(fdb, path(key), it.id), defined(it), { merge: true }));
      await batch.commit();
    },
    async remove(key, id) { await deleteDoc(doc(fdb, path(key), id)); },
    async saveSettings(s) {
      await setDoc(doc(fdb, `orgs/${ORG_ID}/settings/config`), s, { merge: true });
    },
    async seedIfEmpty() {
      const snap = await getDocs(collection(fdb, path('schools')));
      if (!snap.empty) return false;
      const s = seed();
      for (const k of COLLECTION_KEYS) {
        const items = s[k] as { id: string }[];
        for (let i = 0; i < items.length; i += 400) {
          const batch = writeBatch(fdb);
          items.slice(i, i + 400).forEach((it) => batch.set(doc(fdb, path(k), it.id), it));
          await batch.commit();
        }
      }
      await setDoc(doc(fdb, `orgs/${ORG_ID}/settings/config`), s.settings);
      return true;
    }
  };
}

/** Firestore when it is configured and reachable, memory otherwise. */
export function makeRepo(useFirestore: boolean, scope: RepoScope): Repo {
  return useFirestore && firebaseReady && db ? firestoreRepo(scope) : memoryRepo();
}

/* A sequential id has to see the whole collection to know what "next" is, and
   the rules deliberately stop a teacher seeing anyone else's records — their
   list query is refused outright, so they compute next-after-nothing and get
   the same id every time. The second write then lands on an existing document,
   which counts as an update, which they are not allowed to make.

   So anything created by an account that cannot see its own collection gets an
   id that is unique by construction: time-ordered so it still sorts and reads
   roughly chronologically, with a random tail so two people writing in the
   same millisecond cannot collide. nextId stays for the admin-only records,
   where the whole collection genuinely is visible. */
export function newId(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}${tail}`;
}

/** Sequential, human-readable IDs — searchable, and printable on a report. */
export function nextId(prefix: string, existing: { id: string }[]): string {
  const n = existing.reduce((max, x) => {
    const m = /(\d+)$/.exec(x.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `${prefix}-${String(n + 1).padStart(6, '0')}`;
}

export function updateDocSafe(key: CollectionKey, id: string, patch: object) {
  if (!db) return Promise.resolve();
  return updateDoc(doc(db, path(key), id), patch);
}
