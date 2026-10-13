# Corgi — positioning, offerings, customers, signals and proof

**This is the one file to edit when Corgi's story changes.** Every stage of the agent reads it; nothing about Corgi is written anywhere else. Last verified against public sources: 2026-10-12. Last edited in the app: 2026-10-13.

How to edit:
- Change a section, bump the date above. The next run uses it.
- A claim may appear in outbound only if it is in section 6 with a source.
- To add a segment, copy section 4 or 5 and fill in the same five parts: who, buyers, signals, how to use them, do-not-pitch.

Sections: 1 Company · 2 Offerings · 3 Why it wins · 4 Segment: startups · 5 Segment: trucking · 6 Proof points · 7 Competitors · 8 Credibility

---

## 1. Company

Corgi (corgi.insure) is an AI-native, full-stack insurance carrier. It is the carrier, not a broker: it designs, prices, underwrites and issues its own policies.

Homepage headline: "Business Insurance at the Speed of Compute." Sub: "No confusion, no waiting. Get a quote in minutes." Trucking page title: "Trucking Insurance at the Speed of Dispatch."

> Sources: https://www.corgi.insure/ ; https://trucking.corgi.insure (accessed 2026-10-12)

## 2. Offerings

**Startup packages, sold by stage:** Pre-Seed & Seed, Series A, Growth Stage, Custom.

**Core lines:** General Liability, Cyber Liability, Tech E&O, AI Liability, Directors & Officers (D&O), Employment Practices (EPL), Fiduciary, Media, Hired & Non-Owned Auto.

**Specialty lines:** Umbrella, Workers' Comp, Business Owners Policy, Crime, Kidnap & Ransom, Representations & Warranties, Data Center, Fine Art, Commercial Property, Professional E&O.

**Trucking:** Auto Liability, Cargo, Per-load coverage.

> Sources: https://www.corgi.insure/ ; https://www.ycombinator.com/companies/corgi-insurance/jobs/tfB8vpM-account-executive (accessed 2026-10-11)

## 3. Why it wins

- **Speed:** quote in minutes, bind the same day. Specialty lines 1–14 days.
- **No middleman:** direct relationship with the carrier, including for claims.
- **Modular:** add lines as new requirements appear, without starting over.

> Sources: https://www.corgi.insure/ (accessed 2026-10-11)

---

## 4. Segment: startups

### Who
US venture-backed technology companies, pre-seed through growth: SaaS, AI, fintech, marketplaces, health tech. Not a fit: no US operations, winding down.

### Buyers (pick the frame by headcount)

