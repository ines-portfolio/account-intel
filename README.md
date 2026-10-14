# Account Intel

I built this for the Corgi GTM Engineer take-home. A rep types a company name and gets back what they need to break into the account: who the company is, whether there is a real reason to reach out now, who to talk to, and the messages to send.

It is a chat app that runs on your laptop. Every account keeps its own brief and its own conversation, so you can come back to it and keep asking.

## Try it live

The app is deployed at **https://ines-gouveia-gtm-challenge.onrender.com**. It needs a sign-in: to get credentials, contact me at inesg.gtm@gmail.com.

It runs on a free server that sleeps when nobody uses it, so the first page can take up to a minute to load. The ten saved accounts are always there; accounts researched on the live copy are cleared when the server restarts.

## Run it locally

You need Node 20 or newer. There is nothing to install.

```bash
git clone https://github.com/ines-portfolio/account-intel.git
cd account-intel
cp .env.example .env     # then add your keys, see below
npm start
```

With the zip instead of GitHub: unzip it, `cd account-intel`, then the last two lines.

Open http://localhost:3000. If that port is taken, start it with `PORT=3001 npm start` and open http://localhost:3001.

**Without any keys** you can already open the saved accounts in the sidebar and run trucking accounts live, because those use free federal data and no AI model.

**For startup accounts** add one model key to `.env`. I used Google Gemini's free tier (`GEMINI_API_KEY`). Claude, Groq, OpenRouter or a local Ollama model work too; the app uses the first one it finds.

If a key is missing, the app says so where the content would be and shows a **How to set it up** button with the exact steps, or a message to copy to whoever runs the app for you.

**Optional keys**
- `EXA_API_KEY`: much better web and people search. About 3 cents per account.
- `APOLLO_API_KEY`: more contacts, work emails and the company phone line. Needs a paid Apollo plan.

## Try these

Type each one into the chat.

| Type this | What the saved run shows |
|---|---|
| `UpSmith` | A startup that raised a $10M Series A on October 5. Two strong signals from the same week: the round, and two new board members. Drafts lead with the D&O requirement that follows a round and close with a proof line from a matched Corgi customer. |
| `Stuut` | Raised a $52.5M Series B on October 7. Four signals: the round, the CEO's own post about it, enterprise roles and hiring in three US states (both read from the job board). Five people, including the Head of Finance and Operations. |
| `Namespace` | Raised a $42M Series B on October 5. Signals from the round, enterprise growth, a post by the COO and hiring in three states. |
| `usereach.ai` | Reach, a company in Lisbon that lists jobs only on its own website. The agent read that careers page, found roles in New York, and flagged the first US hires: workers' comp is needed from the first US employee. Verdict is "Check fit first" because no US entity shows up yet. |
| `Vanta` | Three signals, none of them a funding round: an AI product launch, seven open enterprise-sales and compliance roles read from the job feed, and a new CFO. |
| `Rein Security` | Raised $25M the same week, a strong signal. But the company is headquartered in Tel Aviv and no US entity shows up in the sources, so the verdict is "Check fit first", not "Work it". |
| `Appsmith` | "No signal right now". The agent found a funding round and an AI launch and rejected both as too old. |
| `Besh LLC` | A 105-truck fleet whose federal filing shows liability coverage ending October 22 with no replacement on file. Moderate signal, a call opener, and the phone number from the federal registration. |
| `usdot 424572` | Hercules Forwarding. The filings look like the best lead of all; the agent rejects it because news shows it was acquired by TFI International, so the parent buys the insurance. |
| `usdot 1506989` | B&B Transport. Its end date was already replaced by a new filing, so: no signal, no drafts. |

These ten are saved in `runs/` and open as they were on October 13. Typing a name opens the saved run; click **Re-run** to research it again. A new run reads today's web and asks the model again, so the wording, and sometimes the verdict, can differ.

On every account, the Signals tab ends with **Everything the agent checked**: each signal it looked for and what came back, found or not.

## Two pages in the sidebar

- **Corgi positioning.** What Corgi is, what it sells, the claims reps may use and the customer stories, editable in place: add an offering, remove a claim, add a story. A change applies to the next run, and the previous version is kept.
- **How signals work.** The 16 signals the agent looks for (12 for startups, 4 for trucking fleets): what each one is, why it matters, and the exact source and steps used to fetch it. This list is fixed on purpose. Every extra signal adds noise for reps.

The sidebar collapses to a narrow rail, and both the sidebar and the report can be resized by dragging their edge. The report opens full screen with one click, and **Back to chat** returns.

Then, with an account open:

- `why is this only a moderate signal?`
- `make the email shorter`
- `write one for the Head of Sales instead`
- `what about Appsmith?` starts a new account without losing this one

On the **People** tab, "Find email" asks Apollo for one person's work email. It costs 1 Apollo credit, and the app tells you that and waits for a yes before spending it. Nothing paid ever runs on its own.

On the **Messages** tab, the thumbs-down asks what was wrong and saves it. The next draft reads that note first.

## Sharing a copy with sign-in

On your laptop the app opens without signing in. To share a copy, set `AUTH_ENABLED=true` in `.env` and list the people in `AUTH_USERS` (the format is in `.env.example`). Each sign-in is an email, a password and a role:

