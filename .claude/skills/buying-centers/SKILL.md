---
name: buying-centers
description: Identify the people at a target account who would decide on buying business insurance from Corgi — economic buyers, champions, and their direct reports. Use when the user asks who to contact at a company, who the buyer is, or as stage 2 of the account-intel loop.
---

# Buying Centers & Target Contacts

**Input:** domain (stage 1 `research.md` should exist; run `/account-research` first if not).
**Output:** `runs/{slug}/buying-centers.md`.

## Who buys insurance at a startup (role model)

Depends on headcount — use stage-1 headcount to pick the frame:

- **< ~50 employees:** founder/CEO or COO is the economic buyer; whoever runs finance/ops is the doer. There is no "insurance person".
- **~50-200:** Head of Finance / CFO owns it; GC or first legal hire heavily involved for D&O/E&O; Head of People for EPL/workers' comp; CISO/security lead for cyber.
- **200+:** CFO (economic buyer), GC/legal (decision influence), Controller or VP Finance (runs the process), Head of People, CISO. Procurement may gate.

Champion ≠ buyer: the person feeling the pain (sales leader blocked on a COI, compliance lead chasing SOC 2) often isn't the one who signs. Flag both.

## Process

1. From public sources only (LinkedIn public pages via web search, team/about pages, press releases, podcast/conference bios, funding announcements naming execs): find names + exact titles for the roles above. Searches like `site:linkedin.com/in "{company}" CFO OR "head of finance"`, `"{company}" "general counsel"`, plus the company's own team page.
2. For each key person, where findable, list likely **direct reports** (same method) so the rep can cast a wider net.
3. **No enrichment** (per the brief): no emails, no phone numbers, no guessing addresses. Names, titles, public profile URLs, and public bio facts only.
4. Note recency: a person who **joined in the last ~6 months** is flagged — new-in-seat finance/legal/people executives are the single best outreach window (they're expected to fix vendors).

## Output format (`buying-centers.md`)

Table: Name | Title | Role in deal (Economic buyer / Champion / Influencer / Doer) | Why them (1 line, tied to coverage lines) | Tenure note | Source URL.

Then: **Recommended entry points** — ranked top 2-3 contacts with one sentence each on the angle, and a wider-net list (direct reports / adjacent roles).

## Quality bar

- Every person verifiably works there NOW (check for stale profiles; note "as of {date}").
- If a key seat appears empty (no CFO findable), say so — "no CFO; founder likely owns finance" is actionable intel.
- Wrong-person outreach is worse than no outreach: when confidence is low, mark it low.
