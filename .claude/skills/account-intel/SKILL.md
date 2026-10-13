---
name: account-intel
description: Run the full account-intelligence loop end to end for a target account — research, buying centers, intent signals, outreach drafts, and a rep-ready summary. Use when the user gives a company name/domain and wants the whole package, e.g. "run vanta.com" or "message key contacts at Acme".
---

# Account Intel — Full Loop

**Input:** company name or domain. **Output:** complete `runs/{slug}/` package topped by `SUMMARY.md`.

This is the stretch-goal one-shot: "message key contacts at {account}" → everything, in order, with stage gates.

## Sequence

1. **`/account-research`** → `research.md`. **Gate:** if the company is a clear non-fit for Corgi's ICP (see `context/{client}/positioning.md` — e.g., no US presence), STOP after stage 1, write `SUMMARY.md` explaining the disqualification, and report back. Don't burn effort researching contacts for an account the rep shouldn't work.
2. **`/buying-centers`** → `buying-centers.md`.
3. **`/intent-signals`** → `signals.md`.
4. **`/draft-outreach`** → `outreach/` for the top contacts. If signals came back empty, drafts are nurture-grade and labeled as such.
5. **`SUMMARY.md`** — the one-pager a rep reads in 2 minutes:
   - Account snapshot (3 bullets)
   - Why now (top signals, one line each, with sources)
   - Who to contact (ranked, one line each)
   - The recommended first touch (paste-ready)
   - Links to the full stage files
   - Confidence note: what's solid, what's inferred, what to verify manually

## Rules

- Reuse anything cached in `runs/{slug}/` that's < 7 days old; log `[reusing cached data]`.
- Report progress after each stage in one line (the user may be watching).
- Total honesty in `SUMMARY.md` beats completeness: a rep trusts this tool only as long as it never dresses up thin findings.