- **owner** can do everything.
- **guest** can open accounts, research new ones (15 a day by default) and rewrite messages, but cannot spend Apollo credits, edit the positioning or delete accounts.

To hear when a sign-in is used, add an ntfy.sh topic (`NOTIFY_NTFY_TOPIC`, a free phone notification with no account), a Slack incoming-webhook URL (`NOTIFY_SLACK_WEBHOOK`) or a CallMeBot WhatsApp key (`NOTIFY_WHATSAPP_PHONE` and `NOTIFY_WHATSAPP_APIKEY`). You get a message on each sign-in and each new research run.

## How a run works

1. **Find the company.** Name, domain or USDOT number. If the name is ambiguous, it asks which one.
2. **Collect evidence** in plain code: their website, news, public profiles, and then one fetcher per signal: the job board (roles, locations and full descriptions from the public feeds of Ashby, Greenhouse and Lever; if a company lists jobs only on its own site, that careers page is read instead), SEC fundraising filings, federal contract awards, and targeted news searches. For trucking, the federal insurance filings. Every item gets an id and is saved. Signals that code can decide alone, such as "hiring in five states", never go to the model.
3. **Research and buyers** read only that evidence. Then the agent looks up what each top contact has said publicly and when they started, so signals can be about a person as well as the company.
4. **Evidence gate.** A signal survives only if its quote is really in the source it cites, it maps to something Corgi sells, and it is recent: older than 12 months is thrown out, older than six can only support a message. Everything else lands in "considered and rejected" with the reason.
5. **Customer stories.** The agent picks up to three of Corgi's published customer stories that are closest to this account and says why. They show on the Proof tab.
6. **Drafts**: call opener, email, follow-up and two LinkedIn messages per person, each built on one signal that fits that person's role, with a proof line from a matched story. Code then checks each draft, and every later rewrite: length, banned phrases, that the sender is still "[Your name]", that only matched customers are named and nothing is said about them that Corgi's story does not say, and that numbers and timeframes match the sources. Problems show in red; the rep decides.

The whole thing takes about 30 seconds for a startup and a few seconds for a carrier.

## What I went deep on, and why

The brief asked for two or three things done properly over everything done thinly.

- **Intent signals.** The brief's sharpest line is that the agent "should not force signals". So a signal needs a real quote, a source and a recent date, and "no signal" is a normal answer. Rein Security, Appsmith, Hercules and B&B Transport are in the saved runs to show the agent holding back, and Vanta to show reasons to call that are not a funding round.
- **Messaging.** One signal per person, matched to their role, a coverage line Corgi actually sells, and proof taken only from the eleven customer stories on Corgi's own site.
- **Trucking.** Corgi's job posts show a trucking sales team that works the phone. Federal filings show, for every carrier, who insures them and when that coverage ends. On the day I built it, 1,822 policies had an end date in the next seven weeks; after filtering for fleet size, active status and no replacement on file, 18 were left. That list is the product.

## What I cut

- **Sending and sequencing.** The app stops at copy-ready text. Sending is a deliverability and compliance decision a person should make.
- **CRM sync, batch mode, a shared database.** Accounts are saved as files; the brief says local is enough.
- **A "find me companies" feature.** The brief starts from an account the rep already has.

## The two questions you asked me to be ready for

**How does it keep up when Corgi's positioning changes?** Everything the agent knows about Corgi is in one file, `context/corgi/positioning.md`: offerings, segments, buyers, allowed claims, customer stories. Edit it on the Corgi positioning page, or in the file, and the next run uses it. Nothing about Corgi is written anywhere else. A new offering immediately counts as something a signal can point to.

**How does it learn from feedback?** Every thumbs-down is saved with the rep's reason in `context/corgi/feedback.md`. Each reason is then given to the drafting and rewrite steps as a rule to follow, for every account. The rejected draft itself is never shown to the model, because a model shown a rejected draft tends to copy it. When the same note shows up twice it should become a rule in `voice.md`. With real volume I would feed reply and meeting rates per signal type into the same loop.

## Where things live

| To change | Edit |
|---|---|
| What Corgi sells, to whom, the allowed claims, the customer stories | The Corgi positioning page, or `context/corgi/positioning.md` |
| The signals and how each is fetched | `src/signals.mjs` (shown on the How signals work page) |
| How messages are written | `context/corgi/voice.md` |
| How each step reasons | `.claude/skills/*/SKILL.md` |
| Step order, the evidence gate, trucking rules | `src/pipeline.mjs` |
| Data sources | `src/tools/` |
| Saved accounts | `runs/` |

The skill files double as Claude Code commands if you open this folder in Claude Code.

## Honest limits

- On Gemini's free tier the strongest models are often busy, so a run can land on a small one. The brief shows which model answered. Results vary a little between runs.
- Headcount and revenue are whatever public pages say, unless you spend an Apollo credit for its estimate.
- "Direct reports" are likely roles, not named people.
- The paid Apollo lookups (email with company line, company facts) are built but I have not spent credits testing them.
- Direct and mobile numbers are switched off: Apollo only sends them to a public web address, which a laptop app does not have.
- Job signals need a job board or a careers page the agent can read. Careers pages are read through Exa, so without an Exa key those signals are skipped for companies with no job board.
- Websites that only render with JavaScript come back nearly empty unless Exa is set up.
