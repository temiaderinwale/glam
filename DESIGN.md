# Teach Clock — design system

Written so Phase 2 extends this rather than reinventing it.

---

## The direction

The Glampter Consults flier already has a visual language: corner brackets around the
diamond, hairline rules with terminal dots, letterspaced small caps, and a hard diagonal
where black meets gold. That is **institutional document** language — registry,
certificate, ledger — and it happens to suit a product whose entire job is producing
records that hold up in front of a client. Teach Clock leans into it rather than softening it
into another rounded SaaS dashboard.

Three rules follow from that, and they are what keep the interface from drifting:

1. **Elevation is a change of ground, not a shadow.** Surfaces are drawn with 1px keylines
   and bracketed corners (`.frame`). There is no `box-shadow` anywhere in the system.
2. **Radii are 4–8px.** No pills except where a control is genuinely a toggle. The diamond
   is the only rotated form.
3. **Sections alternate cream and ink,** and the diagonal cut between them is the flier's
   own device (`.diagonal-top` / `.diagonal-bottom`).

**What was deliberately avoided.** Machine-generated design currently clusters around a
cream ground with a high-contrast serif display and a terracotta accent near `#D97757`.
Teach Clock's brand hands us the cream legitimately, so the rest of that cluster is refused on
purpose: the display face is a grotesque (Archivo) at heavy weights, there is no serif
anywhere, and the accent is the brand's own deep orange, never terracotta. What keeps
cream from reading as a default here is the gold-on-ink inversion — see below.

---

## Colour

Brand constants, from the kit. These do not change.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#17140F` | Text on light, and the authoritative ground |
| `--gold` | `#E9A62B` | Brand gold — the mark, and the accent on ink |
| `--cream` | `#F7F3EA` | Text and figures on ink |
| `--rule-dark` | `#6A5424` | Keylines on ink |

The **light theme runs on white**, not cream. Cream reads as a flat, dull field at
full-page scale; it now appears only inside the ink register, as the colour of type and
figures. The light ground is `#FFFFFF`, lifted by two warm tints — `--surface-2` `#FFF8EB`
and `--surface-3` `#FDF2DD` — which carry section bands, table headers and resting cards
so the page has depth without a single shadow.

### The contrast constraint, and what it bought us

Measured:

| Pair | Ratio | Verdict |
|---|---|---|
| Bright gold `#F0A81F` on white | ~2.2 : 1 | Fails all text |
| Deep orange `#C98403` on white | 3.1 : 1 | Large text only |
| **Accent text `#B35C00` on white** | **4.9 : 1** | Passes AA |
| Gold on ink | **8.8 : 1** | Passes AA and AAA |
| Ink on white | ~17 : 1 | Passes everything |

**The palette carries two accents, because one value cannot do both jobs.**

- `--accent` `#F0A81F` — the bright gold. Fills, bars, rails, rules, icon glyphs, the
  active nav item, the diamond. Never type on a light ground.
- `--accent-ink` `#B35C00` — the deep orange that clears AA on white. The *only* orange
  permitted to be **body** type: links, accent numerals, KPI values. The wordmark is the
  one deliberate exception — see below.
