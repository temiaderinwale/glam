'use client';
/* The audit trail — who did what, when, and what changed. Read-only by design:
   there is no edit or delete on this page, and the rules file blocks writes from
   client accounts entirely. A log that can be altered proves nothing. */

import { useMemo, useState } from 'react';
import { Download, Search, ShieldCheck } from 'lucide-react';
import {
  Badge, EmptyState, Kpi, KpiGrid, PageHead, Pager, SearchBox, Select, TableWrap,
  Toolbar, usePaged
} from '@/components/ui';
import { useActor, useData } from '@/lib/data';
import { stamp } from '@/lib/format';
import { exportRows } from '@/lib/csv';
import type { AuditEntry } from '@/lib/types';

const ACTIONS = [
  ['session', 'Teaching sessions'], ['teacher', 'Teachers'], ['school', 'Schools'],
  ['assignment', 'Assignments'], ['document', 'Documents'], ['settings', 'Settings']
] as const;

export default function AuditPage() {
  const actor = useActor();
  const { data } = useData();
  const [q, setQ] = useState('');
  const [object, setObject] = useState('all');
  const [from, setFrom] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...data.auditLogs]
      .filter((e) => object === 'all' || e.objectType === object)
      .filter((e) => !from || e.at.slice(0, 10) >= from)
      .filter((e) => !needle || [e.actor, e.action, e.objectId, e.summary].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [data.auditLogs, q, object, from]);

  const paged = usePaged(rows, 20);

  if (actor.role !== 'admin') {
    return (
      <>
        <PageHead title="Audit log" />
        <EmptyState icon={ShieldCheck} title="The audit trail is administrator-only"
          text="Your own records carry their history: open any session to see its corrections and who approved it." />
      </>
    );
  }

  return (
    <>
      <PageHead title="Audit log"
        sub="Every consequential action, in order. Entries cannot be edited or removed."
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => exportRows('teach-clock-audit', rows, [
            { header: 'When', value: (e: AuditEntry) => e.at },
            { header: 'Actor', value: (e: AuditEntry) => e.actor },
            { header: 'Role', value: (e: AuditEntry) => e.actorRole },
            { header: 'Action', value: (e: AuditEntry) => e.action },
            { header: 'Object', value: (e: AuditEntry) => `${e.objectType} ${e.objectId}` },
            { header: 'Summary', value: (e: AuditEntry) => e.summary },
            { header: 'Before', value: (e: AuditEntry) => e.before ?? '' },
            { header: 'After', value: (e: AuditEntry) => e.after ?? '' }
          ])}><Download size={15} /> Export</button>
        } />

      <KpiGrid cols={4} className="mb-6">
        <Kpi label="Entries" value={String(data.auditLogs.length)} sub="recorded to date" />
        <Kpi label="Approvals" value={String(data.auditLogs.filter((e) => e.action.endsWith('approved')).length)} sub="session decisions" tone="ok" />
        <Kpi label="Rejections" value={String(data.auditLogs.filter((e) => e.action.endsWith('rejected')).length)} sub="with recorded reasons" tone="bad" />
        <Kpi label="Corrections" value={String(data.auditLogs.filter((e) => e.action.includes('resubmit') || e.action.endsWith('correction')).length)} sub="records amended" tone="warn" />
      </KpiGrid>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Actor, session ID, action…" />
        <div className="min-w-[180px]">
          <Select id="au-object" label="Object" value={object} onChange={setObject}
            options={[{ value: 'all', label: 'Everything' },
              ...ACTIONS.map(([v, l]) => ({ value: v, label: l }))]} />
        </div>
        <div className="min-w-[150px]">
          <label className="field-label" htmlFor="au-from">From</label>
          <input id="au-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
      </Toolbar>

      {rows.length ? (
        <>
          <TableWrap minWidth={1020} head={['When', 'Actor', 'Action', 'Object', 'What changed']}>
            {paged.slice.map((e) => (
              <tr key={e.id}>
                <td className="num">{stamp(e.at)}</td>
                <td className="text-right">
                  <span className="block">{e.actor}</span>
                  <span className="text-xs text-[var(--text-3)] capitalize">{e.actorRole}</span>
                </td>
                <td className="text-right"><span className="mono text-xs">{e.action}</span></td>
                <td className="text-right"><span className="mono text-xs">{e.objectId}</span></td>
                <td>
                  <span className="block">{e.summary}</span>
                  {e.before || e.after ? (
                    <span className="text-xs text-[var(--text-3)] mono">
                      {e.before ?? '—'} → {e.after ?? '—'}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </TableWrap>
          <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={paged.setPage} />
        </>
      ) : (
        <EmptyState icon={Search} title="No entries match" text="Widen the date or clear the filter." />
      )}

      <p className="text-xs text-[var(--text-3)] mt-4 max-w-[74ch]">
        Audit entries are written by the same code path that performs each action, so a change cannot
        happen without one. In Firestore they are readable by administrators and writable only from a
        trusted server context.
      </p>
    </>
  );
}
