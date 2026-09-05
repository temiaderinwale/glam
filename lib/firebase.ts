/* Teach Clock — Firebase (project: glam-dev-prod).

   Phase 1 uses Firebase for authentication and the users/{uid} profile document
   only. Everything the dashboard and report display comes from lib/demo.ts.

   The web API key is a public project identifier, not a secret — it identifies
   the project in browser requests. What actually protects the data is the
   Authentication settings and firestore.rules. */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  updateProfile, signOut, type Auth, type User
} from 'firebase/auth';
import {
  getFirestore, collection, deleteField, doc, getDoc, getDocs, onSnapshot, query,
  setDoc, serverTimestamp, where, type Firestore
} from 'firebase/firestore';
import type { AdminLevel, Role, UserProfile } from './types';

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

/** Missing env vars fail loudly here rather than as a confusing auth error later. */
export const firebaseReady =
  Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);

if (!firebaseReady && typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.error(
    '[Teach Clock] Firebase is not configured: NEXT_PUBLIC_FIREBASE_* is missing from this build.\n' +
    '  Local  — copy .env.example to .env.local, fill it in, restart the dev server.\n' +
    '  Deploy — set the variables in the host, then trigger a NEW BUILD. Next.js inlines\n' +
    '           NEXT_PUBLIC_* at build time, so restarting a running deployment cannot pick\n' +
    '           them up; the values have to be present while `next build` runs.\n' +
    '  Sign-in is disabled until then; the rest of the app runs on demo data.'
  );
}

export const app: FirebaseApp | null = firebaseReady
  ? (getApps().length ? getApps()[0] : initializeApp(cfg as Record<string, string>))
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;

/** The single consulting-firm organisation every account belongs to. */
export const ORG_ID = 'glampter';

/* ---------- Profile document ---------- */

export async function readProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function writeProfile(
  uid: string,
  patch: Partial<UserProfile> & { role?: Role }
): Promise<void> {
  if (!db) return;
  await setDoc(
    doc(db, 'users', uid),
    { uid, orgId: ORG_ID, updatedAt: serverTimestamp(), ...patch },
    { merge: true }
  );
}

/* ---------- The founder slot ----------

   The first person ever to register as an administrator becomes the super
   admin. "First" has to be decided somewhere both durable and contested, so it
   is a single document: bootstrap/platform. Whoever writes it owns the slot.

   firestore.rules allows create and forbids update and delete, so a second
   caller's write is rejected rather than silently overwriting the first. The
   read below is only a fast path for the ordinary case; the rule is what makes
   the race safe. */

const FOUNDER_DOC = () => doc(db!, 'bootstrap', 'platform');

async function claimFounder(uid: string): Promise<boolean> {
  if (!db) return false;
  try {
    const snap = await getDoc(FOUNDER_DOC());
    if (snap.exists()) return false;
    await setDoc(FOUNDER_DOC(), { founderUid: uid, claimedAt: serverTimestamp() });
    return true;
  } catch {
    /* Lost the race, or rules refused the overwrite. Either way: not the founder. */
    return false;
  }
}

/** Whether the platform already has its founding super admin. */
export async function founderExists(): Promise<boolean> {
  if (!db) return false;
  try { return (await getDoc(FOUNDER_DOC())).exists(); } catch { return false; }
}

/* ---------- The live administrator roster ----------

   users/{uid} is the source of truth for a real account: it is what
   registration writes and what firestore.rules grades people by. The org's
   `admins` collection is demo data for preview, and the two are deliberately
   not synchronised — one is real, one is a fixture. */

/** Every identity document. The rules let an administrator read them all, which
    is what the firm's registration and deletion queues are built from. */
export function watchUsers(onRows: (rows: UserProfile[]) => void): () => void {
  if (!db) return () => {};
  try {
    return onSnapshot(
      collection(db, 'users'),
      (snap) => onRows(snap.docs.map((d) => d.data() as UserProfile)),
      () => { /* denied until rules are deployed; preview data stands in */ }
    );
  } catch { return () => {}; }
}

/** What the account holder may change about themselves. Never the email — that
    is the identity Firebase Auth signed them in with — and never their own
    role, status or grade, which firestore.rules refuses anyway. */
export async function saveOwnProfile(
  uid: string,
  patch: Pick<Partial<UserProfile>,
    'displayName' | 'firstName' | 'surname' | 'contactFirstName' | 'contactSurname' | 'phone'>
): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'users', uid),
    { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

/* ---------- BR-025: closing an account is a request, not an action ----------

   The holder asks; a super admin decides. Nothing is destroyed on approval
   either: the account is deactivated and stamped, so the teaching history it
   is attached to still reconciles. Removing the Firebase Auth user itself
   needs the Admin SDK and cannot be done from a browser — see README. */

/** A refused account asks to be looked at again. Only rejected → pending, and
    only for yourself; firestore.rules enforces both. */
export async function reRequestApproval(uid: string): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'users', uid),
    { status: 'pending', updatedAt: new Date().toISOString() }, { merge: true });
}