| Company size | Signs | Runs the process | Also involved |
|---|---|---|---|
| Under ~50 | Founder / CEO or COO | Whoever runs finance or ops | — |
| ~50–200 | Head of Finance / CFO | Controller, finance lead | Legal (D&O, E&O), People (EPL, workers' comp), Security (cyber) |
| 200+ | CFO | VP Finance / Controller | General Counsel, People, CISO, procurement |

The person feeling the pain (a sales lead blocked on a certificate, a compliance lead chasing SOC 2) is often not the signer. Name both.

### Signals
The signals the agent looks for, why each matters and how each is fetched are fixed in the app, not in this file, so they cannot be changed by editing the positioning. See **How signals work** in the app's sidebar (source: `src/signals.mjs`).

**Signals about people** can only be used in that person's own message.

### Do not pitch
Layoffs or wind-down · no US operations · a recent public tie-up with a competing insurer (note it, with the likely renewal month).

> Sources: https://beancount.io/blog/2026/05/10/directors-officers-d-and-o-insurance-startups-2026-coverage-limits-premium-benchmarks-investors-guide ; https://www.vouch.us/blog/when-does-my-startup-need-insurance (accessed 2026-10-11). Windows and the buyer table are inference from public sources; validate against Corgi's closed-won data.

---

## 5. Segment: trucking

### Who
US for-hire trucking fleets. Sweet spot per Corgi's own sales posts: **20–200 power units**. Larger "enterprise" deals are embedded partners (fleet software, telematics, load boards), which are out of scope here.

Not a fit: subsidiaries of large carriers (the parent buys insurance for the group), inactive USDOT status, no active operating authority.

### Buyers
Fleet owner (usually signs), safety director, dispatcher or operations lead. Brokers and agents sit in some deals. The owner's name is on the federal registration, which the agent returns as "officers".

### The signal: a public end date on their liability insurance

Every interstate for-hire carrier must keep proof of liability insurance on file with the federal regulator (FMCSA). An insurer must give 30 days' notice before a policy can be cancelled. Those filings are public and updated daily. So for any carrier we can see who insures them, since when, and whether an end date has been filed.

The agent checks this with `src/tools/fmcsa.mjs` and returns one of:

| Result | What the filings show | Strength | What the rep does |
|---|---|---|---|
| **End date, no replacement** | Current policy has a filed end date in the future and no new policy is on file | Strong | Call today. There is a dated deadline. |
| **End date, no replacement, earlier notices reversed** | Same, but end dates were filed and withdrawn on this policy before | Moderate | Call, but expect it may be reinstated. Do not promise a deadline. |
| **Already replaced** | A newer policy is on file | None | Too late this cycle. Note the new start date as next year's renewal month. |
| **Renewal estimate** | No end date; policy start date + 12 months | Weak, only inside 90 days | Supporting line only. It is an estimate, not a fact. |
| **Disqualified** | Inactive, no authority, or fleet outside 20–200 | — | Do not work it. |

Supporting facts the same lookup returns: fleet size, driver count, safety rating, and how many insurers the carrier has had since 2021 (frequent switching suggests a price shopper; inference).

**Three things the data cannot tell you, so the research stage must:**
1. **Why the policy is ending.** The filing says "terminated / replaced" in almost every case. Never state or imply a reason.
2. **Whether a replacement is already bought but not yet filed.** Re-run the lookup on the day of outreach.
3. **Who really buys.** A subsidiary shows up as its own carrier. Check ownership before using the signal.

### How to use it in a message

Rules on top of `voice.md`:
- Lead with the date and what it means for them, never with the insurer's decision. "Your liability filing shows coverage through Oct 22" is a fact. "Your insurer is dropping you" is an accusation.
- Say where you saw it. It is a public federal filing; naming it is what makes the message credible and not creepy.
- One ask: a quote before the date.
- Phone first. Corgi's reps call. The opener must work in 20 seconds.
- Do not quote speed claims or customer stories from section 6 for trucking. Those are published for the startup product; no trucking turnaround, pricing claim or customer story has a public source yet.

Message options by result:

| Result | Call opener (20 seconds) | Email subject | Email angle |
|---|---|---|---|
| End date, no replacement | "Hi {first name}, {rep} at Corgi, we're a trucking insurance carrier. I'm calling because your federal filing shows your liability coverage with {insurer} running through {date}, and I don't see a new policy filed yet. Do you already have that handled, or is it worth us putting a quote next to it this week?" | "coverage through {date}" | The date, the public source, an offer to quote before it. Three sentences. |
| Earlier notices reversed | Same opener, drop "I don't see a new policy filed yet"; ask "is that still in motion?" | "your {date} filing" | Ask, don't assert. |
| Already replaced | No call. | — | One nurture note 60–90 days before next year's start date. |
| Renewal estimate | "…your current policy with {insurer} started {month}, so I'm guessing renewal is coming up around then. Who is quoting it?" | "{month} renewal" | Framed as a guess. |

### Worked examples (real carriers, checked 2026-10-12, data through 2026-10-11)

Saved as runs `usdot-2941788-besh-llc`, `usdot-424572-hercules-forwarding-llc` and `usdot-1506989-b-b-transport-inc`.

| Carrier | Filings show | Tool result | Final call |
|---|---|---|---|
| **Besh LLC**, Aurora CO. USDOT 2941788. 105 power units, 105 drivers, active authority | Liability policy with CorePointe, started 2026-01-29, end date filed for **2026-10-22**. No replacement on file. Two earlier end dates on the same policy (May 2026) were withdrawn. Four insurers since 2021. | Moderate | **Work it, phone first, "earlier notices reversed" script.** Ten days to the date. Flag for underwriting: repeated notices, no safety rating on file. |
| **Hercules Forwarding LLC**, Vernon CA. USDOT 424572. 166 power units, satisfactory safety rating | Liability policy with Obsidian since 2024-10-01, end date filed for 2026-10-29. No replacement on file. A sister carrier shares the same policy number and end date. | Strong | **Rejected by research.** Hercules was acquired by TFI International in March 2024; the shared policy points to a group program bought by the parent. Not a 20–200 fleet decision. |
| **B&B Transport Inc**, Fresno CA. USDOT 1506989. 190 power units | End date of 2026-10-19 was filed, then a new filing with the same insurer started 2026-10-06. | No signal (replaced; next renewal estimated 359 days out) | **Skip this cycle.** Renewal month to note: October. |

Scale check from the same day: 1,822 liability policies nationwide had an end date filed for the following seven weeks. 154 belonged to fleets of 20–200 power units. After requiring an active carrier, active authority and no replacement on file, **18 remained**. Most raw hits are noise; the filters are the product.

> Sources: FMCSA open data, https://data.transportation.gov/resource/c5y8-a4uz.json (active policies), https://data.transportation.gov/resource/3uet-3z4i.json (ended or ending policies), https://data.transportation.gov/resource/az4n-8mr2.json (carrier census), https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=424572 ; 30-day notice rule: https://www.law.cornell.edu/cfr/text/49/387.313 ; TFI acquisition: https://www.einpresswire.com/article/695128845/tfi-international-acquires-hercules-forwarding ; fleet sweet spot and buyer titles: https://www.ycombinator.com/companies/corgi-insurance/jobs/tfB8vpM-account-executive (accessed 2026-10-12). Message scripts and strength labels are my inference.

---

## 6. Proof points (the only Corgi claims allowed in outbound)

**Product claims (startup product):** quote in minutes · same-day binding · modular coverage under one roof · Corgi is the carrier, with no broker in the middle.

**Customer logos on the homepage:** Artisan, AthenaHQ, Bland, Deel, Slash, Eragon, Intryc, Origami, Photon, Judgment Labs, Series, Tandem, PromptingCo, Pocket.

### Customer stories

The app reads this table. For each account it picks the stories closest to the prospect and uses one as the proof line in each message. To add a story, add a row.

What each column is: **What they do, Situation, Result** are summaries of Corgi's page; **Quote** is word for word from the page in the Source column; **Use when the prospect** is our own matching hint. It describes the prospect, never the customer, and is not given to the drafting step.

| Customer | What they do | Situation | Result | Quote | Speaker | Use when the prospect | Source |
|---|---|---|---|---|---|---|---|
| Artisan | AI employees (an AI sales rep) sold to banks, insurers and large B2B SaaS companies | Every enterprise deal depended on insurance; one broker was very expensive, another took weeks to bind; a 2.0 launch needed higher limits | Paid 30% less than with its previous broker and had higher limits bound in two days | "With Corgi, it's been faster, easier, and cheaper. We paid 30% less than we did before. You guys are both the carrier and the broker, two in one. We got it all done in two days." | Jasper, Founder & CEO, Artisan | sells to banks, insurers or other regulated enterprises; is unhappy with broker cost or speed; has a renewal or needs higher limits | https://www.corgi.insure/customers/artisan |
| Eragon | AI and enterprise SaaS | Landed a deal with one of the world's largest companies that came with a long list of insurance requirements on the customer's timeline | Met every requirement and closed the contract in days, not weeks | "The Corgi team, in a matter of minutes, took care of all the insurance requirements I needed in order to land our first 7-figure enterprise contract" | Josh Sirota, Founder & CEO, Eragon | is closing its first large enterprise contract; has a deal waiting on insurance requirements | https://www.corgi.insure/customers/eragon (quote from https://www.corgi.insure/) |
| Imagine AI | AI content marketing automation for mid-market and larger companies | An enterprise customer asked for proof of business insurance and quotes from brokers were taking too long | Went from form to certificate in about two minutes and added D&O the same day | "It took only about 2 minutes to sign up for insurance. That's another reason I went with Corgi, because it was just so easy. Once we filled out the form, we got our quote, paid, and we already had our insurance." | Sky Yang, Co-Founder & CEO, Imagine AI | has a customer asking for proof of insurance; is a small team buying insurance for the first time; just raised and needs D&O | https://www.corgi.insure/customers/imagine-ai |
| Intryc | AI quality assurance for customer support; YC S24; handles data for enterprises such as Deel and Factorial | Six-figure contracts where customers scrutinize information security; legacy providers meant days or weeks of waiting | Went from application to documented coverage in five minutes, with a shared Slack channel to Corgi's team | "I went through the application in five minutes and instead of searching an ocean of policies, the team had everything packaged up for me." | Alex Marantelos, Co-Founder & CEO, Intryc | handles customer data for larger companies; is working on SOC 2 or security reviews; is an early-stage AI company | https://www.corgi.insure/customers/intryc |
| Sorcerer | Weather balloons and forecasting, with hardware deployed around the world | At its first renewal a traditional startup broker nearly doubled the price and labelled it "higher risk" | Got coverage built around its real risks after walking Corgi through the business | "Most brokers didn't really know what we were doing, but with Corgi, I was able to walk them through our business and get something tailored to exactly what we need." | Austin Tindle, Co-Founder & CEO, Sorcerer | makes hardware or has unusual operational risk; had a renewal price jump; has been told it is hard to insure | https://www.corgi.insure/customers/sorcerer |
| Pax | Not stated on Corgi's site | Needed insurance to close a large customer contract | Got its certificate of insurance the same day and kept the deal moving | "We needed insurance to close a large customer contract. Corgi delivered a quote fast, with zero back-and-forth. We got our certificate of insurance the same day and kept the deal moving." | Penny Chen, CEO, Pax | has a contract blocked on a certificate of insurance | https://www.corgi.insure/ |
| Bland | Sells to some of the largest companies in the world | Large customers require a lot of coverage, and each new customer can bring new requirements | Adds coverage as customers ask for it without starting a new process each time | "Corgi takes care of everything, we don't have to go through the hassle of a new process every time a customer needs something new." | Isaiah N. Granet, Co-Founder & CEO, Bland | is moving upmarket and keeps getting new insurance requirements from customers | https://www.corgi.insure/ |
| Origami | Not stated on Corgi's site | Insuring office space used to mean days of emails, calls and waiting on quotes | Got a quote and certificate for its office almost immediately | "Corgi got us a quote and certificate so fast I actually double-checked it was real." | Finn Mallery, Co-founder, Origami | is opening an office or signing a lease | https://www.corgi.insure/ |
| AthenaHQ | Serves customers such as Coinbase and SoFi | Needs coverage that large financial customers expect | Stays covered and focused on customers like Coinbase and SoFi | "Being protected by Corgi enables us to focus on the business itself & helps us drive value for our customers like Coinbase, SoFi, and more" | Andrew Yan, CEO, AthenaHQ | sells to fintech or financial-services companies | https://www.corgi.insure/ |
| Series | Not stated on Corgi's site | Had been putting off insurance because it seemed tedious | Got insured in 10 minutes | "Was procrastinating on getting insurance because of how tedious it seemed. Who knew you could get your business insured in 10 minutes." | Sean Hargrow, Co-Founder & COO, Series | has no insurance yet; is a founder doing this for the first time | https://www.corgi.insure/ |
| Hallway.com | Not stated on Corgi's site | Buying insurance while preparing for a launch | Bought through a quick quote with direct access to the team | "Corgi took the guesswork out of buying insurance. Between a smooth, modern quoting experience and immediate access to the team, they let me get back to preparing for our launch." | Will Scrivener, CEO, Hallway.com | is about to launch a product | https://www.corgi.insure/ |

**Gaps to be honest about.** Corgi has published no story about workers' comp, hiring in a new state or first US hires, and none about a trucking fleet. When the signal is one of those, the message uses a product claim, not a customer story.

**Never:** invent a result, a saving or a price, or attach one customer's number to another. "30% less" belongs to Artisan only.

> Sources: https://www.corgi.insure/ ; https://www.corgi.insure/customers ; the five story pages linked in the table (accessed 2026-10-12)

## 7. Competitors (never name one in outbound)

- **Brokers and incumbent carriers:** slow, annual, opaque. Contrast with "the broker process".
- **Vouch:** closest startup-focused comparable. Corgi differs on being the carrier, on speed, and on AI liability.
- **NEXT, Embroker, Coalition, At-Bay:** partial overlaps (small business, digital brokerage, cyber only).

> Sources: https://sacra.com/c/corgi/ (accessed 2026-10-09)

## 8. Credibility (use sparingly)

- Licensed insurance carrier; regulatory approval July 2025.
- $160M Series B led by TCV at a $1.3B valuation (May 2026). Later rounds are reported at $2.6B and $4B; quote only the Series B.
- **Do not use:** "40,000+ customers" and "49 states". Neither is on corgi.insure today.

> Sources: https://www.corgi.insure/ ; https://en.wikipedia.org/wiki/Corgi_(insurance_company) (accessed 2026-10-11)
