'use client';
/* Profile — the account's own record, and the one place it can be closed.

   Everything here was collected at sign-up, so this is where it is corrected.
   Two things are deliberately not editable:

     • the email, because it is the identity Firebase Auth signed you in with —
       changing it here would silently desynchronise the two;
     • the role, status and administrative grade, because they are decisions the
       firm makes about you, not claims you make about yourself. firestore.rules
       refuses those from the account holder regardless of what this page did.

   Closing the account is a request (BR-025): a super admin decides, and the
   record is deactivated rather than destroyed so the teaching history attached
   to it still reconciles. */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { Badge, Confirm, Field, PageHead } from '@/components/ui';
import { useData } from '@/lib/data';
import { useGlam } from '@/lib/store';
import { dateLong } from '@/lib/format';
import type { AccountStatus } from '@/lib/types';

const STATUS_TONE: Record<AccountStatus, 'ok' | 'warn' | 'bad' | 'mute'> = {
  active: 'ok', pending: 'warn', suspended: 'bad', rejected: 'mute'
};
const STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Active', pending: 'Under review', suspended: 'Frozen', rejected: 'Closed'
};

export default function ProfilePage() {
  const { profile, preview } = useGlam();
  const { saveMyProfile, askToCloseMyAccount } = useData();

  const isSchool = profile?.role === 'school';

  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [adminFirst, setAdminFirst] = useState('');
  const [adminSurname, setAdminSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState(false);

  /* Seed from the record once it arrives, and again if it changes underneath. */
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? '');
    setSurname(profile.surname ?? '');
    setSchoolName(profile.role === 'school' ? profile.displayName ?? '' : '');
    setAdminFirst(profile.contactFirstName ?? '');
    setAdminSurname(profile.contactSurname ?? '');
    setPhone(profile.phone ?? '');
  }, [profile]);

  const edit = (key: string, set: (v: string) => void) => (v: string) => {
    set(v);
    setBad((p) => { if (!p[key]) return p; const n = { ...p }; delete n[key]; return n; });
  };

  const requested = !!profile?.deleteRequestedAt;

  const check = () => {
    const need: [string, string, string][] = isSchool
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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = check();
    setBad(found);
    if (Object.keys(found).length) {
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }
    setBusy(true);
    await saveMyProfile(isSchool
      ? {
          displayName: schoolName.trim(),
          contactFirstName: adminFirst.trim(),
          contactSurname: adminSurname.trim(),
          phone
        }
      : {
          displayName: `${firstName.trim()} ${surname.trim()}`,
          firstName: firstName.trim(),
          surname: surname.trim(),
          phone
        });
    setBusy(false);
  };

  const joined = useMemo(
    () => (profile?.createdAt ? dateLong(profile.createdAt.slice(0, 10)) : '—'),
    [profile]);

  if (!profile) {
    return (
      <>
        <PageHead title="Profile" sub="The details this account was registered with." />
        <div className="frame frame-flat p-6 flex items-start gap-3">
          <UserCog size={20} strokeWidth={1.7} className="flex-none mt-0.5 text-[var(--text-3)]"
            aria-hidden="true" />
          <div>
            <p className="font-display font-bold text-[15px]">No account signed in</p>
            <p className="text-sm text-[var(--text-2)] mt-1">
              {preview
                ? 'This is the dashboard preview, which runs on demo data and has no profile behind it. Sign in to see your own record.'
                : 'Sign in to see your own record.'}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title="Profile" sub="The details this account was registered with." />

      {/* What the firm has decided about this account — read-only by design. */}
      <div className="frame frame-flat p-5 mb-6 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <span className="eyebrow block">Account type</span>
          <span className="text-sm font-semibold capitalize">{profile.role}</span>
        </div>
        <div>
          <span className="eyebrow block">Status</span>
          <Badge tone={STATUS_TONE[profile.status]}>{STATUS_LABEL[profile.status]}</Badge>
        </div>
        {profile.role === 'admin' ? (
          <div>
            <span className="eyebrow block">Grade</span>
            {profile.adminLevel === 'super'
              ? <Badge tone="info">Super admin</Badge>
              : <Badge tone="mute">Admin</Badge>}
          </div>
        ) : null}
        <div>
          <span className="eyebrow block">Registered</span>
          <span className="text-sm text-[var(--text-2)]">{joined}</span>
        </div>
      </div>

      <form onSubmit={save} className="flex flex-col gap-4 max-w-[560px]" noValidate>
        {isSchool ? (
          <>
            <Field label="School name" htmlFor="schoolName" required error={bad.schoolName}>
              <input id="schoolName" className="input" value={schoolName}
                onChange={(e) => edit('schoolName', setSchoolName)(e.target.value)}
                aria-invalid={!!bad.schoolName || undefined} />
            </Field>
            <div className="field-row">
              <Field label="School admin first name" htmlFor="adminFirst" required error={bad.adminFirst}>
                <input id="adminFirst" className="input" value={adminFirst}
                  onChange={(e) => edit('adminFirst', setAdminFirst)(e.target.value)}
                  aria-invalid={!!bad.adminFirst || undefined} />
              </Field>
              <Field label="School admin surname" htmlFor="adminSurname" required error={bad.adminSurname}>
                <input id="adminSurname" className="input" value={adminSurname}
                  onChange={(e) => edit('adminSurname', setAdminSurname)(e.target.value)}
                  aria-invalid={!!bad.adminSurname || undefined} />
              </Field>
            </div>
          </>
        ) : (
          <div className="field-row">
            <Field label="First name" htmlFor="firstName" required error={bad.firstName}>
              <input id="firstName" className="input" value={firstName}
                onChange={(e) => edit('firstName', setFirstName)(e.target.value)}
                aria-invalid={!!bad.firstName || undefined} />
            </Field>
            <Field label="Surname" htmlFor="surname" required error={bad.surname}>
              <input id="surname" className="input" value={surname}
                onChange={(e) => edit('surname', setSurname)(e.target.value)}
                aria-invalid={!!bad.surname || undefined} />
            </Field>
          </div>
        )}

        <Field label="Email" htmlFor="email"
          hint="This is the address you sign in with, so it cannot be changed here.">
          <input id="email" className="input" value={profile.email} readOnly disabled />
        </Field>

        <Field label="Phone number" htmlFor="phone" required error={bad.phone}>
          <input id="phone" className="input" type="tel" value={phone}
            onChange={(e) => edit('phone', setPhone)(e.target.value)}
            aria-invalid={!!bad.phone || undefined} />
        </Field>

        <button className="btn btn-primary self-start mt-1" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Save changes
        </button>
      </form>

      {/* ---------- closing the account ---------- */}
      <div className="mt-10 pt-8 border-t max-w-[560px]" style={{ borderColor: 'var(--border)' }}>
        {requested ? (
          <div className="frame frame-tint-gold p-4 flex items-start gap-3">
            <ShieldCheck size={19} strokeWidth={1.9} style={{ color: 'var(--accent-ink)' }}
              className="flex-none mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-display font-bold text-[15px]">Closure requested</p>
              <p className="text-sm text-[var(--text-2)] mt-1">
                Asked on {dateLong(profile.deleteRequestedAt!.slice(0, 10))}. A super admin has to
                approve it before the account is closed. You can keep using the platform until then.
              </p>
              {profile.deleteRequestReason ? (
                <p className="text-sm text-[var(--text-2)] mt-2">
                  <span className="font-semibold">Your reason: </span>{profile.deleteRequestReason}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="frame frame-tint-bad p-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={17} strokeWidth={1.9} style={{ color: 'var(--bad)' }}
                className="flex-none" aria-hidden="true" />
              <p className="font-display font-bold text-[14px]">Close this account</p>
            </div>
            <p className="text-xs text-[var(--text-2)] mt-1.5 max-w-[52ch]">
              Admin has to approve a closure before it takes effect. The record and its
              teaching history are kept, so past reports still reconcile - the account simply
              stops being able to act.
            </p>
            <button type="button" className="btn btn-ghost btn-sm mt-3"
              style={{ color: 'var(--bad)' }} onClick={() => setClosing(true)}>
              <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
              Request account closure
            </button>
          </div>
        )}
      </div>

      <Confirm
        open={closing}
        onClose={() => setClosing(false)}
        title="Request that this account is closed?"
        body="Admin is notified. Approval is required before account can be closed."
        confirmLabel="Send request"
        tone="danger"
        reasonLabel="Why are you closing your account? (send to the admin)"
        onConfirm={(reason) => { void askToCloseMyAccount(reason); setClosing(false); }}
      />
    </>
  );
}