- `--logo-orange` `#C98304` — sampled straight from the lockup artwork, the orange of the
  diamond itself. 3.1:1 on white, so it is reserved for **large display type only** (the
  landing headline's "Smarter Way"), never body copy. On ink all three resolve to gold.

That split is what let the theme get brighter without a single text value failing. On ink
the two collapse: `--accent` and `--accent-ink` both resolve to gold, which is legal type
there at 8.8:1. The consequence is still that ink sections read as the authoritative
ones — which is where the verification argument belongs.

Beyond the accents, the interface now uses **colour to carry meaning**: `--ok` green for
approved and billable, `--warn` amber for pending, `--bad` red for rejected, `--info` blue
for rates and ratios. Each has a soft tint used as a card ground (`.kpi-ok`, `.frame-tint-info`),
so a grid of figures is legible at a glance. Colour is never the only carrier — every
tinted card still states its meaning in the label.

Functional colours are derived to be text-safe on their own ground, not imported from a
generic status palette: `--ok` `#1F5D3C` (6.9:1 on cream), `--warn` `#7A5202` (6.2:1),
`--bad` `#8C2F1F`, `--info` `#2A4A6B`. Status is always carried by **text plus colour** —
`.badge` renders a label and a shape, never a bare dot.

---

## Type

| Face | Weights | Role |
|---|---|---|
| **Archivo** | 400–900 | Display, headings, KPI figures, eyebrows, buttons, table headers |
| **Inter** | 400–700 | Body, forms, table cells |
| **JetBrains Mono** | 400–500 | Session IDs, times, money, anything scanned vertically |

Archivo **900 is mandatory** for the wordmark — the diagonal accent is cut to Archivo's
`K` and will not land in a fallback face.

The wordmark sets TEACH in the inherited text colour and CLOCK in orange, with the accent
cut on the K's lower-right leg rendered as a clipped duplicate that inherits the text
colour. Which orange depends on size, not taste: the lockup and the preloader are display
type and the name set inline in running copy both take `--logo-orange`, the artwork's own
value, so the name reads identically wherever it appears. This is a deliberate exception
to the rule above: at ~16px the inline wordmark is normal text by WCAG (bold only counts
as large from 18.66px) and `--logo-orange` is 3.1:1 on white rather than 4.5:1. Brand
consistency was chosen over the threshold. On ink it resolves to gold at 8.9:1, so the
dark theme meets AA either way.

The lockup is composed in `Brand.tsx` from the mark PNG, a hairline rule and live type —
not shipped as one flat image — so it recolours with the theme and stays selectable. Its
proportions come from the supplied artwork: the rule sits 0.085 of the mark's height away
on each side and stands 0.7 of it tall, and the wordmark is sized so the type block is
about 1.7x the mark's width. Below the lockup minimum — the phone header — the mark
stands alone.

Headings run tight and heavy (`letter-spacing: -0.02em`); body runs calm. The `.eyebrow`
class — 11px Archivo 700, `letter-spacing: .22em`, uppercase — is the flier's small-caps
line, and it is used as a *structural label* on every section rather than as decoration.
Every figure in a column uses tabular numerals.

Scale: 76 / 62 / 44 / 34 / 30 / 26 / 20 / 17 / 15 / 13 / 11.

---

## The signature element

**The session lifecycle rail** (`LifecycleRail` in `components/ui.tsx`). Eight typed
states as bracketed diamond nodes on a hairline; the completed portion fills in the
ground-legal accent, the remainder stays a rule.

One idea at three scales:

- **Full width** on the landing hero, animating its fill on load — the page's thesis, and
  the reason the hero is not a stat block.
- **`mini`** inside every session card on the dashboard, labels dropped, as a status glyph
  that tells you at a glance how far a record has travelled.
- **As the spine** of the financial report, closing the page by showing where the money
  figures came from.

This is where the design spends its boldness. Everything around it is deliberately quiet.

---

## Motion

One orchestrated moment (the preloader), short directional reveals, instant hover states.
Nothing ambient, nothing floating, nothing looping.

- **Easing:** `cubic-bezier(.22,1,.36,1)` throughout. One curve, no exceptions.
- **Preloader — the split-gate.** The composition is the official lockup stood upright:
  the mark, the gold divider, the wordmark. The mark scales in, the divider grows out from
  the centre, a gold sweep wipes the wordmark in from the left. Then the panel **parts
  along that divider** — mark withdraws up, wordmark down — and the page is revealed
  between the two halves of the logo. A single `--pl-gap` sets the space above and below
  the divider, so the two elements cannot drift out of balance. ~1.05s, never blocking,
  never on client navigation.
- **Reveals:** 14px rise, 400ms, staggered 60–80ms, fired by `IntersectionObserver` once.
- **Reduced motion:** the preloader is removed outright, reveals resolve immediately, all
  durations drop to 1ms. This is a `@media` block at the end of `globals.css`, not a
  per-component concern.

---

## Voice

Plain, active, specific. Buttons name what happens — "Log teaching session", not "Submit"
— and the verb survives into the confirmation. Empty states say what to do next. Errors
say what happened and how to fix it, in the product's voice, never an apology and never a
raw code: `lib/format.ts → authError()` maps every Firebase code to a sentence a school
administrator can act on.

---

## Extending it

- **Colour belongs in `globals.css`.** Components reference tokens; there is not a single
  hex value in `app/**` or `components/**`. Retuning the identity is one block.
- **New surfaces use `.frame`.** If something needs to sit above the page, it changes
  ground colour — it does not gain a shadow.
- **New charts use flat rectangles.** No gradients, no rounded caps, no glow. The two bars
  in the logo are the seed of the whole data language.
- **New status values** need a `STATUS_LABEL` and a `STATUS_TONE` entry in `lib/compute.ts`,
  never an inline colour.
- **The stylesheet order is load-bearing:** tokens → base → brand → components →
  responsive → print → reduced motion. Adding a component rule after the responsive block
  will silently win at mobile widths.
