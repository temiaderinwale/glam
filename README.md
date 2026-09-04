# Teach Clock

Teaching accountability and educational-consulting management, for **Glampter Consults**
— *Bringing Answers To You*.

The product's atomic object is the **verified teaching session**: a teacher records what
they taught, the school confirms it happened, and only then does the hour count as
delivered service. Everything else in the platform hangs off that record.

```
ASSIGNED → SCHEDULED → TAUGHT → SUBMITTED → VERIFIED → APPROVED → REPORTED → (BILLED / PAID)
```

**This build is the complete platform**, not a prototype: 19 routes, the full teaching
accountability workflow, role-based access, notifications, an audit trail, exports and
configurable operating rules. Next.js 14 App Router · TypeScript strict · Tailwind ·
Firebase Auth + Firestore.

---

## Run it

Node 20 LTS.

```bash
npm install
cp .env.example .env.local     # then fill in the Firebase keys
npm run dev                    # http://localhost:3000
npm run build && npm start     # production
npm run typecheck              # tsc --noEmit
```

The first `npm run dev` fetches Archivo, Inter and JetBrains Mono from Google Fonts,
so the machine needs network access on that first build. After that they are cached
and self-hosted by `next/font`.

## Routes

| Route | Who | What it does |
|---|---|---|
| `/` | public | Landing page |
| `/auth` | public | Sign in · register · verify · reset · complete profile · pending review |
| `/dashboard` | all | Role-aware: teacher, school and administrator compositions |
| `/sessions/new` | teacher | Log a session — validated, duration derived, flags raised |
| `/sessions` | all | Teaching history, correction and resubmission, cancel with reason |
| `/approvals` | school · admin | Approval queue: approve, reject, request correction, bulk approve |
| `/my-schools` | teacher | Active assignments and requests for new schools |
| `/schedule` | all | Month calendar of recorded teaching |
| `/schools` | admin | School database, profiles, approval and suspension |
| `/teachers` | school · admin | Teacher database and the registration queue |
| `/assignments` | admin | Teacher ↔ school links, requests, ending placements |
| `/financials` | school · admin | Service & financial report — revenue, cost, margin, utilisation |
| `/reports` | all | Grouped reports by school, teacher, subject, class or day |
| `/analytics` | admin | Approval speed, teacher capacity, dispute patterns |
| `/subjects` | admin | Subjects, classes and academic periods |
| `/documents` | all | Certificates, ID, contracts — validated uploads, scoped access |
| `/audit` | admin | The audit trail, read-only |
| `/settings` | admin | Organisation details and the operating rules the engine enforces |

`NAV` in `components/AppShell.tsx` is the single source of truth for the sidebar, the
mobile bar and the role gate.

## How the workflow holds together

```
lib/rules.ts    pure business rules — BR-001…BR-015, no I/O
lib/repo.ts     one interface, two implementations (Firestore | in-memory)
lib/data.tsx    the verbs: submit, approve, reject, correct, assign, configure
```

Every mutation does three things in order, and none is optional: check the rule, write
the record, then append an audit entry and notify whoever needs to know. That lives in
the data layer rather than in the pages, so a correction made from the approval queue and
the same correction made from a session detail produce identical history.

Run `npm test` to verify the rules — 20 assertions covering duration derivation, BR-002
assignment gating, BR-010 (a teacher can never approve their own session), BR-011 school
isolation, BR-005 approved-record locking, duplicate and overlap detection, and the legal
status transitions.

## Preview mode

Signed out, the app runs on an in-memory repository seeded from `lib/demo.ts`, with a role
switcher in the top bar. This is **not a mock**: submitting, approving, rejecting,
correcting, assigning and configuring all work, each write runs the same rule checks and
produces the same audit entries, and changes persist for the browser session. It is how
the whole product can be reviewed before Firebase is configured or an account approved.

Sign in with an approved account and the same code talks to Firestore instead —
`makeRepo(stage === 'ready')` in `lib/data.tsx` is the only line that decides.

**To make the app private:** delete `RoleSwitch` in `AppShell.tsx` and redirect to `/auth`
when `stage === 'signedOut'` in `lib/store.tsx`.

