# AI roadmap — proposal

**Status: proposal. Nothing here is built.** It exists so the schema
additions can be argued about before code depends on them.

Fluent AI already uses Claude in four places: outreach drafting, insight
explanations, prepress translation and the portal chatbot. All four obey
one rule, and everything proposed here obeys it too:

> **Deterministic-first — the machine decides with code, Claude explains
> in words.** Scores, verdicts and prices come from pure, unit-tested
> functions with an injected clock. Claude never invents a number, never
> negotiates, never sends. It converts structure into language, and
> language into structure.

Four `AiTaskKind` values were reserved in Phase 1 and are still unbuilt:
`BATCHING_SUGGESTION`, `TURNAROUND_ESTIMATE`, `WASTE_ESTIMATE`,
`DEMAND_FORECAST`. The reason they are unbuilt is not effort — it is that
**the data to compute them honestly does not exist yet.**

---

## 1. What the data can and cannot support today

Verified against the current schema and action code.

### Computable now, no migration

- Order cadence, reorder likelihood, churn risk, seasonality — already
  live in `lib/insights`.
- Proof turnaround (`Proof.sentAt` → `respondedAt`), approval and
  rejection rates, prepress pass/fail rates.
- Days-to-pay and overdue exposure (`Invoice.issuedAt`/`dueDate` versus
  `Payment.paidAt`).
- Material demand history and a waste-rate baseline from the
  `StockMovement` ledger (`WASTE` is already a reason code).
- Material cost and material margin per job, with a completeness flag
  when `InventoryItem.costPerUnit` is null (`lib/financials`).
- Press **booked** minutes per window, and gaps between `ScheduleBlock`s.
- Batching _candidate grouping_ by shared `stock` / `colorMode` /
  `finish` / `sizeName` / `dueDate`.
- Per-org AI spend (`AiTask.costCents`) and cron health (`SourceRun`).

### Blockers — these need schema, and pretending otherwise means guessing

