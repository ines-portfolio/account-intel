---
name: intent-signals
description: Hunt for evidence that a target account could use Corgi TODAY — company-level and person-level intent signals, each backed by a source a rep can cite. Use when the user asks for intent signals, buying triggers, or "why now" for an account, or as stage 3 of the account-intel loop.
---

# Intent Signals

**Input:** domain (stages 1-2 should exist).
**Output:** `runs/{slug}/signals.md`.

The contract: a rep reading this file can say to the prospect, truthfully and specifically, "here's how we know this is relevant to you right now." Signals are claims **about the account**, backed by evidence **the rep can cite out loud**.

## Process

1. Read `context/{client}/positioning.md`. Pick the segment (startups or trucking); its signals table is the scoring rubric. Read stage-1 `research.md` for facts already in hand (don't re-search what's cached).
2. Hunt tier by tier. For each Tier 1 and Tier 2 trigger, run targeted searches for THIS account: recent funding (press + SEC Form D), enterprise-logo additions, new office/lease news, careers page (volume, locations, seniority, compliance/security roles), product launches (especially AI), trust/security page changes, exec arrivals, incidents in their category.
   **Trucking accounts:** run `node src/tools/fmcsa.mjs "{legal name or USDOT}" --save runs/{slug}` first. Its result is the lead signal candidate. Then confirm ownership (subsidiaries are disqualified) before shipping it, and never state why a policy is ending.
3. **Person-level signals** for the stage-2 contacts: new in seat, public posts about growth/compliance/risk/ops pain, conference talks, podcast appearances. A CFO who posted about closing their Series B is both a signal and an opener.
4. Score each candidate signal:
   - **Strong** — Tier 1 trigger, < 6 months old, unambiguous evidence.
   - **Moderate** — Tier 2, or Tier 1 that's older / partially evidenced.
   - **Weak** — Tier 3 / inference. Weak signals support a message; they never lead one.
5. **The gate (hard rule):** each shipped signal must include (a) the specific evidence, quoted or described precisely, (b) source URL + date, (c) one sentence mapping it to a trigger and a Corgi coverage line. Anything that fails the gate goes to a "Considered and rejected" footnote with the reason — that log is what proves the agent doesn't force signals.

## Output format (`signals.md`)

For each signal: **Headline** (one line) · Strength · Trigger it maps to · Coverage line(s) · Evidence (quote/description) · Source + date · **How a rep uses it** (one sentence of suggested framing).

Order strongest first. End with **Considered and rejected** (bulleted, with reasons) and an honest **Bottom line**: "strong why-now", "moderate, lead with X", or "no real intent evidence right now — recommend nurture, revisit at {next likely trigger}".

## Quality bar

- Zero strong signals is a valid output. Say it plainly. Forced signals waste rep energy and torch trust in the tool.
- Never present company context (e.g., "they're a fintech") alone as a signal; context + a dated event is a signal.
- Freshness rule: > 12 months old = context, not intent.