## Architecture

```
app/
  layout.tsx              next/font (Archivo + Inter + JetBrains Mono), theme script, GlamProvider
  globals.css             design tokens → component layer → responsive → print → reduced motion
  page.tsx                public landing page
  auth/page.tsx           the six-panel auth state machine
  (app)/layout.tsx        three lines: wraps every authenticated route in AppShell
  (app)/dashboard/        role-aware dashboard
  (app)/financials/       service & financial report
  (app)/<module>/         one thin file per stubbed module
lib/
  firebase.ts             init with env guard, auth actions, users/{uid} read/write
  types.ts                domain model — the contract between demo data and Firestore
  store.tsx               one context, one auth stage machine, preview role, toasts
  compute.ts              every derived figure in the product
  demo.ts                 deterministic seed dataset
  format.ts               naira, dates, durations, password strength, Firebase error copy
components/
  Brand.tsx               Mark · BrandWord · Lockup — imported by every surface
  Preloader.tsx           the brand curtain
  AppShell.tsx            sidebar, topbar, mobile nav, NAV, role gate
  ui.tsx                  Frame, Kpi, Badge, TableWrap, LifecycleRail, charts, states
  ComingSoon.tsx          the stubbed-module state
  landing/                LandingNav, Landing, Reveal
```

### The auth stage machine

One value replaces the usual scatter of booleans, and the preloader is simply
`stage === 'loading'`:

```
loading → signedOut | verify | completeProfile | pending | ready
```

New teacher and school accounts land in `pending` — Glampter reviews them before they can
submit or approve anything, per the SRS.

## Firebase

Project **glam-dev-prod**. Console setup, once:

1. **Authentication → Sign-in method** — enable *Email/Password* and *Google*.
2. **Authentication → Settings → Authorized domains** — add `localhost` and your deploy domain.
3. **Firestore** — create the database, then deploy `firestore.rules`.

A Firebase web API key is a public project identifier, not a secret — it identifies the
project in browser requests. What actually protects the data is the authorised-domain list
and the rules file, so deploy those before any real data goes in.

### Data model

```
users/{uid}                      role · status · orgId · teacherId? · schoolId? · profile
orgs/{orgId}                     Glampter Consults
  teachers/{teacherId}           TCH-000123
  schools/{schoolId}             SCH-000054
  assignments/{assignmentId}     ASN-000411
  sessions/{sessionId}           TS-000928  ← the core record
  subjects · classes · academicSessions · auditLogs · settings
```

Sessions carry `teacherId` and `schoolId` as top-level indexed fields so rules and queries
filter on them directly. This is organisation-scoped rather than one-document-per-uid
because a session must be readable by the teacher, the school and the firm at once, while
a school must never reach another school's records.

Deploy both rules files:

```bash
firebase deploy --only firestore:rules,storage:rules
```

`firestore.rules` enforces the same business rules the client does — a school may only
change the review fields on its own sessions and must supply a reason to reject; a teacher
may only create sessions for themselves and cannot edit an approved one; audit entries are
append-only and never editable. The client checks are for usability; this file is the one
that counts, because it is the only one an attacker cannot skip.

First run against an empty project: sign in as an administrator and the repository seeds
the organisation from `lib/demo.ts` on demand (`seedIfEmpty`).

## Demo data

`lib/demo.ts` — 8 active teachers plus 3 awaiting registration approval, 5 active schools
plus 2 pending, ~120 sessions across 60 weekdays with a realistic status mix, assignments
including one teacher request awaiting a decision, documents, notifications and an opening
audit trail. Deterministic (one seeded PRNG, anchor date 2026-08-25), so every reviewer
sees the same numbers and the dashboard reconciles with the report.

## Accessibility

WCAG 2.2 AA is the target. Semantic landmarks, one `h1` per page, labelled controls with
`aria-describedby` on errors, visible focus rings, correct tab and accordion ARIA,
`prefers-reduced-motion` honoured throughout, and status carried by text as well as colour
— which matters here, because the brand's gold cannot legally be a text colour on cream
(see `DESIGN.md`).
