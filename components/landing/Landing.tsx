'use client';
/* Teach Clock — the public page.

   Audience is split: a school director deciding whether to trust the firm, and a
   teacher who will be asked to sign up. The director is spoken to first.

   The hero's thesis is the lifecycle rail — the product's whole argument is that
   a teaching session is a record that moves through verification, so the page
   opens with that object rather than with a stat block. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Building2, ChevronDown, GraduationCap, Lock, MessageSquareWarning, Repeat2,
  ScanSearch, ShieldCheck, Users
} from 'lucide-react';
import LandingNav from './LandingNav';
import Reveal from './Reveal';
import { BrandWord, GlampterLine, Lockup, Mark } from '../Brand';
import { Badge, Frame, Kpi, KpiGrid, LifecycleRail } from '../ui';
import { approvalRate, approvedMinutes, dailySeries, groupMinutes, inLastDays, inMonth } from '@/lib/compute';
import { schools, sessions } from '@/lib/demo';
import { hours, hoursLabel, pct } from '@/lib/format';

/* ---------- 4. How it works ---------- */
const STEPS = [
  {
    title: 'The firm assigns the teacher',
    body: 'Glampter assigns a teacher to a school with the subjects and classes they are authorised to take. A teacher can never submit a session to a school they are not assigned to.',
    detail: ['Assignment carries subjects, classes and dates', 'History is kept, so past terms still report correctly', 'Schools can request a teacher; teachers can request a school']
  },
  {
    title: 'The teacher teaches',
    body: 'Nothing changes about the classroom. The teacher takes the period exactly as they do today.',
    detail: ['No hardware, no scanner, no new routine', 'Works on a mid-range Android over mobile data', 'Optional check-in arrives in a later phase']
  },
  {
    title: 'The teacher submits the session',
    body: 'School, subject, class, date, start and end time, topic. Duration is calculated from the times entered — it is never typed, so it cannot drift.',
    detail: ['Under a minute, standing in the corridor', 'Overlapping and duplicate entries are flagged', 'Every submission gets an ID like TS-000928']
  },
  {
    title: 'The school verifies it',
    body: 'The school opens the record and confirms the teaching happened. It can approve, reject with a reason, or ask for a correction.',
    detail: ['A rejection always carries an explanation', 'Approved records lock against ordinary editing', 'A school only ever sees its own records']
  },
  {
    title: 'Management reports on it',
    body: 'Approved hours roll into the teacher\u2019s history, the school\u2019s service record and the firm\u2019s reporting — and, when you are ready, into invoices and payroll.',
    detail: ['Daily, weekly, monthly and custom billing cycles', 'Only approved hours count as delivered service', 'Exceptions surface before anyone has to look for them']
  }
];

const FAQ = [
  {
    q: 'How does a school confirm a session?',
    a: 'The school signs in, opens its approval queue and sees each submitted session with the teacher, subject, class, date, times and topic. One action approves it. Rejecting or asking for a correction requires a reason, which goes back to the teacher.'
  },
  {
    q: 'Can one school see another school\u2019s records?',
    a: 'No. A school account is scoped to its own school — its teachers, its sessions, its reports. That boundary is enforced on the server, not just hidden in the interface.'
  },
  {
    q: 'What happens when a teacher makes a mistake?',
    a: 'The school asks for a correction and says what is wrong. The teacher edits and resubmits. The original version stays in the record, so the change is visible rather than silent. Approved sessions cannot be quietly edited at all.'
  },
  {
    q: 'Does it work on a basic phone?',
    a: 'Yes. The teacher flow is built phone-first and assumes a mid-range Android on mobile data. Logging a session is school, subject, class, time, submit — no more taps than that.'
  },
  {
    q: 'What does it cost to start?',
    a: 'Schools already working with Glampter are set up at no additional cost during the current rollout. Talk to us about contracted hours and rates and we will configure your account before your next term.'
  },
  {
    q: 'Who is Glampter Consults?',
    a: <>Glampter Consults is the consulting firm behind the platform, working across education and training, agribusiness, real estate and business consulting from Abeokuta, Ogun State. <BrandWord /> is its education-services platform.</>
  }
];

