# Demo script — portal quote requests

Copy-paste messages for demonstrating the client portal's **"Request a
quote for this"** flow (`docs/ai-roadmap.md` Tier 3). All of them are
written for the **DemandBridge** demo org (Austin, USD, US sizes and
stock weights) and reference companies that exist in its seed data.

**How to run one:** open the portal as that company's contact, paste the
message into the chat, read the chatbot's reply, then press **Request a
quote for this**. A `QUOTE_REQUESTED` lead appears in the pipeline with
the extracted spec in `Lead.signal` and the customer's own wording in
`Lead.notes`.

**The point to make while demoing:** the chatbot never quotes, never
discounts and never promises a date. It reads. The customer raises their
hand; a human prices it. Every value the model inferred rather than read
is listed as an assumption, and genuine unknowns come back as questions
instead of plausible defaults.

---

## 1. The everyday request — Grand Hotel Lakeside

The baseline. Two line items, a stock described in plain words, and a
reference to previous work the model must flag rather than resolve.

```
Hi — we're refreshing the menus for the Lakeside location. Need about
250 dinner menus, tabloid size, printed both sides on a heavier uncoated
stock, and matte laminated so they survive being wiped down. Same look
as the last batch you did for us. Also 500 matching table tents if you
can do those on the same run.
```

**Watch for:** two lines extracted, not one. "Same look as the last
batch" becomes an assumption for the CSR to verify — the model has no
access to that job and does not pretend otherwise.

---

## 2. The vague one — Green Grocer Market

The most valuable demo, because it shows the system refusing to guess.

```
Need a few thousand flyers for the spring campaign, decent paper,
nothing fancy. Can you have them by the 14th?
```

**Watch for:** `dueDate` comes back **null**, with the clarification
_"Confirm the exact deadline date — the enquiry says 'the 14th'"_. This
is a deterministic guard, not model behaviour: a real test enquiry
produced exactly this phrasing and the model wrote the prose straight
into the date field, where it would have flowed into `Job.dueDate`.
Only the customer knows the month.

"A few thousand" and "decent paper" should surface as questions too.

---

## 3. The discount ask — BrightWave Tech Inc

Demonstrates the read-only boundary better than any explanation.

```
Those business cards on quote Q-1043 look right. Can we do the same
thing for the two new hires, and can you knock 10% off since it's a
small add-on?
```

**Watch for:** the chatbot quotes the existing price **as-is** and
declines to apply the discount. The quote request still files the lead,
with the discount ask preserved in the notes for a human to accept or
refuse. The pricing engine owns that number; the model never touches it.

---

## 4. The rush job — North Star Creative Agency

```
Emergency — our client moved their launch up. We need 1,000 8.5x11
one-sheets, full color one side, 100lb gloss text, delivered to the
Domain by Thursday morning. Whatever it takes. Can you confirm today?
```

**Watch for:** `rush: true`, set because the customer explicitly signals
urgency rather than because the deadline is close. "Thursday morning"
again yields no ISO date — a weekday without a week is not a date.
Nothing in the reply promises the Thursday; that promise is the shop's
to make.

---

## 5. The compliance-driven reprint — Hill Country Pharmacy Group

Pairs neatly with the compliance radar on `/insights`.

```
We're updating packaging inserts across the whole line after the new
labeling rule. Roughly 40 SKUs, 5,000 inserts each, folded to fit a
standard carton. Black only, thin stock. Need to know what this costs
before we commit to a date.
```

**Watch for:** a large quantity expressed per-SKU that the model must
not silently multiply out, `colorMode` correctly read as mono, and no
date at all — the customer said so outright, and the extraction respects
that instead of inventing one.

---

## 6. The bare minimum — Austin Community Food Bank

Shows the flow surviving an enquiry with almost nothing in it.

```
Can you price up banners for the fall drive? Not sure on sizes yet.
```

**Watch for:** the lead is still created. A customer asking for a quote
is never dropped for being imprecise — and if the extraction call itself
fails, the lead is created anyway with the raw text attached
([route.ts:50](../app/api/portal/request-quote/route.ts:50)). Most of
the output here should be clarifications, which is the honest answer.

---

## What to say if someone asks "why not just let the AI quote it?"

Because a price a customer is shown has to be defensible line by line,
and the pricing engine is pure, unit-tested and auditable. The model
does the one thing it is genuinely better at than code — turning
unstructured language into structure — and touches no money.
