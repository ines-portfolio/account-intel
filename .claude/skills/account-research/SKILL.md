---
name: account-research
description: Deep-research a target account (company name or domain) for Corgi sales. Produces the company fact base — what they do, HQ, headcount, funding, growth, who they sell to — plus an insurance-relevance read. Use when the user asks to research a company, prep an account, or starts the account-intel loop.
---

# Account Research

**Input:** company name or domain. Resolve to a canonical domain first (search if given only a name; confirm you have the right company, not a name collision).
**Output:** `runs/{slug}/research.md` + raw evidence in `runs/{slug}/raw_data/`.

## Process

0. **Cache check.** If `runs/{slug}/raw_data/` has research younger than 7 days, reuse it and say so.
1. **Their own words.** Fetch the company homepage, /about, /careers, /pricing, /customers, /security or /trust pages. This gives product, ICP, self-described positioning, and hiring posture.
2. **Firmographics.** Web-search for: HQ location, founding year, headcount (LinkedIn company page number when visible), funding history (round, date, amount, lead investors), revenue if public. Prefer primary/recent sources; note the date on everything.
3. **Trajectory.** Last 12 months of news: launches, funding, expansion, exec hires, partnerships, incidents. 3-6 searches, e.g. `"{company}" funding 2026`, `"{company}" launch OR announcement`, `"{company}" hires OR appoints`.
4. **Priorities.** Infer what the company is currently trying to do (go upmarket, ship AI, expand geo, hit compliance) from careers-page patterns, blog/changelog, founder posts. Label inferences as inferences.
5. **Insurance-relevance read.** Close with a short section: which of these facts map to triggers in `context/{client}/positioning.md`, and which Corgi coverage lines are most plausible for this company. (The deep signal hunt is `/intent-signals`; this is the first-pass read.)

## Output format (`research.md`)

- **Snapshot** (5-8 bullet facts: what they do, HQ, headcount, stage/funding, who they sell to, business model)
- **What they're prioritizing right now** (3-5 bullets, inference-labeled)
- **Timeline** (dated events, last 12 months)
- **Why this account could need Corgi** (trigger mapping + likely coverage lines)
- Per-section `> Sources: {url} (accessed YYYY-MM-DD)` lines.

## Quality bar

- Every number (headcount, funding) has a source and date; conflicting sources are flagged, not averaged.
- If the company is a poor Corgi fit (not US, not the ICP in `context/{client}/positioning.md`), say so at the top — that IS the finding.
- Save each meaningful fetched page / search result set into `raw_data/` as you go (markdown or JSON, named `{source}_{date}`).
