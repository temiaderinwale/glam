'use client';
/* Teach Clock — one route, one panel state machine.

   Panels: signin · register · verify · reset · completeProfile · pending
   Deep-linkable through ?tab=, and ?next= survives the round trip.

   Layout is a split, not a centred card on a gradient: the ink column carries
   the brand and the vertical lifecycle rail, the cream column carries the form. */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Building2, Check, Eye, EyeOff, GraduationCap, Loader2, MailCheck, ShieldPlus
} from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import { BrandWord, GlampterLine, Lockup } from '@/components/Brand';
import Preloader from '@/components/Preloader';
import { Field } from '@/components/ui';
import { LIFECYCLE } from '@/lib/compute';
import {
  auth, firebaseReady, readProfile, register, resendVerification, resetPassword,
  endSession, signIn, signInWithGoogle, writeProfile
} from '@/lib/firebase';
import { authError, passwordScore, strengthLabel } from '@/lib/format';
import { useGlam } from '@/lib/store';
import type { Role } from '@/lib/types';

type Panel = 'signin' | 'register' | 'verify' | 'reset' | 'completeProfile' | 'pending';

export default function AuthRoute() {
  return (
    <Suspense fallback={<Preloader />}>
      <AuthPage />
    </Suspense>
  );
}

function AuthPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { stage, user, refresh, say } = useGlam();

  const next = params.get('next') || '/dashboard';
  const initial = ((): Panel => {
    const t = params.get('tab');
    if (t === 'register' || t === 'reg') return 'register';
    if (t === 'reset') return 'reset';
    return 'signin';
  })();

  const [panel, setPanel] = useState<Panel>(initial);
  /* Administrators register through the same form, on a separate path, so the
     teacher/school choice never has to carry a third option that almost nobody
     picks. Deep-linkable as ?tab=register&as=admin. */
  const [adminMode, setAdminMode] = useState(params.get('as') === 'admin');
  const [entering, setEntering] = useState(false);   // holds the curtain on the way in

  /* Follow the session wherever it actually is, so a refresh mid-flow lands on
     the right panel rather than back at sign-in. */
  useEffect(() => {
    /* A pending account is let straight in and told it is under review at the
       top of the dashboard — a holding page reads as a rejection, and there is
       nothing here they can break: the shell refuses every write until an
       administrator activates them. */
    if (stage === 'verify') setPanel('verify');
    else if (stage === 'completeProfile') setPanel('completeProfile');
    else if (stage === 'pending' || stage === 'blocked' || stage === 'ready') {
      setEntering(true); router.replace(next);
    } else if (stage === 'signedOut') {
      /* Leaving an interlude has to move the panel as well as end the session.
         These three are only reachable with an account behind them, so once it
         is gone they have nothing left to show — without this, signing out of
         the Google complete-profile step left that step on screen with no
         session behind it. Panels reached before signing in are untouched, so
         ?tab= still decides where /auth opens. */
      setPanel((p) =>
        p === 'verify' || p === 'completeProfile' || p === 'pending' ? 'register' : p);
    }
  }, [stage, next, router]);

  if (stage === 'loading' || entering) return <Preloader done={entering} />;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* ---- ink column ----
           Pinned to the viewport rather than stretched to the grid row. The
           register form changes height when the role changes (a school adds a
           contact-person field), and a stretched column re-centres its copy
           against that taller row, so the heading visibly drops. At a fixed
           viewport height the copy sits in the same place whatever the form
           beside it is doing. */}
      <aside className="ink-band px-6 py-7 lg:px-10 lg:py-12 flex flex-col
                        lg:sticky lg:top-0 lg:h-screen lg:self-start lg:overflow-y-auto">
        <Link href="/" aria-label="Teach Clock home">
          <Lockup size={80} ground="dark" priority />
        </Link>

        <div className="hidden lg:flex flex-col flex-1 justify-center">
          <h2 className="text-[34px] font-extrabold leading-[1.05] max-w-[16ch]">
            Every hour, on the record.
          </h2>
          <p className="mt-4 text-sm max-w-[38ch]" style={{ color: '#B7AC97' }}>
            Teachers submit. Schools verify. The firm reports on what was
            actually delivered.
          </p>

          <ol className="mt-10 flex flex-col" aria-label="Session lifecycle">
            {LIFECYCLE.map((s, i) => (
              <li key={s.key} className="flex items-center gap-4 py-[7px]">
                <span
                  className="w-[9px] h-[9px] rotate-45 flex-none"
                  style={{
                    background: i < 6 ? 'var(--gold)' : 'transparent',
                    border: i < 6 ? 'none' : '1.5px solid var(--rule-dark)'
                  }}
                  aria-hidden="true"
                />
                <span className="eyebrow" style={{ color: i < 6 ? 'var(--cream)' : '#6E6555' }}>
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="hidden lg:block"><GlampterLine /></div>
      </aside>

      {/* ---- form column ---- */}
      <main className="px-5 py-10 sm:px-10 lg:px-16 lg:py-14 flex flex-col justify-center">
        <div className="w-full max-w-[440px] mx-auto">
          {panel === 'signin' && (
            <SignIn onPanel={setPanel} />
          )}
          {panel === 'register' && (
            <Register onPanel={setPanel} admin={adminMode} onAdmin={setAdminMode} />
          )}
          {panel === 'reset' && <Reset onPanel={setPanel} />}
          {panel === 'verify' && <Verify onDone={refresh} say={say} />}
          {panel === 'completeProfile' && (
            <CompleteProfile onDone={refresh} onLeave={() => setPanel('register')} />
          )}
          {panel === 'pending' && <Pending />}
        </div>
      </main>
    </div>
  );
}

/* ---------- shared bits ---------- */

function Head({ eyebrow, title, sub }: { eyebrow: string; title: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-7">
      <span className="eyebrow">{eyebrow}</span>
      <h1 className="mt-3 text-[30px] font-extrabold leading-tight">{title}</h1>
      {sub ? <p className="mt-2.5 text-sm text-[var(--text-2)]">{sub}</p> : null}
    </div>
  );
}

function FormError({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="field-error" role="alert" style={{ marginTop: 0 }}>{msg}</p>
  );
}

function GoogleButton({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button type="button" className="btn btn-ghost btn-block" onClick={onClick} disabled={busy}>
      <svg width="16" height="16" viewBox="0 0 46 47" aria-hidden="true">
        <path fill="#4285F4" d="M46 24.03c0-1.94-.15-3.35-.5-4.82H23.47v8.73h12.94c-.27 2.17-1.67 5.43-4.81 7.63l-.03.3 6.95 5.4.48.06c4.46-4.12 7-10.17 7-17.3Z" />
        <path fill="#34A853" d="M23.47 47c6.34 0 11.65-2.09 15.55-5.7l-7.4-5.76c-1.99 1.39-4.63 2.36-8.12 2.36-6.22 0-11.47-4.12-13.35-9.76l-.27.02-7.27 5.61-.1.27C6.37 41.71 14.29 47 23.47 47Z" />
        <path fill="#FBBC05" d="M10.12 28.14a14.4 14.4 0 0 1 0-9.28v-.33L2.76 12.84l-.24.11a23.5 23.5 0 0 0 0 21.09l7.6-5.9Z" />
        <path fill="#EB4335" d="M23.47 9.08c4.4 0 7.39 1.91 9.06 3.49l6.63-6.46C35.09 2.32 29.81 0 23.47 0 14.29 0 6.37 5.29 2.49 12.95l7.6 5.91c1.91-5.67 7.16-9.78 13.38-9.78Z" />
      </svg>
      {label}
    </button>
  );
}

/** Password box with a reveal toggle. Shared so the eye behaves identically
    everywhere a password is typed. */
function PasswordInput({ id, value, onChange, autoComplete, invalid, describedBy }: {
  id: string; value: string; onChange: (v: string) => void;
  autoComplete: string; invalid?: boolean; describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id} className="input pr-11" type={show ? 'text' : 'password'}
        autoComplete={autoComplete} required value={value}
        onChange={(e) => onChange(e.target.value)} placeholder="••••••••"
        aria-invalid={invalid || undefined} aria-describedby={describedBy}
      />
      <button type="button" onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[var(--text-3)]"
        aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

/** Weak → strong meter. Colour carries the reading as well as the fill count,
    and the label is the accessible version of the same thing. */
const METER = ['var(--border)', 'var(--bad)', 'var(--warn)', 'var(--ok)', 'var(--ok)'];

function StrengthMeter({ pw }: { pw: string }) {
  const score = useMemo(() => passwordScore(pw), [pw]);
  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <div className="flex gap-1 flex-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-[5px] flex-1"
            style={{ background: pw && i < score ? METER[score] : 'var(--border)' }} />
        ))}
      </div>
      <span className="text-xs text-[var(--text-2)] text-right" style={{ minWidth: '8ch' }}
        aria-live="polite">
        {pw ? strengthLabel[score] : 'Strength'}
      </span>
    </div>
  );
}

