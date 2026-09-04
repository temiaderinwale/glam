'use client';
/* Admin Manager — who is allowed to administer the platform.

   Super-admin only, and gated twice: the module is filtered out of NAV for
   anyone else (components/AppShell.tsx), and this page refuses to render its
   table without the capability. Neither gate is the real one — lib/rules.ts is,
   and firestore.rules after it — but a page that quietly renders controls it
   cannot honour is worse than one that says so.

   Every button asks lib/rules.ts whether it is allowed and, when it is not,
   stays disabled carrying the reason. The same function runs again inside the
   write, so the two can never disagree. */

import { useMemo, useState } from 'react';
import { Check, Pause, Play, ShieldPlus, Slash, UserCog } from 'lucide-react';
import {
  Badge, Confirm, EmptyState, Kpi, KpiGrid, PageHead, Pager, SearchBox,
  Select, TableWrap, Toolbar, usePaged
} from '@/components/ui';
import { useData } from '@/lib/data';
import { dateLong } from '@/lib/format';
import { exportRows } from '@/lib/csv';
import type { AccountStatus, AdminAccount } from '@/lib/types';

const STATUS_TONE: Record<AccountStatus, 'ok' | 'warn' | 'bad' | 'mute'> = {
  active: 'ok', pending: 'warn', suspended: 'bad', rejected: 'mute'
};
const STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Active', pending: 'Pending approval', suspended: 'Frozen', rejected: 'Deactivated'
};

type Pending = { admin: AdminAccount; kind: 'suspend' | 'deactivate' };

