'use client';
/* Subjects, classes and academic periods — configuration rather than hard-coded
   lists, because schools name their classes differently and terms move. */

import { useState } from 'react';
import { BookOpen, CalendarRange, GraduationCap, PlusCircle } from 'lucide-react';
import {
  Badge, EmptyState, Frame, Modal, PageHead, SectionHead, TableWrap, TextInput
} from '@/components/ui';
import { useActor, useData } from '@/lib/data';
import { dateLong } from '@/lib/format';
import type { AcademicSession, ClassLevel, Subject } from '@/lib/types';

export default function SubjectsPage() {
  const actor = useActor();
  const { data, saveSubject, saveClass, saveAcademicSession, mySessions } = useData();
  const [tab, setTab] = useState<'subjects' | 'classes' | 'periods'>('subjects');
  const [subject, setSubject] = useState<Partial<Subject> | null>(null);
  const [cls, setCls] = useState<Partial<ClassLevel> | null>(null);
  const [period, setPeriod] = useState<Partial<AcademicSession> | null>(null);

  const useCount = (name: string, kind: 'subject' | 'class') =>
    mySessions.filter((s) => (kind === 'subject' ? s.subject : s.className) === name).length;

  if (actor.role !== 'admin') {
    return (
      <>
        <PageHead title="Subjects & classes" />
        <EmptyState icon={BookOpen} title="Glampter configures the curriculum lists"
          text="Subjects and classes offered at your school are set by the consulting firm and appear in the session form." />
      </>
    );
  }

  return (
    <>
      <PageHead title="Subjects &amp; classes"
        sub="The lists every teaching session is recorded against."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => {
            if (tab === 'subjects') setSubject({ name: '', active: true });
            else if (tab === 'classes') setCls({ name: '', active: true });
            else setPeriod({ name: '', term: 'First Term', current: false });
          }}>
            <PlusCircle size={15} /> Add {tab === 'subjects' ? 'subject' : tab === 'classes' ? 'class' : 'period'}
          </button>
        } />

      <div className="tabs">
        {([['subjects', 'Subjects', data.subjects.length],
           ['classes', 'Classes', data.classes.length],
           ['periods', 'Academic periods', data.academicSessions.length]] as const).map(([k, l, n]) => (
          <button key={k} className={`tab${tab === k ? ' is-on' : ''}`} onClick={() => setTab(k)}>
            {l}<span className="tab-count">{n}</span>
          </button>
        ))}
      </div>

      {tab === 'subjects' ? (
        <TableWrap minWidth={640} head={['Subject', 'ID', 'Sessions recorded', 'Status', '']}>
          {data.subjects.map((s) => (
            <tr key={s.id}>
              <td className="font-medium">{s.name}</td>
              <td className="num">{s.id}</td>
              <td className="num">{useCount(s.name, 'subject')}</td>
              <td className="text-right"><Badge tone={s.active ? 'ok' : 'mute'}>{s.active ? 'active' : 'retired'}</Badge></td>
              <td className="text-right">
                <button className="btn btn-ghost btn-sm" onClick={() => setSubject(s)}>Edit</button>
              </td>
            </tr>
          ))}
        </TableWrap>
      ) : null}

      {tab === 'classes' ? (
        <TableWrap minWidth={640} head={['Class', 'ID', 'Order', 'Sessions recorded', 'Status', '']}>
          {[...data.classes].sort((a, b) => a.order - b.order).map((c) => (
            <tr key={c.id}>
              <td className="font-medium">{c.name}</td>
              <td className="num">{c.id}</td>
              <td className="num">{c.order}</td>
              <td className="num">{useCount(c.name, 'class')}</td>
              <td className="text-right"><Badge tone={c.active ? 'ok' : 'mute'}>{c.active ? 'active' : 'retired'}</Badge></td>
              <td className="text-right">
                <button className="btn btn-ghost btn-sm" onClick={() => setCls(c)}>Edit</button>
              </td>
            </tr>
          ))}
        </TableWrap>
      ) : null}

      {tab === 'periods' ? (
        <TableWrap minWidth={720} head={['Session', 'Term', 'Starts', 'Ends', 'Current', '']}>
          {data.academicSessions.map((a) => (
            <tr key={a.id}>
              <td className="font-medium">{a.name}</td>
              <td className="text-right">{a.term}</td>
              <td className="num">{dateLong(a.startDate)}</td>
              <td className="num">{dateLong(a.endDate)}</td>
              <td className="text-right">{a.current ? <Badge tone="ok">current</Badge> : null}</td>
              <td className="text-right">
                <button className="btn btn-ghost btn-sm" onClick={() => setPeriod(a)}>Edit</button>
              </td>
            </tr>
          ))}
        </TableWrap>
      ) : null}

      <p className="text-xs text-[var(--text-3)] mt-4 max-w-[70ch]">
        Retiring a subject or class hides it from new sessions without touching the records already
        filed against it — historical reports stay intact.
      </p>

      <Modal open={Boolean(subject)} onClose={() => setSubject(null)}
        title={subject?.id ? 'Edit subject' : 'Add subject'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setSubject(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!subject?.name?.trim()}
              onClick={async () => { if (subject) { await saveSubject(subject); setSubject(null); } }}>Save</button>
          </>
        }>
        {subject ? (
          <>
            <TextInput id="sub-name" label="Subject name" value={subject.name ?? ''}
              onChange={(v) => setSubject({ ...subject, name: v })} placeholder="Further Mathematics" />
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={subject.active ?? true}
                onChange={(e) => setSubject({ ...subject, active: e.target.checked })} />
              Offer this subject on new sessions
            </label>
          </>
        ) : null}
      </Modal>

      <Modal open={Boolean(cls)} onClose={() => setCls(null)}
        title={cls?.id ? 'Edit class' : 'Add class'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCls(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!cls?.name?.trim()}
              onClick={async () => { if (cls) { await saveClass(cls); setCls(null); } }}>Save</button>
          </>
        }>
        {cls ? (
          <>
            <TextInput id="cls-name" label="Class name" value={cls.name ?? ''}
              onChange={(v) => setCls({ ...cls, name: v })} placeholder="JSS2" />
            <TextInput id="cls-order" label="Order" type="number" value={String(cls.order ?? '')}
              onChange={(v) => setCls({ ...cls, order: Number(v) || 0 })}
              hint="Controls the order classes appear in every dropdown." />
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={cls.active ?? true}
                onChange={(e) => setCls({ ...cls, active: e.target.checked })} />
              Offer this class on new sessions
            </label>
          </>
        ) : null}
      </Modal>

      <Modal open={Boolean(period)} onClose={() => setPeriod(null)}
        title={period?.id ? 'Edit academic period' : 'Add academic period'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setPeriod(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!period?.name?.trim()}
              onClick={async () => { if (period) { await saveAcademicSession(period); setPeriod(null); } }}>Save</button>
          </>
        }>
        {period ? (
          <>
            <div className="grid-2">
              <TextInput id="ac-name" label="Academic session" value={period.name ?? ''}
                onChange={(v) => setPeriod({ ...period, name: v })} placeholder="2026/2027" />
              <TextInput id="ac-term" label="Term" value={period.term ?? ''}
                onChange={(v) => setPeriod({ ...period, term: v })} placeholder="First Term" />
            </div>
            <div className="grid-2">
              <TextInput id="ac-start" label="Starts" type="date" value={period.startDate ?? ''}
                onChange={(v) => setPeriod({ ...period, startDate: v })} />
              <TextInput id="ac-end" label="Ends" type="date" value={period.endDate ?? ''}
                onChange={(v) => setPeriod({ ...period, endDate: v })} />
            </div>
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={period.current ?? false}
                onChange={(e) => setPeriod({ ...period, current: e.target.checked })} />
              This is the current period — new sessions are filed against it
            </label>
          </>
        ) : null}
      </Modal>
    </>
  );
}
