'use client';
/* The request-to-teach queue, shown to both parties that have to sign it.

   Lives outside the dashboard because the school reaches it from Teachers as
   well, and two copies of an approval control is how they drift apart. */

import { CheckCircle2, Users, X } from 'lucide-react';
import { ApprovalPair, SectionHead, TableWrap } from '@/components/ui';
import { useActor, useData } from '@/lib/data';
import { useGlam } from '@/lib/store';
import type { Assignment } from '@/lib/types';

export default function AssignmentQueue() {
  const { role } = useGlam();
  const actor = useActor();
  const { data, signAssignment, awaiting } = useData();

  if (role !== 'admin' && role !== 'school') return null;

  const mine = data.assignments.filter((a) =>
    a.status === 'requested'
    && (role === 'admin' || a.schoolId === actor.schoolId));
  if (!mine.length) return null;

  const signed = (a: Assignment) =>
    role === 'school' ? Boolean(a.schoolApprovedAt) : Boolean(a.adminApprovedAt);

  return (
    <section className="mb-6">
      <SectionHead title="Requests to teach" icon={Users}
        right={`${mine.length} awaiting a decision`} />
      <TableWrap minWidth={820} head={['Teacher', 'School', 'Covers', 'Approvals', 'Decision']}>
        {mine.map((a) => {
          const teacher = data.teachers.find((t) => t.id === a.teacherId);
          const school = data.schools.find((x) => x.id === a.schoolId);
          return (
            <tr key={a.id}>
              <td>
                <div className="font-semibold">{teacher?.name ?? a.teacherId}</div>
                <div className="text-xs text-[var(--text-3)] mono">{a.id}</div>
              </td>
              <td className="text-sm">{school?.name ?? a.schoolId}</td>
              <td className="text-sm text-[var(--text-2)]">
                {a.subjects.join(', ') || 'Any subject'} · {a.classes.join(', ') || 'any class'}
              </td>
              <td>
                <ApprovalPair school={a.schoolApprovedAt} admin={a.adminApprovedAt}
                  sides={role === 'school' ? 'school' : 'both'} />
                {role !== 'school' ? (
                  <div className="text-xs text-[var(--text-3)] mt-1">{awaiting(a)}</div>
                ) : null}
              </td>
              <td>
                <div className="flex flex-wrap gap-1.5">
                  <button className="btn btn-ghost btn-sm" disabled={signed(a)}
                    title={signed(a) ? 'You have already approved this' : 'Approve'}
                    onClick={() => void signAssignment(a.id, true)}>
                    <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
                    {signed(a) ? 'Approved' : 'Approve'}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--bad)' }}
                    onClick={() => void signAssignment(a.id, false)}>
                    <X size={14} strokeWidth={2} aria-hidden="true" /> Reject
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </TableWrap>
    </section>
  );
}
