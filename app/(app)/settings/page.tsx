'use client';
/* Settings — the values that change how the rest of the product behaves.
   The teaching period length, the approval SLA and the school-hours window are
   read by the rules engine, so editing them here changes what gets flagged. */

import { useEffect, useState } from 'react';
import { Building2, Check, Clock, Database, RotateCcw, ShieldCheck } from 'lucide-react';
import {
  Confirm, EmptyState, Frame, PageHead, SectionHead, Select, TextArea, TextInput
} from '@/components/ui';
import { BrandWord } from '@/components/Brand';
import { useActor, useData } from '@/lib/data';
import type { OrgSettings } from '@/lib/types';

export default function SettingsPage() {
  const actor = useActor();
  const { data, saveSettings, source, resetDemoData } = useData();
  const [form, setForm] = useState<OrgSettings>(data.settings);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => { setForm(data.settings); }, [data.settings]);

  const set = (patch: Partial<OrgSettings>) => { setForm({ ...form, ...patch }); setSaved(false); };

  const commit = async () => {
    await saveSettings(form);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2600);
  };

  if (actor.role !== 'admin') {
    return (
      <>
        <PageHead title="Settings" />
        <EmptyState icon={ShieldCheck} title="Organisation settings are administrator-only"
          text="Your own name, email and password are managed from your account menu." />
      </>
    );
  }

  return (
    <>
      <PageHead title="Settings"
        sub="Organisation details and the operating rules the platform enforces."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => void commit()}>
            {saved ? <><Check size={15} /> Saved</> : 'Save changes'}
          </button>
        } />

      <div className="grid-2">
        <Frame brackets>
          <SectionHead title="Organisation" icon={Building2} />
          <div className="stack">
            <TextInput id="st-name" label="Organisation name" value={form.orgName} onChange={(v) => set({ orgName: v })} />
            <TextInput id="st-tag" label="Tagline" value={form.tagline} onChange={(v) => set({ tagline: v })} />
            <div className="grid-2">
              <TextInput id="st-email" label="Email" type="email" value={form.email} onChange={(v) => set({ email: v })} />
              <TextInput id="st-phone" label="Phone" value={form.phone} onChange={(v) => set({ phone: v })} />
            </div>
            <TextArea id="st-addr" label="Address" value={form.address} onChange={(v) => set({ address: v })} rows={2} />
            <div className="grid-2">
              <Select id="st-tz" label="Time zone" value={form.timezone} onChange={(v) => set({ timezone: v })}
                options={[{ value: 'Africa/Lagos', label: 'Africa/Lagos (WAT)' },
                  { value: 'UTC', label: 'UTC' }]} />
              <Select id="st-cur" label="Currency" value={form.currency} onChange={(v) => set({ currency: v })}
                options={[{ value: 'NGN', label: 'Nigerian naira (₦)' }]} />
            </div>
          </div>
        </Frame>

        <Frame brackets>
          <SectionHead title="Teaching and approval rules" icon={Clock} />
          <div className="stack">
            <TextInput id="st-period" label="Standard teaching period (minutes)" type="number"
              value={String(form.periodMinutes)} onChange={(v) => set({ periodMinutes: Number(v) || 45 })}
              hint="Used to convert recorded hours into periods on every session." />
            <TextInput id="st-sla" label="Approval turnaround target (hours)" type="number"
              value={String(form.approvalSlaHours)} onChange={(v) => set({ approvalSlaHours: Number(v) || 48 })}
              hint="Sessions pending longer than this appear as exceptions." />
            <TextInput id="st-max" label="Maximum teaching hours in a day" type="number"
              value={String(form.maxDailyHours)} onChange={(v) => set({ maxDailyHours: Number(v) || 8 })}
              hint="A day above this is flagged for review, not rejected." />
            <div className="grid-2">
              <TextInput id="st-open" label="School day opens" type="time" value={form.schoolOpen}
                onChange={(v) => set({ schoolOpen: v })} />
              <TextInput id="st-close" label="School day closes" type="time" value={form.schoolClose}
                onChange={(v) => set({ schoolClose: v })} />
            </div>
            <TextInput id="st-late" label="Late submission threshold (days)" type="number"
              value={String(form.lateSubmissionDays)} onChange={(v) => set({ lateSubmissionDays: Number(v) || 7 })}
              hint="Sessions logged later than this carry a late-submission flag." />
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" className="mt-1" checked={form.allowTeacherRequests}
                onChange={(e) => set({ allowTeacherRequests: e.target.checked })} />
              <span>Let teachers request access to a school themselves (you still approve each request).</span>
            </label>
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" className="mt-1" checked={form.requireEvidence}
                onChange={(e) => set({ requireEvidence: e.target.checked })} />
              <span>Require supporting evidence on every session (lesson note or attendance sheet).</span>
            </label>
          </div>
        </Frame>
      </div>

      <div className="mt-6">
        <Frame>
          <SectionHead title="Data source" icon={Database} />
          <dl className="dl">
            <dt>Running on</dt>
            <dd>
              {source === 'firestore'
                ? 'Firestore — orgs/glampter, live across every signed-in account.'
                : 'In-memory repository, seeded from the demo dataset and held for this browser session.'}
            </dd>
            <dt>Records</dt>
            <dd>
              {data.sessions.length} sessions · {data.teachers.length} teachers · {data.schools.length} schools
              {' '}· {data.auditLogs.length} audit entries
            </dd>
          </dl>
          {source === 'memory' ? (
            <>
              <p className="text-sm text-[var(--text-2)] mt-4 max-w-[70ch]">
                Every workflow in <BrandWord /> is fully operable here — submitting, approving,
                correcting, assigning — and each change writes an audit entry exactly as it will
                against Firestore. Sign in with an approved account to switch to the live database.
              </p>
              <button className="btn btn-ghost btn-sm mt-4" onClick={() => setResetting(true)}>
                <RotateCcw size={15} /> Reset demo data
              </button>
            </>
          ) : null}
        </Frame>
      </div>

      <Confirm open={resetting} onClose={() => setResetting(false)}
        title="Reset the demo data" confirmLabel="Reset and reload"
        body="Everything you have submitted, approved or edited in this session is discarded and the original dataset is restored."
        onConfirm={resetDemoData} />
    </>
  );
}
