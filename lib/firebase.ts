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
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
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
    '[Teach Clock] Firebase is not configured. Copy .env.example to .env.local and fill in ' +
    'NEXT_PUBLIC_FIREBASE_*. Sign-in is disabled until then; the rest of the app runs on demo data.'
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
