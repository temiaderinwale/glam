'use client';
/* My schools — where a teacher sees what they are authorised to teach, and
   asks for access to somewhere new (the Option B assignment workflow). */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Clock, LogOut, PlusCircle, Send } from 'lucide-react';
import {
  ApprovalPair, Badge, ChipPicker, Confirm, EmptyState, Frame, Kpi, KpiGrid, Modal, PageHead,
  SectionHead, Select, TextArea
} from '@/components/ui';
import { approvedMinutes, groupMinutes, inMonth } from '@/lib/compute';
import { useActor, useData } from '@/lib/data';
import { useGlam } from '@/lib/store';
import { dateLong, hoursLabel } from '@/lib/format';

export default function MySchoolsPage() {
  const actor = useActor();
  const { say } = useGlam();
  const {
    data, mySessions, saveAssignment, reviseMyAssignment, withdrawFromSchool, awaiting, today
  } = useData();
  const [ask, setAsk] = useState(false);
  const [schoolId, setSchoolId] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [leaving, setLeaving] = useState(false);

  const mine = useMemo(() =>
    data.assignments.filter((a) => a.teacherId === actor.teacherId),
    [data.assignments, actor.teacherId]);

  const active = mine.filter((a) => a.status === 'active');
  const requested = mine.filter((a) => a.status === 'requested');
  const month = inMonth(mySessions);

  /* An account still under review cannot hold an assignment, so offering the
     request form would be offering something that cannot be granted. */
  const canRequest = actor.status === 'active';

  /* Every school the firm has approved is listed, always - including the ones
     this teacher already works with. Hiding them made a school the teacher was
     looking for simply not exist, with nothing on screen to say why. What a
     school already holds is answered when it is chosen, where the answer can
     also offer something to do about it. */
  const available = data.schools.filter((s) => s.status === 'active');

  const chosen = data.schools.find((s) => s.id === schoolId);
  const held = mine.find((a) => a.schoolId === schoolId && a.status === 'active');
  const openRequest = mine.find((a) => a.schoolId === schoolId && a.status === 'requested');

  /* Choosing a school you already teach at turns the form into an edit of that
     placement, so the pickers start from what it actually covers today. */
  useEffect(() => {
    const current = held ?? openRequest;
    setSubjects(current ? [...current.subjects] : []);
    setClasses(current ? [...current.classes] : []);
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  const changedCover = (a: { subjects: string[]; classes: string[] }) =>
    [...a.subjects].sort().join('|') !== [...subjects].sort().join('|')
    || [...a.classes].sort().join('|') !== [...classes].sort().join('|');

  const closeAsk = () => {
    setAsk(false); setSchoolId(''); setSubjects([]); setClasses([]); setNote('');
  };

  const send = async () => {
    if (!schoolId) return;
    /* Without the link the write cannot satisfy the rules, so say what is
       wrong rather than letting it fail as an opaque error. */
    if (!actor.teacherId) {
      say('Your teaching record is still being set up. Try again shortly, or ask Glampter Consults to check the account.');
      return;
    }
    await saveAssignment({
      teacherId: actor.teacherId, schoolId, subjects, classes,
      startDate: today, origin: 'teacher-request', status: 'requested', notes: note
    });
    closeAsk();
  };

  if (actor.role !== 'teacher') {
    return (
      <>
        <PageHead title="My schools" />
        <EmptyState icon={Building2} title="This is the teacher’s view"
          text="Administrators manage the same relationships from Assignments, where requests are approved and school placements are created."
          action={<Link href="/assignments" className="btn btn-primary btn-sm">Open assignments</Link>} />
      </>
    );
  }

  return (
    <>
      <PageHead title="My schools"
        sub="The schools you may submit sessions to, and what your assignment covers at each."
        actions={data.settings.allowTeacherRequests ? (
          <button className="btn btn-primary btn-sm" onClick={() => setAsk(true)}>
            <PlusCircle size={15} /> Request to teach in a school
          </button>
        ) : null} />

      <KpiGrid cols={3} className="mb-6">
        <Kpi label="Active assignments" value={String(active.length)} sub="you can submit to these" tone="ok" />
        <Kpi label="Requests pending" value={String(requested.length)} sub="with Glampter for review" tone="warn" />
        <Kpi label="Approved this month" value={hoursLabel(approvedMinutes(month))} sub="across all your schools" />
      </KpiGrid>

      <SectionHead title="Active assignments" icon={Building2} />
      {active.length ? (
        <div className="grid-2 mb-8">
          {active.map((a) => {
            const school = data.schools.find((s) => s.id === a.schoolId);
            const hrs = groupMinutes(month.filter((s) => s.schoolId === a.schoolId), () => 'x', true)[0]?.minutes ?? 0;
            return (
              <Frame key={a.id} brackets>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-extrabold truncate">{school?.name}</h3>
                    <p className="text-sm text-[var(--text-2)]">{school?.address}, {school?.city}</p>
                  </div>
                  <Badge tone="ok">Active</Badge>
                </div>
                <dl className="dl mt-4">
                  <dt>Since</dt><dd>{dateLong(a.startDate)}</dd>
                  <dt>Subjects</dt><dd>{a.subjects.join(', ') || 'All subjects'}</dd>
                  <dt>Classes</dt><dd>{a.classes.join(', ') || 'All classes'}</dd>
                  <dt>Contact</dt><dd>{school?.contact} · {school?.phone}</dd>
                  <dt>This month</dt><dd><strong>{hoursLabel(hrs)}</strong> approved</dd>
                </dl>
                <div className="mt-4 pt-4 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
                  <Link href="/sessions/new" className="btn btn-primary btn-sm">Log a session here</Link>
                  <span className="mono text-xs text-[var(--text-3)] self-center ml-auto">{a.id}</span>
                </div>
              </Frame>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Building2} title="No active assignments yet"
          text="Glampter assigns you to a school, or you can ask for one. Until then you cannot submit teaching sessions."
          action={<button className="btn btn-primary btn-sm" onClick={() => setAsk(true)}>Request to teach in a school</button>} />
      )}

      {requested.length ? (
        <>
          <SectionHead title="Awaiting a decision" icon={Clock} />
          <div className="stack mb-8">
            {requested.map((a) => {
              const school = data.schools.find((s) => s.id === a.schoolId);
              return (
                <Frame key={a.id} className="flex flex-wrap items-center gap-4 justify-between">
                  <div>
                    <p className="font-semibold">{school?.name}</p>
                    <p className="text-sm text-[var(--text-2)]">
                      {a.subjects.join(', ') || 'Any subject'} · requested {dateLong(a.createdAt.slice(0, 10))}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge tone="warn">{awaiting(a)}</Badge>
                    <ApprovalPair school={a.schoolApprovedAt} admin={a.adminApprovedAt} />
                  </div>
                </Frame>
              );
            })}
          </div>
        </>
      ) : null}

      <Modal open={ask && !canRequest} onClose={() => setAsk(false)}
        title="Your account is under review"
        footer={<button className="btn btn-primary" onClick={() => setAsk(false)}>Got it</button>}>
        <p className="text-sm text-[var(--text-2)]">
          Glampter Consults is still checking your details. Requesting a school opens up as
          soon as an administrator activates the account — there is nothing else you need to do.
        </p>
      </Modal>

      <Modal open={ask && canRequest} onClose={closeAsk}
        title={held ? 'You already teach at this school' : 'Request to teach in a school'}
        sub={held
          ? undefined
          : 'Glampter reviews the request. The school may be asked to confirm before you are assigned.'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={closeAsk}>Close</button>
            {held ? (
              <button className="btn btn-primary" disabled={!changedCover(held)}
                title={changedCover(held) ? undefined : 'Change a subject or a class first'}
                onClick={() => { void reviseMyAssignment(held.id, subjects, classes); closeAsk(); }}>
                <Check size={15} /> Save changes
              </button>
            ) : openRequest ? null : (
              <button className="btn btn-primary" disabled={!schoolId} onClick={() => void send()}>
                <Send size={15} /> Send request
              </button>
            )}
          </>
        }>
        {/* Every approved school, and only the subjects and classes an
            administrator has actually created. An empty list is a real answer
            here, so it says so rather than looking broken. */}
        <Select id="req-school" label="School" value={schoolId} onChange={setSchoolId}
          options={available.map((s) => ({ value: s.id, label: s.city ? `${s.name} — ${s.city}` : s.name }))}
          placeholder={available.length ? 'Choose a school' : 'No approved schools yet'}
          hint={available.length
            ? undefined
            : 'A school appears here once Glampter Consults has approved its registration.'} />

        {/* Already placed here: say so plainly, then offer the two things that
            are actually still open - change what you cover, or leave. */}
        {held ? (
          <div className="frame frame-flat p-4 mb-1">
            <p className="text-sm">
              <strong>You are already a teacher at {chosen?.name ?? 'this school'}.</strong>{' '}
              Placed since {dateLong(held.startDate)}.
            </p>
            <p className="text-sm text-[var(--text-2)] mt-1.5">
              You can change the subjects and classes you cover below, or withdraw from the
              school. Changing what you cover goes back to the school and Glampter to approve,
              because a session is only ever checked against what was agreed.
            </p>
            <button type="button" className="btn btn-ghost btn-sm mt-3"
              style={{ color: 'var(--withdraw)' }} onClick={() => setLeaving(true)}>
              <LogOut size={14} strokeWidth={2} aria-hidden="true" />
              Withdraw from this school
            </button>
          </div>
        ) : null}

        {/* Asked already, and not yet decided. */}
        {!held && openRequest ? (
          <div className="frame frame-tint-gold p-4 mb-1">
            <p className="text-sm">
              <strong>Your request to {chosen?.name ?? 'this school'} is already in.</strong>{' '}
              Sent {dateLong(openRequest.createdAt.slice(0, 10))}.
            </p>
            <p className="text-sm text-[var(--text-2)] mt-1.5">{awaiting(openRequest)}.</p>
            <div className="mt-2"><ApprovalPair school={openRequest.schoolApprovedAt}
              admin={openRequest.adminApprovedAt} /></div>
          </div>
        ) : null}

        {!openRequest || held ? (
          <>
            <ChipPicker label={held ? 'Subjects you cover' : 'Subjects you would teach'}
              options={data.subjects.map((s) => s.name)}
              selected={subjects} onChange={setSubjects}
              hint={data.subjects.length ? undefined : 'Glampter Consults has not added any subjects yet.'} />
            <ChipPicker label="Classes" options={data.classes.map((c) => c.name)}
              selected={classes} onChange={setClasses}
              hint={data.classes.length ? undefined : 'Glampter Consults has not added any classes yet.'} />
          </>
        ) : null}

        {!held && !openRequest ? (
          <TextArea id="req-note" label="Anything Glampter should know" value={note} onChange={setNote} rows={2}
            placeholder="I already teach nearby on Tuesdays and Thursdays." />
        ) : null}
      </Modal>

      <Confirm
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`Withdraw from ${chosen?.name ?? 'this school'}?`}
        body="You stop being able to submit sessions here. The sessions you have already taught are kept, so past reports still reconcile. The school and Glampter are both told."
        confirmLabel="Withdraw"
        tone="danger"
        reasonLabel="Why are you withdrawing? (sent to the school and Glampter)"
        onConfirm={(reason) => {
          if (held) void withdrawFromSchool(held.id, reason);
          setLeaving(false); closeAsk();
        }}
      />
    </>
  );
}
