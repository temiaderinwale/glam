'use client';
/* My schools — where a teacher sees what they are authorised to teach, and
   asks for access to somewhere new (the Option B assignment workflow). */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2, Clock, PlusCircle, Send } from 'lucide-react';
import {
  Badge, ChipPicker, EmptyState, Frame, Kpi, KpiGrid, Modal, PageHead, SectionHead, Select, TextArea
} from '@/components/ui';
import { approvedMinutes, groupMinutes, inMonth } from '@/lib/compute';
import { useActor, useData } from '@/lib/data';
import { dateLong, hoursLabel } from '@/lib/format';

export default function MySchoolsPage() {
  const actor = useActor();
  const { data, mySessions, saveAssignment, today } = useData();
  const [ask, setAsk] = useState(false);
  const [schoolId, setSchoolId] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const mine = useMemo(() =>
    data.assignments.filter((a) => a.teacherId === actor.teacherId),
    [data.assignments, actor.teacherId]);

  const active = mine.filter((a) => a.status === 'active');
  const requested = mine.filter((a) => a.status === 'requested');
  const month = inMonth(mySessions);

  const available = data.schools.filter((s) =>
    s.status === 'active' && !mine.some((a) => a.schoolId === s.id && a.status !== 'ended'));

  const send = async () => {
    if (!schoolId) return;
    await saveAssignment({
      teacherId: actor.teacherId, schoolId, subjects, classes,
      startDate: today, origin: 'teacher-request', status: 'requested', notes: note
    });
    setAsk(false); setSchoolId(''); setSubjects([]); setClasses([]); setNote('');
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
            <PlusCircle size={15} /> Request a school
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
          action={<button className="btn btn-primary btn-sm" onClick={() => setAsk(true)}>Request a school</button>} />
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
                  <Badge tone="warn">Pending review</Badge>
                </Frame>
              );
            })}
          </div>
        </>
      ) : null}

      <Modal open={ask} onClose={() => setAsk(false)} title="Request a school"
        sub="Glampter reviews the request. The school may be asked to confirm before you are assigned."
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAsk(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={!schoolId} onClick={() => void send()}>
              <Send size={15} /> Send request
            </button>
          </>
        }>
        <Select id="req-school" label="School" value={schoolId} onChange={setSchoolId}
          options={available.map((s) => ({ value: s.id, label: `${s.name} — ${s.city}` }))}
          placeholder={available.length ? 'Choose a school' : 'No further schools available'} />
        <ChipPicker label="Subjects you would teach" options={data.subjects.map((s) => s.name)}
          selected={subjects} onChange={setSubjects} />
        <ChipPicker label="Classes" options={data.classes.map((c) => c.name)}
          selected={classes} onChange={setClasses} />
        <TextArea id="req-note" label="Anything Glampter should know" value={note} onChange={setNote} rows={2}
          placeholder="I already teach nearby on Tuesdays and Thursdays." />
      </Modal>
    </>
  );
}