| Gap                                                                                                                                                                          | Consequence                                                                                                                 | Proposed fix                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Press` has no capability fields at all** — no sheet size, run speed, makeready time or hourly rate                                                                        | Turnaround, batching and waste estimates are _not computable_. Any number would be invented.                                | Add `sheetWidthMm`, `sheetHeightMm`, `sheetsPerHour`, `makereadyMinutes`, `makereadySheets`, `hourlyRateCents` — all nullable, features degrade to "no estimate" when null |
| **No structured status history.** `moveJobStatus` writes an `ActivityLog` row with an English summary and `payload: null`; `updateJob` changes status with **no log at all** | Cycle time is only recoverable by string-parsing, and only for board drags. No bottleneck analysis, no on-time measurement. | Add `JobStatusEvent { jobId, from, to, at, actorId }` written by both paths. Cheap, and unlocks four features                                                              |
| **Material "actuals" equal plan by construction** (`delta = -quantityPlanned`)                                                                                               | Planned-vs-actual variance is structurally always zero, so waste can never be learned from history                          | Prompt for actual quantity and spoilage at completion, or accept estimated-only waste and label it as such                                                                 |
| **No `deliveredAt`**                                                                                                                                                         | On-time delivery performance cannot be measured at all                                                                      | Set it when a job reaches `DONE` (or derive from `JobStatusEvent`)                                                                                                         |
| **`LeadScore` keeps one row per company**                                                                                                                                    | No trend, no way to backtest whether a score predicted anything                                                             | A small `LeadScoreHistory`, or accept point-in-time only                                                                                                                   |

**Recommendation:** ship `JobStatusEvent` and the `Press` capability
fields first. They are small, additive, and between them unblock five of
the seven proposed features. Everything in Tier 1 below needs neither.

---

## 2. Tier 1 — build now, no schema changes

### 1.1 RFQ intake — "quote this email for me"

**The problem.** The single biggest time sink in a print shop is turning
"Hi, need ~2500 A5 flyers, decent paper, folded, by the 14th" into a
priced quote. It is typing, not judgement.

**Deterministic core.** None needed — the pricing engine
(`lib/pricing/engine.ts`) already exists and already produces an audited
breakdown.

**Claude's job.** Unstructured → structured, which is the one thing a
model is genuinely better at than code: extract `{quantity, sizeName,
widthMm, heightMm, stock, colorMode, finish, binding, dueDate, rush}`
via `zodOutputFormat`, flagging every field it inferred rather than read.

**Then:** `computeQuote()` prices it, the CSR sees a pre-filled quote
builder with the extracted spec beside the original text, and nothing is
saved until they confirm. Unparseable enquiries produce a partial draft
with gaps marked, never a guess.

- New `AiTaskKind`: `RFQ_EXTRACTION`
- Effort: medium. Risk: low — a wrong extraction is visible and editable
  before it becomes a quote.
- **Highest value-to-effort ratio in this document.**

### 1.2 Weekly owner briefing

A deterministic KPI pack — open pipeline by stage, jobs due this week,
overdue invoices and DSO, low stock, reorder-due and churn-risk
customers, prospect counts, AI spend — assembled by a pure function, then
narrated by Claude in six sentences and emailed via the existing
`lib/notifications` interface on a Monday cron.

- New `AiTaskKind`: `OWNER_BRIEFING`
- Effort: low. Everything it needs is already computable, the email
  provider and cron fan-out already exist.
- Caveat: `Organization` has no owner email; recipients need deciding
  (Clerk admin members, or an explicit setting).

### 1.3 Quote follow-up nudges

Deterministic staleness and win-likelihood from `Quote.status`,
`createdAt`, `validUntil`, the company's tier and their history →
Claude drafts the follow-up in the customer's own context. Drafted,
never sent, exactly like prospect outreach.

- Reuses `OUTREACH_DRAFT`. Effort: low.

### 1.4 AI spend panel

Not an AI feature — a Settings panel over `AiTask` (spend by kind, by
month, failure rate, average latency). The data is already recorded; it
is currently invisible. Effort: very low, and it makes the cost of
everything else legible.

---

## 3. Tier 2 — the print-native moat (needs the Tier-1 schema work)

These are the reserved kinds, and they are what a generic CRM cannot do.

### 2.1 Gang-run batching — `BATCHING_SUGGESTION`

Group open jobs sharing stock, colour mode and finish, with compatible
due dates, and compute sheet utilisation for candidate combinations
(rectangle packing against the press sheet size). Report sheets saved,
makereadies avoided, and money saved from `costPerUnit`.

Claude explains the trade-off in the shop's language: "combining #2104
and #2109 saves ~1,200 kr of stock and one makeready, but #2104 loses two
days of slack."

Needs: `Press.sheetWidthMm/sheetHeightMm`. Effort: high — packing is
fiddly and must be conservative (a suggestion that wastes stock destroys
trust immediately).

### 2.2 Turnaround promises — `TURNAROUND_ESTIMATE`

Earliest feasible completion date from press throughput, makeready time,
existing `ScheduleBlock` occupancy and working hours. Answers "can we
promise Tuesday?" _before_ the quote goes out.

Needs: press throughput fields **and** an org working-hours calendar;
calibration against real cycle times needs `JobStatusEvent`. Effort:
high. Value: high — this is the promise shops break most often.

### 2.3 Waste and spoilage estimates — `WASTE_ESTIMATE`

Makeready sheets plus a run-spoilage rate per press and stock, learned
from the `StockMovement` `WASTE` history, feeding both pricing and
material planning.

Needs: makeready fields, and honest actuals (see the blocker table).
Effort: medium. Until actuals exist, present it as an _estimate from
history_, never as measured fact.

### 2.4 Bottleneck and on-time analytics

Where jobs actually stall, per-stage dwell times, on-time percentage by
customer and by press. Claude names the constraint and what relieving it
would be worth.

Needs: `JobStatusEvent` + `deliveredAt`. Effort: medium once the events
exist. This is the feature most likely to change how the shop is run.

---

## 4. Tier 3 — later

- **Demand forecasting** (`DEMAND_FORECAST`) — seasonal per-category
  demand from job history, driving paper purchasing. Weak without
  supplier lead times (no vendor↔item relation exists today).
- **Portal chat → quote request** — the chatbot detects buying intent and
  drafts an RFQ for a CSR to confirm. Depends on 1.1.
- **Compliance radar** — Federal Register final rules on labelling
  matched against existing customers' categories, producing "these six
  food customers must reprint by <date>" upsell signals. Deliberately
  _not_ a prospecting source, because rules name industries, not
  companies (see TODO-FUTURE.md).

---

## 5. Explicitly rejected

Not "later" — rejected on principle, so they don't get proposed again:

- **AI setting prices.** The pricing engine is auditable and a customer
  can be shown why a number is what it is. A model cannot be.
- **AI sending anything unattended.** No consent model exists in the
  schema, and cold email is a legal surface. Drafts only, always.
- **AI writing to the database without human confirmation.** Every
  proposal above ends in a human clicking something. An agent that
  silently mutates a shop's production schedule is a liability, not a
  feature.
- **A "chat with your CRM" console for staff.** It sounds impressive and
  answers questions worse than the pages already do. The portal chatbot
  exists because customers have no UI; staff do.
- **Replacing the deterministic layers with a model.** The layers are
  the product; Claude is the interface to them.

---

## 6. Suggested order

1. `JobStatusEvent` + `Press` capability fields + `deliveredAt` (schema,
   one migration, no AI)
2. **RFQ intake** (1.1) — biggest daily time saving
3. **AI spend panel** (1.4) and **owner briefing** (1.2) — cheap, visible
4. **Turnaround promises** (2.2) — needs the schema from step 1
5. **Bottleneck analytics** (2.4) — needs the events from step 1
6. **Batching** (2.1) and **waste** (2.3) — highest effort, do last

Each step is independently shippable and independently useful, which is
the same sequencing rule the prospecting work followed.
