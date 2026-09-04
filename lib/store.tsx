'use client';
/* Teach Clock — one context, one stage machine.

   The auth stage replaces the usual scatter of booleans: exactly one of these
   is true at a time, and the preloader curtain is simply "stage === loading".

     loading → signedOut | verify | completeProfile | pending | ready

   Phase 1 also has a PREVIEW mode. The four pages have to be reviewable before
   any account exists, so an unauthenticated visitor reaching /dashboard gets the
   shell running on demo data with a visible preview chip, rather than a redirect
   they cannot get past. Delete `preview` and re-enable the guard in AppShell to
   make the app private. */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, readProfile, endSession, firebaseReady } from './firebase';
import type { Role, UserProfile } from './types';

export type AuthStage =
  | 'loading' | 'signedOut' | 'verify' | 'completeProfile' | 'pending' | 'ready';

type Ctx = {
  stage: AuthStage;
  user: User | null;
  profile: UserProfile | null;
  /** Effective role: the profile's role, or the preview role when signed out. */
  role: Role;
  preview: boolean;
  setPreviewRole: (r: Role) => void;
  refresh: () => Promise<void>;
  setStage: (s: AuthStage) => void;
  logout: () => Promise<void>;
  toast: string;
  say: (msg: string) => void;
};

const GlamCtx = createContext<Ctx | null>(null);

export const useGlam = () => {
  const c = useContext(GlamCtx);
  if (!c) throw new Error('useGlam must be used inside <GlamProvider>');
  return c;
};

const ROLE_KEY = 'glam_preview_role';

export function GlamProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<AuthStage>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [previewRole, setPreviewRoleState] = useState<Role>('teacher');
  const [toast, setToast] = useState('');

  const say = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  const setPreviewRole = useCallback((r: Role) => {
    setPreviewRoleState(r);
    try { localStorage.setItem(ROLE_KEY, r); } catch { /* private mode */ }
  }, []);

  const resolve = useCallback(async (u: User | null) => {
    if (!u) { setUser(null); setProfile(null); setStage('signedOut'); return; }
    setUser(u);

    const isPasswordUser = u.providerData.some((p) => p.providerId === 'password');
    if (isPasswordUser && !u.emailVerified) { setStage('verify'); return; }

    let p: UserProfile | null = null;
    try { p = await readProfile(u.uid); } catch { p = null; }
    setProfile(p);

    if (!p || !p.role) { setStage('completeProfile'); return; }
    if (p.status === 'pending') { setStage('pending'); return; }
    setStage('ready');
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ROLE_KEY) as Role | null;
      if (saved === 'teacher' || saved === 'school' || saved === 'admin') setPreviewRoleState(saved);
    } catch { /* private mode */ }

    if (!firebaseReady || !auth) {
      /* No credentials configured: go straight to preview rather than hanging
         behind a curtain that will never lift. */
      const t = window.setTimeout(() => setStage('signedOut'), 500);
      return () => window.clearTimeout(t);
    }
    return onAuthStateChanged(auth, (u) => { void resolve(u); });
  }, [resolve]);

  const refresh = useCallback(async () => {
    if (auth?.currentUser) { await auth.currentUser.reload(); await resolve(auth.currentUser); }
  }, [resolve]);

  const logout = useCallback(async () => {
    setStage('loading');
    await endSession();
    setUser(null); setProfile(null); setStage('signedOut');
  }, []);

  const value = useMemo<Ctx>(() => ({
    stage, user, profile,
    role: profile?.role ?? previewRole,
    preview: stage !== 'ready',
    setPreviewRole, refresh, setStage, logout, toast, say
  }), [stage, user, profile, previewRole, setPreviewRole, refresh, logout, toast, say]);

  return (
    <GlamCtx.Provider value={value}>
      {children}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </GlamCtx.Provider>
  );
}
