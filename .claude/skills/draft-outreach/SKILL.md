---
name: draft-outreach
description: Draft cold outbound messaging (email + LinkedIn) to the contacts found at a target account, grounded in the account research, intent signals, and Corgi's positioning. Use when the user asks to draft outreach, write cold emails, or as stage 4 of the account-intel loop.
---

# Draft Outreach

**Input:** domain. Requires `research.md`, `buying-centers.md`, `signals.md` for the account. If missing, run the earlier stages first.
**Output:** `runs/{slug}/outreach/{contact-slug}.md`, one file per contact; drafts also summarized in `SUMMARY.md`.

## Before writing — load, in order

1. `context/{client}/positioning.md` — what Corgi is, the segment's message rules, and section 6, the ONLY claims allowed in copy.
2. `context/{client}/voice.md` — structure, length limits, banned phrases. Follow it exactly.
3. `context/{client}/feedback.md` — apply every standing lesson.
4. The account's `signals.md` — pick the lead signal per contact.

## Process

1. For each recommended contact (top 2-3 from `buying-centers.md`): choose the ONE signal most relevant to **their role** (D&O signal → CFO/founder; COI-blocked enterprise motion → sales/finance; EPL/workers' comp → People lead). Signal-role fit beats signal strength.
2. Draft per contact:
   - **Email v1** (cold, < 90 words, voice.md structure)
   - **Email follow-up** (3-4 days later, new angle or second signal, < 60 words)
   - **LinkedIn connection note** (< 280 chars) and **LinkedIn DM** (< 60 words)
   - **Call opener** (20 seconds spoken, ends in one question). For trucking accounts this comes first; use the message options table in the trucking segment.
3. Annotate each draft with a **Why this works** block: signal used (with source), proof point used, trigger→coverage logic. This is for the rep (and the interview reviewer) — it shows the message is research-grounded, not template spray.
4. If `signals.md` bottom line was "no real intent evidence": do NOT fake a why-now. Produce a lighter "relevance-based" draft clearly labeled as such, and recommend nurture instead of sequence.

## Hard rules

- Every factual claim about the prospect traces to `signals.md`/`research.md`; every claim about Corgi traces to `positioning.md`. No exceptions, no invented numbers.
- One CTA per message. No meeting-link bombing in a first touch.
- Subject lines: 2-5 words, signal-referencing.
- Output includes a plain-text, copy-paste-ready version of each message (no markdown inside the message body).

## After feedback

When the user edits a draft or reports results, append the lesson to `context/{client}/feedback.md` (dated: what changed, why, how to apply). Recurring lessons graduate into `voice.md` rules.