export default function AdminManagerPage() {
  const { data, myAdmin, isSuperAdmin, adminIssue, setAdminStatus, promoteAdmin } = useData();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [confirm, setConfirm] = useState<Pending | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.admins
      .filter((a) => status === 'all' || a.status === status)
      .filter((a) => !needle || [a.id, a.name, a.email, a.phone].join(' ').toLowerCase().includes(needle))
      /* Whoever still needs a decision comes first — the queue is the job. */
      .sort((a, b) =>
        Number(b.status === 'pending') - Number(a.status === 'pending') ||
        a.name.localeCompare(b.name));
  }, [data.admins, q, status]);

  const paged = usePaged(rows, 12);

  if (!isSuperAdmin) {
    return (
      <>
        <PageHead title="Admin Manager"
          sub="Administrator accounts and the decisions that govern them." />
        <EmptyState icon={UserCog} title="Super admins only"
          text="Administering other administrators is reserved for super admins. Ask a super admin to promote your account if you need this." />
      </>
    );
  }

  const nameOf = (id?: string) => data.admins.find((a) => a.id === id)?.name;

  /** A button that carries its own refusal instead of vanishing. */
  const Action = ({ admin, action, label, icon: Icon, tone, onGo }: {
    admin: AdminAccount; action: Parameters<typeof adminIssue>[1];
    label: string; icon: typeof Check; tone?: 'danger'; onGo: () => void;
  }) => {
    const issue = adminIssue(admin, action);
    return (
      <button
        className={`btn btn-sm ${tone === 'danger' ? 'btn-ghost' : 'btn-ghost'}`}
        style={tone === 'danger' && !issue ? { color: 'var(--bad)' } : undefined}
        disabled={!!issue} title={issue ?? label} aria-label={`${label} — ${admin.name}`}
        onClick={onGo}
      >
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
        {label}
      </button>
    );
  };

  const counts = {
    total: data.admins.length,
    pending: data.admins.filter((a) => a.status === 'pending').length,
    supers: data.admins.filter((a) => a.level === 'super' && a.status === 'active').length
  };

  return (
    <>
      <PageHead
        title="Admin Manager"
        sub="Every administrator registered with Glampter Consults, and the decisions that govern them."
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => exportRows('teach-clock-administrators', rows, [
            { header: 'ID', value: (a: AdminAccount) => a.id },
            { header: 'Name', value: (a: AdminAccount) => a.name },
            { header: 'Email', value: (a: AdminAccount) => a.email },
            { header: 'Phone', value: (a: AdminAccount) => a.phone },
            { header: 'Level', value: (a: AdminAccount) => a.level },
            { header: 'Status', value: (a: AdminAccount) => a.status },
            { header: 'Promoted by', value: (a: AdminAccount) => nameOf(a.promotedBy) ?? '' },
            { header: 'Registered', value: (a: AdminAccount) => a.createdAt.slice(0, 10) }
          ])}>Export CSV</button>
        }
      />

      <KpiGrid cols={3} className="mb-6">
        <Kpi label="Administrators" value={String(counts.total)} icon={UserCog} />
        <Kpi label="Awaiting approval" value={String(counts.pending)}
          sub="cannot transact until approved" tone={counts.pending ? 'warn' : undefined} />
        <Kpi label="Super admins" value={String(counts.supers)} sub="can govern other admins" tone="info" />
      </KpiGrid>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Name, email or ID" />
        <div className="min-w-[190px]">
          <Select id="f-status" label="Status" value={status} onChange={setStatus} options={[
            { value: 'all', label: 'All statuses' },
            { value: 'pending', label: 'Pending approval' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Frozen' },
            { value: 'rejected', label: 'Deactivated' }
          ]} />
        </div>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState icon={UserCog} title="No administrators match"
          text="Change the filter or clear the search to see the full list." />
      ) : (
        <>
          <TableWrap minWidth={900} head={['Administrator', 'Level', 'Status', 'Registered', 'Actions']}>
            {paged.slice.map((a: AdminAccount) => {
              const isMe = myAdmin?.id === a.id;
              const promoter = nameOf(a.promotedBy);
              return (
                <tr key={a.id}>
                  <td>
                    <div className="font-semibold">
                      {a.name}
                      {isMe ? <span className="text-xs text-[var(--text-3)] font-normal"> — you</span> : null}
                    </div>
                    <div className="text-xs text-[var(--text-3)] mono">{a.id}</div>
                    <div className="text-xs text-[var(--text-2)]">{a.email}</div>
                  </td>
                  <td>
                    {a.level === 'super'
                      ? <Badge tone="info">Super admin</Badge>
                      : <Badge tone="mute">Admin</Badge>}
                    {a.founder ? (
                      <div className="text-xs text-[var(--text-3)] mt-1">Founder</div>
                    ) : promoter ? (
                      <div className="text-xs text-[var(--text-3)] mt-1">Promoted by {promoter}</div>
                    ) : null}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                    {a.notes ? <div className="text-xs text-[var(--text-2)] mt-1 max-w-[28ch]">{a.notes}</div> : null}
                  </td>
                  <td className="text-sm text-[var(--text-2)]">{dateLong(a.createdAt.slice(0, 10))}</td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {a.status === 'pending' ? (
                        <Action admin={a} action="approve" label="Approve" icon={Check}
                          onGo={() => void setAdminStatus(a.id, 'active')} />
                      ) : null}

                      {a.status === 'active' ? (
                        <Action admin={a} action="suspend" label="Freeze" icon={Pause} tone="danger"
                          onGo={() => setConfirm({ admin: a, kind: 'suspend' })} />
                      ) : null}

                      {a.status === 'suspended' ? (
                        <Action admin={a} action="reactivate" label="Reactivate" icon={Play}
                          onGo={() => void setAdminStatus(a.id, 'active')} />
                      ) : null}

                      {a.status !== 'rejected' ? (
                        <Action admin={a} action="deactivate" label="Deactivate" icon={Slash} tone="danger"
                          onGo={() => setConfirm({ admin: a, kind: 'deactivate' })} />
                      ) : null}

                      {a.level === 'standard' ? (
                        <Action admin={a} action="promote" label="Make super admin" icon={ShieldPlus}
                          onGo={() => void promoteAdmin(a.id)} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </TableWrap>
          <Pager page={paged.page} pages={paged.pages} total={rows.length} onPage={paged.setPage} />
        </>
      )}

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'suspend' ? 'Freeze this administrator?' : 'Deactivate this administrator?'}
        body={confirm
          ? confirm.kind === 'suspend'
            ? `${confirm.admin.name} keeps their account but cannot act until a super admin reactivates them.`
            : `${confirm.admin.name} loses administrative access. The record and its history are kept.`
          : ''}
        confirmLabel={confirm?.kind === 'suspend' ? 'Freeze account' : 'Deactivate account'}
        tone="danger"
        reasonLabel="Reason (recorded on the account and in the audit log)"
        onConfirm={(reason) => {
          if (confirm) {
            void setAdminStatus(confirm.admin.id, confirm.kind === 'suspend' ? 'suspended' : 'rejected', reason);
          }
          setConfirm(null);
        }}
      />
    </>
  );
}