/* The sign-up form knows which kind of account was being created; the panel
   that finishes a Google sign-up is a different component reached after the
   popup returns. Parking the choice is what lets it arrive pre-selected. */
const SIGNUP_ROLE_KEY = 'glam_signup_role';

const rememberSignupRole = (r: Role) => {
  try { sessionStorage.setItem(SIGNUP_ROLE_KEY, r); } catch { /* private mode */ }
};

const forgetSignupRole = () => {
  try { sessionStorage.removeItem(SIGNUP_ROLE_KEY); } catch { /* private mode */ }
};

const recallSignupRole = (): Role => {
  try {
    const r = sessionStorage.getItem(SIGNUP_ROLE_KEY);
    return r === 'school' || r === 'admin' ? r : 'teacher';
  } catch { return 'teacher'; }
};

/* Sits between the Google fast path and the credential fields. */
function OrRule() {
  return (
    <div className="flex items-center gap-3 my-1 text-xs text-[var(--text-3)]">
      <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
      OR
      <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
    </div>
  );
}

/* Shown in the form's error slot when the build carries no Firebase keys, so a
   visitor reads it. It says what it means for them and nothing about how the
   thing is built — the setup instructions go to the console in lib/firebase.ts,
   where the person who can act on them will actually look. */
function unconfigured() {
  return !firebaseReady
    ? 'Sign-in is temporarily unavailable. Please try again shortly, or contact Glampter Consults if it continues.'
    : '';
}

