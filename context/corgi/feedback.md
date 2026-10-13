# Messaging Feedback Log

How the agent learns over time. The drafting skill reads this file before writing; humans (or reply data) append to it after. Lessons that repeat 2+ times graduate into permanent rules in `context/corgi/voice.md`.

Format: newest first. One entry per lesson.

---

## Template

### YYYY-MM-DD — {one-line lesson}
- **What happened:** {draft X said Y; the rep changed it to Z / the prospect replied to A, ignored B}
- **Why:** {the underlying reason, best guess}
- **How to apply:** {the rule for future drafts}

---

<!-- Entries start below. Seed example (from the first build session): -->

### 2026-10-09 — Signal-role fit beats signal strength
- **What happened:** initial drafting logic picked the strongest signal for every contact.
- **Why:** a workers' comp signal is weak in a CFO email but strong to a Head of People; relevance is per-reader.
- **How to apply:** pick the lead signal per contact role, not per account (now codified in `draft-outreach` step 1).

### 2026-10-12 — A draft with no specific fact about the company is not worth sending
- **What happened:** the opener for Reach AI said "Since Reach AI is scaling up your B2B SaaS growth platform, how are you currently handling your general liability and tech E&O renewals?" Inês rejected it as generic.
- **Why:** it names no event at the company and no reason insurance is needed now. Any company could receive it.
- **How to apply:** build every message in this order: (1) one specific, sourced fact about the company, (2) why that fact creates an insurance requirement, (3) a question asking whether it is already covered, (4) one allowed proof line. If no signal passed, lead with the strongest sourced fact about the company (growth, customers, hiring, locations) and say plainly why it matters for insurance. Never claim Corgi "has helped similar companies with that" unless positioning section 6 has that exact story.

### 2026-10-12 — Rep feedback on a draft for Wyatt Smith at UpSmith
- **What happened:** the rep rejected this draft: "Hi Wyatt, Saw you closed your $10M Series A in October. New funding rounds usually bring a D&O insurance requirement from investors. Are you currently sorting out your D&O coverage, or open to comparing options? With Corgi, you get a quote in minutes and same-day binding directly with us as the carr"
- **Why:** too formal, write like a founder texting another founder
- **How to apply:** avoid this in future drafts for similar contacts.