export async function requestAccountDeletion(uid: string, reason: string): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'users', uid), {
    deleteRequestedAt: new Date().toISOString(),
    deleteRequestReason: reason
  }, { merge: true });
}

export async function resolveAccountDeletion(uid: string, approve: boolean): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'users', uid), approve
    ? {
        status: 'rejected',
        deletedAt: new Date().toISOString(),
        deleteRequestedAt: deleteField(),
        deleteRequestReason: deleteField()
      }
    : { deleteRequestedAt: deleteField(), deleteRequestReason: deleteField() },
    { merge: true });
}

/** A super admin's decision about somebody else's account. */
export async function writeAdminGrade(
  uid: string,
  /* teacherId/schoolId are here because approving an account is also what
     binds it to its org record — without that link the rules cannot match a
     teacher to the assignment they are creating. */
  patch: Pick<Partial<UserProfile>,
    'status' | 'adminLevel' | 'promotedBy' | 'teacherId' | 'schoolId'>
): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, 'users', uid), { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

/* Claims the founder slot, or repairs a profile that should already hold it.

   Registration tries this once, but it can legitimately fail there — the rules
   may not have been deployed yet, or the write may have raced. Rather than
   leave a platform with no super admin and no way to make one, the first
   administrator to sign in settles it. bootstrap/platform is create-only, so
   "first" still means first: a second claimant's write is rejected. */
export async function ensureFounder(profile: UserProfile): Promise<boolean> {
  if (!db || profile.role !== 'admin') return false;
  try {
    const snap = await getDoc(FOUNDER_DOC());

    if (!snap.exists()) {
      /* Nobody holds it. Only claim when no other administrator was registered
         first, so a later sign-in cannot leapfrog the real first account. */
      const others = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
      const earliest = others.docs
        .map((d) => d.data() as UserProfile)
        .filter((p) => p.createdAt)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (earliest && earliest.uid !== profile.uid) return false;

      await setDoc(FOUNDER_DOC(), { founderUid: profile.uid, claimedAt: serverTimestamp() });
    } else if (snap.data()?.founderUid !== profile.uid) {
      return false;
    }

    /* Holder confirmed. Make the profile say so, if it does not already. */
    if (profile.adminLevel !== 'super' || profile.status !== 'active' || !profile.founder) {
      await setDoc(doc(db, 'users', profile.uid),
        { adminLevel: 'super', status: 'active', founder: true }, { merge: true });
    }
    return true;
  } catch {
    return false;
  }
}

/* ---------- Auth actions. Each throws a FirebaseError the UI maps via
   format.ts → authError(), so no raw codes ever reach a person. ---------- */

export async function signIn(email: string, password: string): Promise<User> {
  if (!auth) throw new Error('auth/unconfigured');
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function register(opts: {
  email: string; password: string; displayName: string; role: Role; phone: string;
  firstName?: string; surname?: string;
  contactFirstName?: string; contactSurname?: string;
}): Promise<User> {
  if (!auth) throw new Error('auth/unconfigured');
  const cred = await createUserWithEmailAndPassword(auth, opts.email.trim(), opts.password);
  await updateProfile(cred.user, { displayName: opts.displayName });
  await sendEmailVerification(cred.user);

  /* Only an administrator can take the founder slot, and only if it is free.
     The founder starts active and super, because there is nobody above them to
     approve it; every administrator after them waits in the queue. */
  const founder = opts.role === 'admin' ? await claimFounder(cred.user.uid) : false;
  const adminLevel: AdminLevel | undefined =
    opts.role === 'admin' ? (founder ? 'super' : 'standard') : undefined;

  await writeProfile(cred.user.uid, {
    role: opts.role,
    status: founder ? 'active' : 'pending', // the administrator approves before transacting
    ...(adminLevel ? { adminLevel } : {}),
    displayName: opts.displayName,
    email: opts.email.trim(),
    phone: opts.phone,
    createdAt: new Date().toISOString(),
    /* Spread rather than assign: Firestore rejects a field whose value is
       undefined, and a teacher has no contact parts (and vice versa). */
    ...(opts.firstName ? { firstName: opts.firstName } : {}),
    ...(opts.surname ? { surname: opts.surname } : {}),
    ...(opts.contactFirstName ? { contactFirstName: opts.contactFirstName } : {}),
    ...(opts.contactSurname ? { contactSurname: opts.contactSurname } : {})
  });
  return cred.user;
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error('auth/unconfigured');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function resendVerification(user: User) {
  await sendEmailVerification(user);
}

export async function resetPassword(email: string) {
  if (!auth) throw new Error('auth/unconfigured');
  await sendPasswordResetEmail(auth, email.trim());
}

export async function endSession() {
  if (auth) await signOut(auth);
}