/* ---------- signin ---------- */

function SignIn({ onPanel }: { onPanel: (p: Panel) => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(unconfigured());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await signIn(email, pw); }
    catch (ex) { setErr(ex instanceof FirebaseError ? authError(ex.code) : unconfigured() || 'Sign-in failed. Try again.'); }
    finally { setBusy(false); }
  };

  const google = async () => {
    setErr(''); setBusy(true);
    try { await signInWithGoogle(); }
    catch (ex) { setErr(ex instanceof FirebaseError ? authError(ex.code) : unconfigured() || 'Google sign-in failed.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Head eyebrow="Welcome back"
        title={<>Sign in to <BrandWord /></>}
        sub="Teachers, schools and administrators sign-in." />

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError msg={err} />

        <GoogleButton label="Continue with Google" onClick={google} busy={busy} />
        <OrRule />

        <Field label="Email address" htmlFor="email">
          <input id="email" className="input" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.ng" />
        </Field>

        <Field label="Password" htmlFor="pw">
          <PasswordInput id="pw" value={pw} onChange={setPw} autoComplete="current-password" />
        </Field>

        <button type="button" onClick={() => onPanel('reset')}
          className="self-start text-sm font-medium" style={{ color: 'var(--accent)' }}>
          Forgot your password?
        </button>

        <button className="btn btn-primary btn-block mt-1" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          Sign in
        </button>
      </form>

      <p className="mt-7 text-sm text-[var(--text-2)]">
        Just getting started?{' '}
        <button className="font-semibold" style={{ color: 'var(--accent)' }} onClick={() => onPanel('register')}>
          Create an account
        </button>
      </p>
    </>
  );
}

/* ---------- register ---------- */

function Register({ onPanel, admin, onAdmin }: {
  onPanel: (p: Panel) => void; admin: boolean; onAdmin: (v: boolean) => void;
}) {
  const [role, setRole] = useState<Role>('teacher');
  /* In admin mode the selector is not shown, so the chosen role is fixed. An
     administrator is named like a person, so they take the teacher-shaped
     fields — first name and surname. */
  const activeRole: Role = admin ? 'admin' : role;
  /* Kept per role rather than one shared "name", so switching the selector
     back and forth never silently discards what was already typed. */
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [adminFirst, setAdminFirst] = useState('');
  const [adminSurname, setAdminSurname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(unconfigured());
  const [bad, setBad] = useState<Record<string, string>>({});

  const mismatch = pw2.length > 0 && pw !== pw2;

  /* Clear a field's complaint as soon as it is being corrected. */
  const edit = (key: string, set: (v: string) => void) => (v: string) => {
    set(v);
    setBad((p) => { if (!p[key]) return p; const n = { ...p }; delete n[key]; return n; });
  };

  /* The form is noValidate — the browser will not police it — so every rule
     lives here, and nothing submits until all of them hold. */
  const check = () => {
    const need: [string, string, string][] = activeRole === 'school'
      ? [
          ['schoolName', schoolName, 'Enter the school name.'],
          ['adminFirst', adminFirst, 'Enter the school admin first name.'],
          ['adminSurname', adminSurname, 'Enter the school admin surname.'],
          ['email', email, 'Enter an email address.'],
          ['phone', phone, 'Enter a phone number.'],
          ['pw', pw, 'Choose a password.'],
          ['pw2', pw2, 'Confirm your password.']
        ]
      : [
          ['firstName', firstName, 'Enter your first name.'],
          ['surname', surname, 'Enter your surname.'],
          ['email', email, 'Enter an email address.'],
          ['phone', phone, 'Enter a phone number.'],
          ['pw', pw, 'Choose a password.'],
          ['pw2', pw2, 'Confirm your password.']
        ];

    const out: Record<string, string> = {};
    for (const [key, value, msg] of need) if (!value.trim()) out[key] = msg;
    if (!out.email && !/^\S+@\S+\.\S+$/.test(email.trim())) out.email = 'That email address is not complete.';
    if (!out.pw && pw.length < 8) out.pw = 'Use at least 8 characters.';
    if (!out.pw2 && pw !== pw2) out.pw2 = 'The two passwords do not match.';
    return out;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const found = check();
    setBad(found);
    if (Object.keys(found).length) {
      setErr('Every field is required. Check the ones marked below.');
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }
    if (!terms) { setErr('Accept the terms to create an account.'); return; }

    setErr(''); setBusy(true);
    try {
      await register({
        email,
        password: pw,
        role: activeRole,
        phone,
        /* One rendered name downstream: the person for a teacher, the school
           itself for a school. The parts ride along beside it. */
        displayName: activeRole === 'school'
          ? schoolName.trim()
          : `${firstName.trim()} ${surname.trim()}`,
        ...(activeRole === 'school'
          ? { contactFirstName: adminFirst.trim(), contactSurname: adminSurname.trim() }
          : { firstName: firstName.trim(), surname: surname.trim() })
      });
    } catch (ex) {
      setErr(ex instanceof FirebaseError ? authError(ex.code) : unconfigured() || 'Registration failed.');
    } finally { setBusy(false); }
  };

  const google = async () => {
    setErr(''); setBusy(true);
    rememberSignupRole(activeRole);   // so the next panel opens on the right one
    try { await signInWithGoogle(); }
    catch (ex) { setErr(ex instanceof FirebaseError ? authError(ex.code) : unconfigured() || 'Google sign-up failed.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Head
        eyebrow={admin ? 'Administrator sign-up' : 'Create an account'}
        title={<>Join <BrandWord /></>} />

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError msg={err} />

        {admin ? (
          <div className="frame frame-tint-gold p-3.5 flex items-start gap-3">
            <ShieldPlus size={19} strokeWidth={1.9} style={{ color: 'var(--accent-ink)' }}
              className="flex-none mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-display font-bold text-[15px]">Registering as an administrator</p>
              <p className="text-xs text-[var(--text-2)] mt-1">
                Administrator privileges are granted after super admin approval.
              </p>
              <button type="button" className="text-sm font-semibold mt-2"
                style={{ color: 'var(--accent)' }}
                onClick={() => { onAdmin(false); setBad({}); }}>
                Register as a teacher or school instead
              </button>
            </div>
          </div>
        ) : (
          <fieldset>
            <legend className="field-label">I am registering as</legend>
            <div className="grid grid-cols-2 gap-2.5">
              {([
                { v: 'teacher' as Role, icon: GraduationCap, t: 'A teacher', d: 'I teach in schools' },
                { v: 'school' as Role, icon: Building2, t: 'A school', d: 'We receive teachers' }
              ]).map((o) => (
                <label key={o.v}
                  className="frame p-3.5 cursor-pointer flex flex-col gap-1.5"
                  style={{ borderColor: role === o.v ? 'var(--accent)' : 'var(--border)' }}>
                  <input type="radio" name="role" value={o.v} className="sr-only"
                    checked={role === o.v} onChange={() => { setRole(o.v); setBad({}); }} />
                  <o.icon size={19} strokeWidth={1.9}
                    style={{ color: role === o.v ? 'var(--accent)' : 'var(--text-3)' }} aria-hidden="true" />
                  <span className="font-display font-bold text-[15px]">{o.t}</span>
                  <span className="text-xs text-[var(--text-2)]">{o.d}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <GoogleButton label="Sign up with Google" onClick={google} busy={busy} />
        <OrRule />

        {activeRole === 'school' ? (
          <>
            <Field label="School name" htmlFor="schoolName" required error={bad.schoolName}>
              <input id="schoolName" className="input" required autoComplete="organization"
                value={schoolName} onChange={(e) => edit('schoolName', setSchoolName)(e.target.value)}
                aria-invalid={!!bad.schoolName || undefined}
                aria-describedby={bad.schoolName ? 'schoolName-error' : undefined}
                placeholder="BMS Montessori School" />
            </Field>

            <div className="field-row">
              <Field label="School admin first name" htmlFor="adminFirst" required error={bad.adminFirst}>
                <input id="adminFirst" className="input" required autoComplete="given-name"
                  value={adminFirst} onChange={(e) => edit('adminFirst', setAdminFirst)(e.target.value)}
                  aria-invalid={!!bad.adminFirst || undefined}
                  aria-describedby={bad.adminFirst ? 'adminFirst-error' : undefined}
                  placeholder="Folake" />
              </Field>
              <Field label="School admin surname" htmlFor="adminSurname" required error={bad.adminSurname}>
                <input id="adminSurname" className="input" required autoComplete="family-name"
                  value={adminSurname} onChange={(e) => edit('adminSurname', setAdminSurname)(e.target.value)}
                  aria-invalid={!!bad.adminSurname || undefined}
                  aria-describedby={bad.adminSurname ? 'adminSurname-error' : undefined}
                  placeholder="Adeyemi" />
              </Field>
            </div>
          </>
        ) : (
          <div className="field-row">
            <Field label="First name" htmlFor="firstName" required error={bad.firstName}>
              <input id="firstName" className="input" required autoComplete="given-name"
                value={firstName} onChange={(e) => edit('firstName', setFirstName)(e.target.value)}
                aria-invalid={!!bad.firstName || undefined}
                aria-describedby={bad.firstName ? 'firstName-error' : undefined}
                placeholder="John" />
            </Field>
            <Field label="Surname" htmlFor="surname" required error={bad.surname}>
              <input id="surname" className="input" required autoComplete="family-name"
                value={surname} onChange={(e) => edit('surname', setSurname)(e.target.value)}
                aria-invalid={!!bad.surname || undefined}
                aria-describedby={bad.surname ? 'surname-error' : undefined}
                placeholder="Adeyinka" />
            </Field>
          </div>
        )}

        <Field label="Email" htmlFor="email" required error={bad.email}>
          <input id="email" className="input" type="email" required autoComplete="email"
            value={email} onChange={(e) => edit('email', setEmail)(e.target.value)}
            aria-invalid={!!bad.email || undefined}
            aria-describedby={bad.email ? 'email-error' : undefined}
            placeholder="you@school.ng" />
        </Field>

        <Field label="Phone number" htmlFor="phone" required error={bad.phone}>
          <input id="phone" className="input" type="tel" required autoComplete="tel"
            value={phone} onChange={(e) => edit('phone', setPhone)(e.target.value)}
            aria-invalid={!!bad.phone || undefined}
            aria-describedby={bad.phone ? 'phone-error' : undefined}
            placeholder="0803 412 7788" />
        </Field>

        <Field label="Password" htmlFor="pw" required hint="At least 8 characters." error={bad.pw}>
          <PasswordInput id="pw" value={pw} onChange={edit('pw', setPw)}
            autoComplete="new-password" invalid={!!bad.pw}
            describedBy={bad.pw ? 'pw-error' : undefined} />
          <StrengthMeter pw={pw} />
        </Field>

        <Field label="Confirm password" htmlFor="pw2" required
          error={bad.pw2 || (mismatch ? 'The two passwords do not match.' : undefined)}>
          <PasswordInput id="pw2" value={pw2} onChange={edit('pw2', setPw2)}
            autoComplete="new-password" invalid={!!bad.pw2 || mismatch}
            describedBy={bad.pw2 || mismatch ? 'pw2-error' : undefined} />
        </Field>

        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" className="mt-1" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span className="text-[var(--text-2)]">
            I accept the terms of service and understand my account is reviewed by
            Glampter Consults before it is activated.
          </span>
        </label>

        <button className="btn btn-primary btn-block mt-1" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          Create account
        </button>
      </form>

      <p className="mt-7 text-sm text-[var(--text-2)]">
        Already registered?{' '}
        <button className="font-semibold" style={{ color: 'var(--accent)' }} onClick={() => onPanel('signin')}>
          Sign in
        </button>
      </p>
      {/* Administrators come in by a different door, so it is set apart rather
          than queued in with the ordinary links: its own rule, its own card and
          its own button. Shown for both the teacher and the school paths. */}
      {!admin ? (
        <div className="mt-8 pt-7 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="frame frame-flat p-4">
            <div className="flex items-center gap-2.5">
              <ShieldPlus size={17} strokeWidth={1.9} style={{ color: 'var(--accent-ink)' }}
                className="flex-none" aria-hidden="true" />
              <p className="font-display font-bold text-[14px]">Administrator?</p>
            </div>
            <p className="text-xs text-[var(--text-2)] mt-1.5 max-w-[46ch]">
              Administrators register on a separate path, and are granted privileges after
              super admin approval.
            </p>
            <button type="button" className="btn btn-ghost btn-sm mt-3"
              onClick={() => { onAdmin(true); setBad({}); }}>
              Sign up as an admin
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ---------- reset ---------- */

function Reset({ onPanel }: { onPanel: (p: Panel) => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(unconfigured());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await resetPassword(email); setSent(true); }
    catch (ex) {
      /* Never reveal whether an address is registered. */
      if (ex instanceof FirebaseError && ex.code === 'auth/user-not-found') setSent(true);
      else setErr(ex instanceof FirebaseError ? authError(ex.code) : unconfigured() || 'Could not send the email.');
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <>
        <Head eyebrow="Check your inbox" title="Reset link sent"
          sub={`If an account uses ${email}, a reset link is on its way. The link expires in one hour.`} />
        <button className="btn btn-primary btn-block" onClick={() => onPanel('signin')}>
          Back to sign in
        </button>
      </>
    );
  }

  return (
    <>
      <button className="flex items-center gap-2 text-sm text-[var(--text-2)] mb-6"
        onClick={() => onPanel('signin')}>
        <ArrowLeft size={15} /> Back to sign in
      </button>
      <Head eyebrow="Password reset" title="Reset your password"
        sub="Enter the email on your account and we will send a link to set a new password." />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError msg={err} />
        <Field label="Email address" htmlFor="reset-email">
          <input id="reset-email" className="input" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          Send reset link
        </button>
      </form>
    </>
  );
}

/* ---------- verify ---------- */

function Verify({ onDone, say }: { onDone: () => Promise<void>; say: (m: string) => void }) {
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cooldown) return;
    const id = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const resend = async () => {
    if (!auth?.currentUser || cooldown) return;
    await resendVerification(auth.currentUser);
    setCooldown(60);
    say('Verification email sent.');
  };

  return (
    <>
      <MailCheck size={30} strokeWidth={1.7} style={{ color: 'var(--accent)' }} aria-hidden="true" />
      <Head eyebrow="One more step" title="Verify your email"
        sub={`We sent a link to ${auth?.currentUser?.email ?? 'your inbox'}. Open it, then come back here.`} />
      <div className="flex flex-col gap-3">
        <button className="btn btn-primary btn-block" disabled={busy}
          onClick={async () => { setBusy(true); await onDone(); setBusy(false); }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          I have verified it
        </button>
        <button className="btn btn-ghost btn-block" onClick={resend} disabled={cooldown > 0}>
          {cooldown ? `Resend in ${cooldown}s` : 'Resend the email'}
        </button>
      </div>
      <p className="mt-6 text-sm text-[var(--text-3)]">
        Nothing arrived? Check spam, and confirm the address was typed correctly.
      </p>
    </>
  );
}

/* ---------- complete profile ---------- */

function CompleteProfile({ onDone, onLeave }: {
  onDone: () => Promise<void>; onLeave: () => void;
}) {
  const { user } = useGlam();
  const guess = (user?.displayName ?? '').trim().split(/\s+/);
  const [role, setRole] = useState<Role>(recallSignupRole);
  const [firstName, setFirstName] = useState(guess[0] ?? '');
  const [surname, setSurname] = useState(guess.slice(1).join(' '));
  const [schoolName, setSchoolName] = useState('');
  const [adminFirst, setAdminFirst] = useState(guess[0] ?? '');
  const [adminSurname, setAdminSurname] = useState(guess.slice(1).join(' '));
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [bad, setBad] = useState<Record<string, string>>({});
  const [leaving, setLeaving] = useState(false);

  const edit = (key: string, set: (v: string) => void) => (v: string) => {
    set(v);
    setBad((p) => { if (!p[key]) return p; const n = { ...p }; delete n[key]; return n; });
  };

  /* The same fields registration demands, checked the same way. */
  const check = () => {
    const need: [string, string, string][] = role === 'school'
      ? [
          ['schoolName', schoolName, 'Enter the school name.'],
          ['adminFirst', adminFirst, 'Enter the school admin first name.'],
          ['adminSurname', adminSurname, 'Enter the school admin surname.'],
          ['phone', phone, 'Enter a phone number.']
        ]
      : [
          ['firstName', firstName, 'Enter your first name.'],
          ['surname', surname, 'Enter your surname.'],
          ['phone', phone, 'Enter a phone number.']
        ];
    const out: Record<string, string> = {};
    for (const [k, v, msg] of need) if (!v.trim()) out[k] = msg;
    return out;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const found = check();
    setBad(found);
    if (Object.keys(found).length) {
      setErr('Every field is required. Check the ones marked below.');
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }

    setBusy(true); setErr('');
    try {
      const existing = await readProfile(user.uid);
      await writeProfile(user.uid, {
        role,
        phone,
        displayName: role === 'school'
          ? schoolName.trim()
          : `${firstName.trim()} ${surname.trim()}`,
        ...(role === 'school'
          ? { contactFirstName: adminFirst.trim(), contactSurname: adminSurname.trim() }
          : { firstName: firstName.trim(), surname: surname.trim() }),
        email: user.email ?? '',
        photoURL: user.photoURL ?? '',
        status: existing?.status ?? 'pending',
        createdAt: existing?.createdAt ?? new Date().toISOString()
      });
      await onDone();
    } catch {
      setErr('Could not save your profile. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <Head eyebrow="Almost there" title="Complete your profile"
        sub="A few details Google does not give us, before your account goes for review." />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError msg={err} />
        <fieldset>
          <legend className="field-label">I am registering as</legend>
          <div className="grid grid-cols-3 gap-2.5">
            {([
              { v: 'teacher' as Role, icon: GraduationCap, t: 'A teacher' },
              { v: 'school' as Role, icon: Building2, t: 'A school' },
              { v: 'admin' as Role, icon: ShieldPlus, t: 'An administrator' }
            ]).map((o) => (
              <label key={o.v} className="frame p-3.5 cursor-pointer flex flex-col gap-1.5"
                style={{ borderColor: role === o.v ? 'var(--accent)' : 'var(--border)' }}>
                <input type="radio" name="crole" className="sr-only" checked={role === o.v}
                  onChange={() => setRole(o.v)} />
                <o.icon size={19} strokeWidth={1.9}
                  style={{ color: role === o.v ? 'var(--accent)' : 'var(--text-3)' }} aria-hidden="true" />
                <span className="font-display font-bold text-[15px]">{o.t}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {role === 'school' ? (
          <>
            <Field label="School name" htmlFor="schoolName" required error={bad.schoolName}>
              <input id="schoolName" className="input" required autoComplete="organization"
                value={schoolName} onChange={(e) => edit('schoolName', setSchoolName)(e.target.value)}
                aria-invalid={!!bad.schoolName || undefined}
                placeholder="BMS Montessori School" />
            </Field>
            <div className="field-row">
              <Field label="School admin first name" htmlFor="adminFirst" required error={bad.adminFirst}>
                <input id="adminFirst" className="input" required autoComplete="given-name"
                  value={adminFirst} onChange={(e) => edit('adminFirst', setAdminFirst)(e.target.value)}
                  aria-invalid={!!bad.adminFirst || undefined} placeholder="Folake" />
              </Field>
              <Field label="School admin surname" htmlFor="adminSurname" required error={bad.adminSurname}>
                <input id="adminSurname" className="input" required autoComplete="family-name"
                  value={adminSurname} onChange={(e) => edit('adminSurname', setAdminSurname)(e.target.value)}
                  aria-invalid={!!bad.adminSurname || undefined} placeholder="Adeyemi" />
              </Field>
            </div>
          </>
        ) : (
          <div className="field-row">
            <Field label="First name" htmlFor="firstName" required error={bad.firstName}>
              <input id="firstName" className="input" required autoComplete="given-name"
                value={firstName} onChange={(e) => edit('firstName', setFirstName)(e.target.value)}
                aria-invalid={!!bad.firstName || undefined} placeholder="John" />
            </Field>
            <Field label="Surname" htmlFor="surname" required error={bad.surname}>
              <input id="surname" className="input" required autoComplete="family-name"
                value={surname} onChange={(e) => edit('surname', setSurname)(e.target.value)}
                aria-invalid={!!bad.surname || undefined} placeholder="Adeyinka" />
            </Field>
          </div>
        )}

        {/* Read-only: the address is what Google signed them in with. */}
        <Field label="Email" htmlFor="cemail" hint="Taken from your Google account and cannot be changed.">
          <input id="cemail" className="input" value={user?.email ?? ''} readOnly disabled />
        </Field>

        <Field label="Phone number" htmlFor="phone" required error={bad.phone}>
          <input id="phone" className="input" type="tel" required autoComplete="tel"
            value={phone} onChange={(e) => edit('phone', setPhone)(e.target.value)}
            aria-invalid={!!bad.phone || undefined} placeholder="0803 412 7788" />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          Save and continue
        </button>
      </form>

      {/* Picking a Google account should not be a one-way door: someone who
          changes their mind here has no other way back out.

          It abandons the half-finished sign-up outright — ends the Firebase
          session, drops the remembered role, and moves the panel itself.
          Waiting on onAuthStateChanged alone is what left this stuck: the
          session ended but the panel had nothing telling it to change. */}
      <p className="mt-7 text-sm text-[var(--text-2)]">
        Changed your mind?{' '}
        <button
          className="font-semibold" style={{ color: 'var(--accent)' }} disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            forgetSignupRole();
            try { await endSession(); } catch { /* session already gone; leave anyway */ }
            onLeave();
          }}
        >
          {leaving ? 'Leaving…' : 'Back to sign up'}
        </button>
      </p>
    </>
  );
}

/* ---------- pending review ---------- */

function Pending() {
  const { profile, logout } = useGlam();
  return (
    <>
      <Head eyebrow="Account under review"
        title="Glampter is reviewing your account"
        sub={`Thanks${profile?.displayName ? `, ${profile.displayName.split(' ')[0]}` : ''}. Accounts are checked before they can submit or approve teaching sessions — usually within one working day.`} />

      <div className="frame frame-flat p-5">
        <span className="eyebrow">What happens next</span>
        <ol className="mt-4 flex flex-col gap-3 text-sm">
          {[
            'Glampter confirms your details and, for teachers, your qualifications.',
            'Your account is activated and you are assigned to a school.',
            'You receive an email, and everything opens up here.'
          ].map((t, i) => (
            <li key={t} className="flex gap-3">
              <span className="mono text-xs pt-[3px]" style={{ color: 'var(--accent)' }}>0{i + 1}</span>
              <span className="text-[var(--text-2)]">{t}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <button className="btn btn-ghost btn-block" onClick={() => void logout()}>Sign out</button>
      </div>
    </>
  );
}
