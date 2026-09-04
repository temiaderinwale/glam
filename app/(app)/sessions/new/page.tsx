'use client';
/* Log a teaching session — the teacher's core action, built phone-first.
   School → subject → class → time → submit, and nothing else in the way. */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Loader2, PlusCircle, Save } from 'lucide-react';
import { Frame, PageHead, EmptyState } from '@/components/ui';
import { SessionForm, emptyDraft } from '@/components/SessionParts';
import { useActor, useData } from '@/lib/data';
import type { Issue, SessionDraft } from '@/lib/rules';
import { activeAssignment } from '@/lib/rules';

export default function LogSessionPage() {
  const router = useRouter();
  const actor = useActor();
  const { data, today, saveSession } = useData();
  const [draft, setDraft] = useState<SessionDraft>(() => emptyDraft(actor.teacherId ?? '', today));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const assigned = data.assignments.filter(
    (a) => a.teacherId === actor.teacherId && a.status === 'active');

  const go = async (submit: boolean) => {
    setBusy(true);
    const res = await saveSession(draft, { submit });
    setBusy(false);
    setIssues(res.issues);
    if (res.ok && res.id) {
      if (submit) setDone(res.id);
      else router.push('/sessions');
    }
  };

  if (actor.role !== 'teacher') {
    return (
      <>
        <PageHead title="Log teaching session" />
        <EmptyState title="Only teachers log sessions"
          text="Switch to the teacher view to record a class. Schools confirm sessions from the approval queue; administrators can correct them from teaching history."
          action={<Link href="/approvals" className="btn btn-primary btn-sm">Open approval queue</Link>} />
      </>
    );
  }

  if (done) {
    return (
      <>
        <PageHead title="Session submitted" />
        <Frame brackets className="text-center py-12 flex flex-col items-center gap-4">
          <CheckCircle2 size={30} strokeWidth={1.7} style={{ color: 'var(--ok)' }} aria-hidden="true" />
          <h2 className="text-2xl font-extrabold">Sent to the school for confirmation</h2>
          <p className="text-sm text-[var(--text-2)] max-w-[52ch]">
            Session <span className="mono">{done}</span> is now in {draft.schoolId
              ? data.schools.find((s) => s.id === draft.schoolId)?.name : 'the school'}’s approval queue.
            You will be notified when it is approved, or if they ask you to correct anything.
          </p>
          <div className="flex gap-3 mt-2">
            <button className="btn btn-primary" onClick={() => {
              setDraft(emptyDraft(actor.teacherId ?? '', today)); setDone(null);
            }}>Log another</button>
            <Link href="/sessions" className="btn btn-ghost">Teaching history</Link>
          </div>
        </Frame>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Log teaching session"
        sub="Record the class while it is fresh. Duration is worked out from the times you enter."
      />

      {!assigned.length ? (
        <EmptyState title="No active school assignments"
          text="You can only submit sessions to schools you are assigned to. Request one and Glampter will review it."
          action={<Link href="/my-schools" className="btn btn-primary btn-sm">Request a school</Link>} />
      ) : (
        <div className="max-w-[720px]">
          <Frame brackets>
            <SessionForm draft={draft} setDraft={setDraft} issues={issues} />
            {issues.length ? (
              <p className="field-error mt-4" role="alert">
                {issues.length} thing{issues.length === 1 ? '' : 's'} to fix before this can be submitted.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3 mt-6 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => void go(true)}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
                Submit for approval
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void go(false)}>
                <Save size={15} /> Save as draft
              </button>
            </div>
          </Frame>

          <p className="text-xs text-[var(--text-3)] mt-4 max-w-[62ch]">
            Submitting sends the record to the school named above. They confirm it, reject it with a
            reason, or ask you to correct it — you are notified either way.
          </p>
        </div>
      )}
    </>
  );
}