export default function Landing() {
  const [step, setStep] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [railFill, setRailFill] = useState(0);

  /* Hero rail animates in on load — the page's one orchestrated moment. */
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setRailFill(6); return; }
    let n = 0;
    const id = window.setInterval(() => {
      n += 1; setRailFill(n);
      if (n >= 6) window.clearInterval(id);
    }, 130);
    return () => window.clearInterval(id);
  }, []);

  /* Steps advance slowly on their own and stop the moment anyone interacts. */
  const [autoStep, setAutoStep] = useState(true);
  useEffect(() => {
    if (!autoStep) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % STEPS.length), 6000);
    return () => window.clearInterval(id);
  }, [autoStep]);

  const month = inMonth(sessions);
  const approvedH = Math.round(approvedMinutes(sessions) / 60);
  const rate = approvalRate(sessions);
  const week = dailySeries(inLastDays(sessions, 14), 14);
  const bySchool = groupMinutes(month, (s) => s.schoolName, true).slice(0, 5);
  const maxSchool = Math.max(1, ...bySchool.map((b) => b.minutes));

  return (
    <div>
      <LandingNav />

      {/* ---------- 1. Hero ---------- */}
      <section className="px-4 sm:px-6 pt-10 sm:pt-16 pb-14">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <span className="eyebrow eyebrow-dot">Teach · Verify · Clock · Report</span>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="mt-6 font-display font-extrabold tracking-tight
                           text-[40px] leading-[0.98] sm:text-[62px] lg:text-[76px] max-w-[19ch]">
              The <span style={{ color: 'var(--logo-orange)' }}>Smarter Way</span> to Clock
              Teaching Engagement.
            </h1>
          </Reveal>

          <Reveal delay={110}>
            <p className="mt-6 text-lg text-[var(--text-2)] max-w-[62ch]">
              <BrandWord /> connects the consulting firm, its teachers and the schools they serve.
              Teachers log what they taught. Schools verify it. Management sees every
              approved hour - and what it is worth.
            </p>
          </Reveal>

          <Reveal delay={160}>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/auth?tab=register" className="btn btn-primary">Get started</Link>
              <a href="#how" className="btn btn-ghost">See how it works</a>
            </div>
          </Reveal>

          {/* The thesis: the object the whole product is about */}
          <Reveal delay={220} className="mt-14">
            <Frame brackets className="p-6 sm:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-7">
                <span className="eyebrow">One teaching session, end to end</span>
                <span className="mono text-xs text-[var(--text-3)]">TS-000928 · Physics · SS2 · BMS Montessori</span>
              </div>
              <LifecycleRail upto={railFill} current={railFill} />
              <p className="mt-7 text-sm text-[var(--text-2)] max-w-[70ch]">
                Every hour <BrandWord /> reports has travelled this line. Hours that stop before
                <span className="font-semibold text-[var(--text)]"> Approved </span>
                are clocked, chased and never counted as delivered.
              </p>
            </Frame>
          </Reveal>

          <Reveal delay={280}>
            <p className="mt-6 text-sm text-[var(--text-2)]">
              <span className="mono font-medium text-[var(--text)] text-base">{approvedH.toLocaleString()}</span>
              {' '}approved teaching hours recorded across{' '}
              <span className="mono font-medium text-[var(--text)] text-base">{schools.length}</span>
              {' '}partner schools.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---------- 2. The problem ---------- */}
      <section className="band-tint px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-[1240px] grid lg:grid-cols-12 gap-8 items-start">
          <Reveal className="lg:col-span-4">
            <span className="eyebrow">The problem</span>
          </Reveal>
          <Reveal delay={60} className="lg:col-span-8">
            <p className="font-display text-2xl sm:text-3xl font-bold leading-snug max-w-[26ch]">
              Nobody can prove what was taught.
            </p>
            <p className="mt-5 text-[var(--text-2)] max-w-[68ch]">
              Sessions get reported over WhatsApp, written into a paper register, then
              reconciled against a spreadsheet at the end of the month — by which time
              nobody remembers whether the Tuesday double period actually ran. Schools
              query invoices they cannot check. Teachers are paid on figures nobody
              verified. The firm argues from memory.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---------- 3. Three roles ---------- */}
      <section className="px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <span className="eyebrow">Three parties, one record</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold max-w-[20ch]">
              Everyone sees the same session, at their own level.
            </h2>
          </Reveal>

          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {[
              {
                icon: GraduationCap, name: 'Teachers', job: 'Log what you taught, in under a minute.',
                cap: '', tint: 'frame-tint-gold', ink: 'var(--accent-ink)',
                points: ['Submit from your phone straight after class', 'See what is approved and what is stuck', 'Correct a rejected session and resubmit']
              },
              {
                icon: Building2, name: 'Schools', job: 'Confirm what was actually delivered.',
                cap: 'cap-info', tint: 'frame-tint-info', ink: 'var(--info)',
                points: ['Approve, reject or ask for a correction', 'See only your school, never another', 'Check hours before you are ever invoiced']
              },
              {
                icon: Users, name: 'The firm', job: 'See everything, act on exceptions.',
                cap: 'cap-ok', tint: 'frame-tint-ok', ink: 'var(--ok)',
                points: ['Approved hours by school, teacher and subject', 'Pending, disputed and flagged sessions first', 'Reports that turn into invoices and payroll']
              }
            ].map((r, i) => (
              <Reveal key={r.name} delay={i * 70}>
                <Frame brackets className={`h-full p-6 flex flex-col gap-4 cap ${r.cap} ${r.tint}`}>
                  <r.icon size={26} strokeWidth={1.7} style={{ color: r.ink }} aria-hidden="true" />
                  <div>
                    <h3 className="text-xl font-extrabold">{r.name}</h3>
                    <p className="mt-1.5 text-sm text-[var(--text-2)]">{r.job}</p>
                  </div>
                  <ul className="mt-1 flex flex-col gap-2.5 text-sm">
                    {r.points.map((p) => (
                      <li key={p} className="flex gap-2.5">
                        <span className="mt-[7px] w-[6px] h-[6px] flex-none rotate-45"
                          style={{ background: r.ink }} aria-hidden="true" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </Frame>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 4. How it works ---------- */}
      <section id="how" className="band-warm px-4 sm:px-6 py-16 scroll-mt-24">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <span className="eyebrow">How it works</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold max-w-[22ch]">
              Five steps, in the order they actually happen.
            </h2>
          </Reveal>

          <div className="mt-10 grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 flex flex-col" role="tablist" aria-label="How Teach Clock works">
              {STEPS.map((s, i) => (
                <button
                  key={s.title} role="tab" id={`step-tab-${i}`} aria-selected={step === i}
                  aria-controls={`step-panel-${i}`} tabIndex={step === i ? 0 : -1}
                  onClick={() => { setStep(i); setAutoStep(false); }}
                  className="text-left flex gap-4 py-4 px-4 border-l-2 transition-colors"
                  style={{
                    borderColor: step === i ? 'var(--accent)' : 'var(--border)',
                    background: step === i ? 'var(--surface)' : 'transparent'
                  }}
                >
                  <span className="mono text-sm pt-[3px]"
                    style={{ color: step === i ? 'var(--accent)' : 'var(--text-3)' }}>
                    0{i + 1}
                  </span>
                  <span>
                    <span className="block font-display font-bold text-[17px]"
                      style={{ color: step === i ? 'var(--text)' : 'var(--text-2)' }}>
                      {s.title}
                    </span>
                    {step === i ? (
                      <span className="block mt-2 text-sm text-[var(--text-2)]">{s.body}</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>

            <div className="lg:col-span-7">
              {STEPS.map((s, i) => (
                <div
                  key={s.title} role="tabpanel" id={`step-panel-${i}`} aria-labelledby={`step-tab-${i}`}
                  hidden={step !== i}
                >
                  <Frame tone="flat" brackets className="p-7 sm:p-9">
                    <span className="eyebrow">Step 0{i + 1}</span>
                    <h3 className="mt-4 text-2xl font-extrabold max-w-[20ch]">{s.title}</h3>
                    <p className="mt-3 text-[var(--text-2)] max-w-[54ch]">{s.body}</p>
                    <div className="mt-7 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
                      <LifecycleRail upto={Math.min(8, (i + 1) * 1.6)} />
                    </div>
                    <ul className="mt-7 flex flex-col gap-2.5 text-sm">
                      {s.detail.map((d) => (
                        <li key={d} className="flex gap-2.5">
                          <span className="mt-[7px] w-[6px] h-[6px] flex-none rotate-45"
                            style={{ background: 'var(--accent)' }} aria-hidden="true" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </Frame>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 5. Verification, on ink ---------- */}
      <section id="verification" className="ink-band diagonal-top px-4 sm:px-6 pt-24 pb-20 mt-10 scroll-mt-16">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <span className="eyebrow eyebrow-dot">Why the record holds up</span>
            <h2 className="mt-5 text-3xl sm:text-[44px] font-extrabold max-w-[18ch] leading-[1.02]">
              A confirmation you can put in front of a client.
            </h2>
            <p className="mt-5 max-w-[62ch]" style={{ color: '#B7AC97' }}>
              Anyone can keep a log. What makes an hour billable is that the school
              agreed to it, on the record, and that the record cannot quietly change
              afterwards.
            </p>
          </Reveal>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: MessageSquareWarning, t: 'Rejections carry reasons', d: 'A school cannot reject a session without saying why. The teacher sees the reason and can answer it.' },
              { icon: Lock, t: 'Approved records lock', d: 'Once approved, a session is closed to ordinary editing. Changing it takes an authorised correction that is logged.' },
              { icon: Repeat2, t: 'Corrections keep the original', d: 'The prior version stays in the history, so an adjustment is visible rather than silent.' },
              { icon: ScanSearch, t: 'Duplicates get flagged', d: 'Overlapping times, repeat entries and unusually long days surface for review instead of quietly inflating a total.' }
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 60}>
                <div className="h-full p-5 border" style={{ borderColor: 'var(--rule-dark)' }}>
                  <c.icon size={20} strokeWidth={1.8} style={{ color: 'var(--gold)' }} aria-hidden="true" />
                  <h3 className="mt-4 font-display font-bold text-[17px]">{c.t}</h3>
                  <p className="mt-2 text-sm" style={{ color: '#B7AC97' }}>{c.d}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={140} className="mt-12">
            <div className="p-6 sm:p-8 border" style={{ borderColor: 'var(--rule-dark)' }}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-7">
                <span className="eyebrow">Where a rejected session goes</span>
                <span className="mono text-xs" style={{ color: '#8B8272' }}>Correction requested → resubmitted → approved</span>
              </div>
              <LifecycleRail upto={4} current={4} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- 6. What management sees ---------- */}
      <section id="management" className="px-4 sm:px-6 py-20 scroll-mt-24">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <span className="eyebrow">For management</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold max-w-[22ch]">
              The three numbers the firm runs on.
            </h2>
            <p className="mt-4 text-[var(--text-2)] max-w-[62ch]">
              Built from the same components as the live dashboard, so what you see
              here is what your administrators will actually use.
            </p>
          </Reveal>

          <Reveal delay={80} className="mt-10">
            <KpiGrid cols={3}>
              <Kpi label="Approved this month" value={hours(approvedMinutes(month))} sub="validated service delivery" tone="ok" />
              <Kpi label="Awaiting school approval" value={String(month.filter((s) => s.status === 'pending').length)} sub="sessions in a queue right now" tone="warn" />
              <Kpi label="Approval rate" value={pct(rate)} sub="of reviewed sessions, all schools" tone="info" />
            </KpiGrid>
          </Reveal>

          <div className="mt-6 grid lg:grid-cols-2 gap-5">
            <Reveal delay={120}>
              <Frame className="h-full">
                <div className="flex items-baseline justify-between mb-5">
                  <span className="eyebrow">Teaching hours, last 14 days</span>
                  <span className="mono text-xs text-[var(--text-3)]">{hoursLabel(week.reduce((a, d) => a + d.minutes, 0))}</span>
                </div>
                <div className="bars" style={{ height: 132 }}>
                  {week.map((d) => {
                    const max = Math.max(1, ...week.map((x) => x.minutes));
                    return (
                      <div className="bar-col" key={d.date} title={`${d.date}: ${hoursLabel(d.minutes)}`}>
                        <div className="bar-fill" style={{ height: `${(d.minutes / max) * 100}%` }} />
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-[var(--text-3)]">Weekends sit empty — schools do not run them.</p>
              </Frame>
            </Reveal>

            <Reveal delay={170}>
              <Frame className="h-full">
                <div className="flex items-baseline justify-between mb-5">
                  <span className="eyebrow">Approved hours by school, this month</span>
                </div>
                <div className="flex flex-col gap-4">
                  {bySchool.map((b) => (
                    <div key={b.key}>
                      <div className="flex items-baseline justify-between text-sm mb-1.5">
                        <span className="truncate pr-3">{b.key}</span>
                        <span className="mono text-xs text-[var(--text-2)]">{hoursLabel(b.minutes)}</span>
                      </div>
                      <div className="hbar">
                        <div className="hbar-fill" style={{ width: `${(b.minutes / maxSchool) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Frame>
            </Reveal>
          </div>

          <Reveal delay={200} className="mt-6">
            <Frame tone="flat" className="flex flex-wrap items-center gap-4 justify-between">
              <div className="flex items-center gap-3">
                <Badge tone="ok">Approved</Badge>
                <span className="text-sm text-[var(--text-2)]">counts as delivered service and can be billed.</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone="warn">Pending approval</Badge>
                <span className="text-sm text-[var(--text-2)]">is clocked and chased, but never billed.</span>
              </div>
            </Frame>
          </Reveal>
        </div>
      </section>

      {/* ---------- 7. FAQ ---------- */}
      <section id="faq" className="band-tint px-4 sm:px-6 py-16 scroll-mt-24">
        <div className="mx-auto max-w-[1240px] grid lg:grid-cols-12 gap-8 items-start">
          <Reveal className="lg:col-span-4">
            <span className="eyebrow">Questions</span>
            <h2 className="mt-4 text-3xl font-extrabold max-w-[14ch]">Before you ask.</h2>
          </Reveal>

          <div className="lg:col-span-8 border-t" style={{ borderColor: 'var(--border)' }}>
            {FAQ.map((f, i) => (
              <div key={f.q} className="border-b" style={{ borderColor: 'var(--border)' }}>
                <h3>
                  <button
                    className="w-full text-left flex items-start justify-between gap-5 py-5"
                    aria-expanded={openFaq === i} aria-controls={`faq-${i}`}
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    <span className="font-display font-bold text-[17px]">{f.q}</span>
                    <ChevronDown
                      size={18} aria-hidden="true"
                      className="mt-1 flex-none transition-transform duration-200"
                      style={{ transform: openFaq === i ? 'rotate(180deg)' : 'none', color: 'var(--text-3)' }}
                    />
                  </button>
                </h3>
                <div id={`faq-${i}`} hidden={openFaq !== i} className="pb-5 -mt-1">
                  <p className="text-[var(--text-2)] max-w-[68ch]">{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 8. Close + footer ---------- */}
      <section className="px-4 sm:px-6 pb-4">
        <Reveal>
          <div className="mx-auto max-w-[1240px] ink-band p-8 sm:p-14 text-center flex flex-col items-center">
            <Mark size={58} ground="dark" />
            <h2 className="mt-6 text-3xl sm:text-[44px] font-extrabold max-w-[18ch] leading-[1.03]">
              Start with one school and one term.
            </h2>
            <p className="mt-4 max-w-[54ch]" style={{ color: '#B7AC97' }}>
              Set up takes an afternoon. Your teachers log their next session from their
              phones, and your first verified report lands at the end of the month.
            </p>
            {/* Three ways in, in the order they are usually wanted: commit,
                return, or look first without an account. */}
            <div className="mt-8 flex flex-wrap gap-3 justify-center">
              <Link href="/auth?tab=register" className="btn btn-gold">Get started</Link>
              <Link href="/auth" className="btn btn-ghost">Sign in</Link>
              {/* The only entry point that unlocks the preview — see AppShell. */}
              <Link href="/dashboard?preview=1" className="btn btn-ghost">Preview Dashboard</Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="px-4 sm:px-6 pt-16 pb-10">
        <div className="mx-auto max-w-[1240px]">
          <div className="grid gap-10 md:grid-cols-12 pb-10 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="md:col-span-5">
              <Lockup size={72} />
              <p className="mt-5 text-sm text-[var(--text-2)] max-w-[40ch]">
                <BrandWord /> is the education-services platform of Glampter Consults —
                teaching delivery, verified by the school and reported to the firm.
              </p>
              <div className="mt-6"><GlampterLine /></div>
            </div>

            <div className="md:col-span-3">
              <h3 className="eyebrow">Glampter Consults</h3>
              <address className="mt-4 not-italic text-sm text-[var(--text-2)] leading-relaxed">
                Glampter Office, Apena Bankole Plaza<br />
                Iporo-Ake, Abeokuta<br />
                Ogun State, Nigeria<br />
                <span className="mono text-xs">RC 8625889</span>
              </address>
            </div>

            <div className="md:col-span-2">
              <h3 className="eyebrow">Contact</h3>
              <ul className="mt-4 text-sm text-[var(--text-2)] flex flex-col gap-2">
                <li><a href="mailto:glampterconsults@gmail.com" className="hover:text-[var(--text)]">glampterconsults@gmail.com</a></li>
                <li><a href="tel:+2349030462106" className="hover:text-[var(--text)] mono text-xs">0903 046 2106</a></li>
                <li><a href="tel:+2348108189581" className="hover:text-[var(--text)] mono text-xs">0810 818 9581</a></li>
              </ul>
            </div>

            <div className="md:col-span-2">
              <h3 className="eyebrow">Product</h3>
              <ul className="mt-4 text-sm text-[var(--text-2)] flex flex-col gap-2">
                <li><a href="#how" className="hover:text-[var(--text)]">How it works</a></li>
                <li><a href="#verification" className="hover:text-[var(--text)]">Verification</a></li>
                <li><Link href="/dashboard" className="hover:text-[var(--text)]">Dashboard</Link></li>
                <li><Link href="/financials" className="hover:text-[var(--text)]">Reports</Link></li>
                <li><Link href="/auth" className="hover:text-[var(--text)]">Sign in</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-6 flex flex-wrap gap-3 justify-between text-xs text-[var(--text-3)]">
            <p>© {new Date().getFullYear()} Glampter Consults. All rights reserved.</p>
            <p className="flex items-center gap-2">
              <ShieldCheck size={13} aria-hidden="true" />
              Built on verified teaching records.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
