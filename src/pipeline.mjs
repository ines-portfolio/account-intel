// The account loop: resolve → collect → research → people + signals → evidence gate → drafts → brief.
// Stage order is fixed here; judgment inside the model stages comes from the skill files and positioning.md.
import "./env.mjs";
import { fetchPage, news, search } from "./tools/web.mjs";
import { openRoles } from "./tools/jobs.mjs";
import { formD } from "./tools/edgar.mjs";
import * as apollo from "./tools/apollo.mjs";
import { careersRoles } from "./tools/careers.mjs";
import { signalById, signalsFor, rubric, signalsText, collectSignals } from "./signals.mjs";
import { findCarrier, insuranceSignal } from "./tools/fmcsa.mjs";
import { chatJson, chat, llmConfig } from "./llm.mjs";
import { saveJson, loadJson, slugify, readContext, readSkill, customerStories, offeringsText, positioningFacts, feedbackRules } from "./store.mjs";

const SOCIAL = /(linkedin|facebook|twitter|x|instagram|youtube|wikipedia|crunchbase|glassdoor|indeed|bloomberg|zoominfo|pitchbook|github|medium)\./;
const FREE_MAIL = /(gmail|yahoo|hotmail|outlook|aol|icloud|msn|live|comcast|att|verizon)\./i;
const TRUCK_WORDS = /\b(truck|trucking|freight|transport|transportation|logistics|carrier|carriers|express|hauling|lines|llc|inc|corp|corporation)\b/i;
const US_PLACE = /\b(United States|USA|U\.S\.A?\.?|US)\b|\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|San Francisco|Los Angeles|Boston|Seattle|Austin|Chicago|Denver|Miami|Atlanta|Dallas)\b|, (A[LKZR]|C[AOT]|DE|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY]|DC)\b/;
const US_PRESENCE = /\b(US|U\.S\.|United States|American|Delaware)[- ](entity|office|offices|subsidiary|corporation|headquarters|HQ|incorporated)|incorporated in (the )?(US|U\.S\.|United States|Delaware)|\b(office|offices|headquarters|HQ) in (the )?(US|U\.S\.|United States|New York|San Francisco|California|Boston|Texas|Delaware)/i;
const TRUCKING_NEWS = /\b(truck\w*|freight|carrier|ltl|logistics|transport\w*|fleet|haul\w*|cargo|shipping|fmcsa|drivers?)\b/i;
const KEY_PAGES = /(about|company|team|leadership|people|careers|jobs|customers|case-stud|security|trust|press|news|blog|pricing)/i;
const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(Llc|Inc|Usa|Lp)\b/g, (m) => m.toUpperCase());
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

// ---------- Stage 0: resolve ----------

// Works out which company the rep means. Returns { account } when sure, or { candidates } to confirm with the rep.
export async function locate(input) {
  const q = input.trim().replace(/^usdot\s*#?\s*/i, "").replace(/[?!]+$/, "");
  if (/^\d{4,8}$/.test(q)) {
    const [c] = await findCarrier(q);
    if (!c) throw new Error(`No carrier with USDOT number ${q}.`);
    return { account: carrierAccount(c) };
  }
  const domain = !/\s/.test(q) && q.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i)?.[1]?.toLowerCase();
  if (domain) return { account: { name: titleCase(domain.split(".")[0]), domain, segment: "startups", slug: slugify(domain) } };
  if (TRUCK_WORDS.test(q)) {
    const matches = await findCarrier(q.replace(/[.,]/g, ""));
    const exact = matches.find((m) => m.legal_name === q.toUpperCase().replace(/[.,]/g, "")) ?? (matches.length === 1 ? matches[0] : null);
    if (exact) return { account: carrierAccount(exact) };
  }
  const hits = await search(`${q} company official website`, { limit: 8, mustMention: process.env.EXA_API_KEY ? undefined : q.split(/\s+/)[0] });
  const seen = new Set();
  const candidates = [];
  for (const h of hits) {
    let host;
    try { host = new URL(h.url).hostname.replace(/^www\./, ""); } catch { continue; }
    const root = host.split(".").slice(-2).join(".");
    if (SOCIAL.test(`${root}`) || seen.has(root)) continue;
    seen.add(root);
    candidates.push({ name: q, domain: root, title: h.title.slice(0, 90) });
  }
  if (!candidates.length) throw new Error(`I could not find a website for "${q}". Give me the domain, for example ramp.com.`);
  const squash = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const sure = candidates.find((c) => squash(c.domain.split(".")[0]) === squash(q));
  if (sure) return { account: { name: q, domain: sure.domain, segment: "startups", slug: slugify(sure.domain) } };
  return { query: q, candidates: candidates.slice(0, 3) };
}

function carrierAccount(c) {
  const mailDomain = (c.email_address ?? "").split("@")[1]?.toLowerCase();
  return {
    name: titleCase(c.legal_name),
    domain: mailDomain && !FREE_MAIL.test(mailDomain) ? mailDomain : null,
    usdot: String(Number(c.dot_number)),
    city: c.phy_city ?? null,
    segment: "trucking",
    slug: `usdot-${Number(c.dot_number)}-${slugify(c.legal_name)}`,
  };
}

// ---------- Stage 1: collect ----------

async function collect(account) {
  const sources = [];
  const add = (kind, s) => sources.push({ id: `S${sources.length + 1}`, kind, date: null, ...s });
  const name = account.name.replace(/\b(LLC|INC|Corp|Corporation)\b\.?/gi, "").trim();

  const pages = async () => {
    if (!account.domain) return;
    const home = await fetchPage(`https://${account.domain}`);
    if (!home) return;
    add("page", { url: home.url, title: home.title, text: home.text });
    homeLinks = home.links;
    const origin = new URL(home.url).origin;
    const internal = [...new Set(home.links.map((l) => { try { return new URL(l, origin).href.split("?")[0]; } catch { return null; } })
      .filter((u) => u && u.startsWith(origin) && KEY_PAGES.test(new URL(u).pathname)))];
    const guesses = ["/about", "/company", "/careers", "/customers", "/security", "/blog"].map((p) => origin + p);
    const seen = new Set([home.text.slice(0, 300)]);
    for (const page of await Promise.all((internal.length ? internal : guesses).slice(0, 8).map((u) => fetchPage(u, 6000)))) {
      if (!page || page.text.length < 200 || seen.has(page.text.slice(0, 300))) continue;
      seen.add(page.text.slice(0, 300));
      add("page", { url: page.url, title: page.title, text: page.text });
    }
  };
  let roles = null, homeLinks = [];
  const jobs = async () => {
    if (account.segment === "trucking") return;
    // A job board first; if the company lists jobs on its own site instead, read its careers page.
    roles = (await openRoles([account.domain?.split(".")[0], slugify(name).replaceAll("-", ""), slugify(name)])) ?? (await careersRoles(account.domain, homeLinks));
    if (!roles) return;
    const list = (pairs) => pairs.slice(0, 12).map(([k, n]) => `${k} (${n})`).join(", ");
    add("jobs", {
      url: roles.boardUrl, title: `${roles.total} open roles on ${roles.provider}`, date: new Date().toISOString().slice(0, 10),
      text: `${roles.total} open roles. By location: ${list(roles.byLocation)}. By department: ${list(roles.byDepartment)}. Titles: ${roles.jobs.slice(0, 80).map((j) => `${j.title} [${j.location ?? "n/a"}]`).join("; ")}`,
      data: { total: roles.total, byLocation: roles.byLocation.slice(0, 10), byDepartment: roles.byDepartment.slice(0, 10) },
    });
  };
  const filings = async () => {
    if (account.segment === "trucking") return;
    for (const f of (await formD(name)).slice(0, 4))
      add("sec", { url: f.url, title: `SEC Form ${f.form} filed by ${f.issuer}`, date: f.filed, text: `SEC Form ${f.form} (notice of a private securities offering) filed ${f.filed} by ${f.issuer}, ${f.state ?? ""}.` });
  };
  const headlines = async () => {
    const queries = account.segment === "trucking" ? [`"${name}"`] : [`"${name}" ${account.domain}`, `"${name}" funding OR raises OR acquires OR launches`];
    const seen = new Set();
    for (const item of (await Promise.all(queries.map((q) => news(q, 8)))).flat()) {
      if (seen.has(item.title) || !norm(item.title).includes(norm(name))) continue;
      // A carrier's name is often a common word or surname. Keep a headline only if it is clearly about trucking or the carrier's home city.
      if (account.segment === "trucking" && !(TRUCKING_NEWS.test(`${item.title} ${item.snippet}`) || (account.city && norm(`${item.title} ${item.snippet}`).includes(norm(account.city))))) continue;
      seen.add(item.title);
      add("news", { url: item.url, title: item.title, date: item.date, text: `${item.title}. ${item.snippet}` });
    }
  };
  const people = async () => {
    if (account.segment === "trucking") return;
    const queries = [`${name} CFO OR "head of finance" OR "general counsel" linkedin`, `${name} CEO founder leadership team`];
    // With Exa connected, also look for the other buyers and for what leaders have said publicly (person-level signals).
    if (process.env.EXA_API_KEY) queries.push(`${name} (${account.domain}) head of people OR "head of security" OR controller OR "VP finance" OR COO`, `${name} (${account.domain}) founder or executive post about fundraising, enterprise customers, SOC 2, hiring or new office`);
    const seen = new Set();
    for (const r of (await Promise.all(queries.map((q) => search(q, { limit: 5, mustMention: name.split(" ")[0] })))).flat()) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      add("search", { url: r.url, title: r.title, date: r.date, text: `${r.title}. ${r.snippet}` });
    }
  };
  await pages();
  await Promise.all([jobs(), filings(), headlines(), people()]);
  return { sources, roles };
}

const digest = (sources, perSource = 3000, total = 60000) =>
  sources.map((s) => `[${s.id}] ${s.kind}${s.signal ? ` (fetched for signal: ${s.signal})` : ""} | ${s.url} | ${s.date ?? "undated"} | ${s.title}\n${s.text.slice(0, perSource)}`).join("\n\n").slice(0, total);

// ---------- Model stages (startups) ----------

const HOUSE_RULES = `You are one stage of an account-intelligence agent used by Corgi sales reps, running inside a web app.
Do not write files or call tools. All evidence is in the SOURCES block; use nothing else for facts about the account.
Every fact needs the id of the source it came from. If the sources do not say, write null. Never guess.
Today is ${new Date().toISOString().slice(0, 10)}. Reply with one JSON object only.`;

async function stage(skill, extraContext, instruction, sourcesText) {
  const system = [HOUSE_RULES, `# How this stage works\n${await readSkill(skill)}`, ...extraContext].join("\n\n---\n\n");
  return chatJson({ system, user: `${instruction}\n\n# SOURCES\n${sourcesText}` });
}

async function modelStages(account, sources, emit, found) {
  const positioning = `# Corgi positioning (single source of truth)\n${await readContext("positioning.md")}`;
  const src = digest(sources);

  emit("research", "running");
  const research = await stage("account-research", [positioning], `Account: ${account.name} (${account.domain}).
Return: {"name": string (the company's proper name as it writes it), "one_liner": string, "facts": [{"label": "HQ"|"Headcount"|"Founded"|"Funding"|"Sells to"|"Business model"|"Open roles"|string, "value": string, "source_id": string}],
(include "Headcount", "Revenue" and "Growth" whenever any source gives them; label database figures as estimates) "priorities": [{"text": string, "source_id": string}], "timeline": [{"date": "YYYY-MM-DD", "event": string, "source_id": string}],
"fit": {"verdict": "fit"|"not_a_fit"|"unclear", "reason": string}}
Fit rules: Corgi sells in the US. If the HQ is outside the US, the verdict is "unclear" unless a source shows a US office or US entity; name that source or say none was found. Companies far past growth stage (thousands of employees, public) are "unclear" too.`, src);
  if (research.name && research.name.length < 60) account.name = research.name;
  // Corgi sells in the US. A company headquartered elsewhere is only a fit when a source shows a US entity or office,
  // so this is checked here and not left to the model's judgment.
  const hq = String(research.facts?.find((f) => /^hq|headquarter/i.test(f.label))?.value ?? "");
  if (hq && !US_PLACE.test(hq) && research.fit?.verdict === "fit" && !US_PRESENCE.test(research.fit.reason ?? ""))
    research.fit = { verdict: "unclear", reason: `Headquartered in ${hq}, and the sources do not show a US entity or office. Corgi sells in the US, so confirm that before outreach.` };
  // A company based abroad that is hiring in the US is about to have US employees, which is its own reason to call.
  if (hq && !US_PLACE.test(hq) && found.usRoles?.states.length && !found.candidates.some((c) => c.signal_id === "hiring_states")) {
    const { states, titles, source_id } = found.usRoles;
    found.candidates.push({ signal_id: "hiring_states", maps_to: signalById("hiring_states").name, coverage: signalById("hiring_states").coverage, person: null, detected_by: "code", strength: "strong",
      headline: `Hiring in ${states.join(", ")} while headquartered in ${hq}`, quote: titles, source_id, date: new Date().toISOString().slice(0, 10),
      how_to_use: "A first US employee means workers' comp in that state from day one, and usually a US entity to hold the policy. Ask whether that is set up for the US hires." });
    found.checks.hiring_states = { status: "found", detail: `Open roles in ${states.join(", ")}; company is based in ${hq}` };
    if (research.fit?.verdict === "unclear") research.fit.reason += ` It is hiring in ${states.join(", ")}, so US employees are coming.`;
  }
  emit("research", "done", research.fit?.verdict);

  const context = `Research so far: ${JSON.stringify({ one_liner: research.one_liner, facts: research.facts, fit: research.fit })}`;

  emit("people", "running");
  const people = await stage("buying-centers", [positioning], `Account: ${account.name}. ${context}
Return: {"people": [{"name": string, "title": string, "role": "Economic buyer"|"Champion"|"Influencer"|"Runs the process", "why": string, "source_id": string, "confidence": "high"|"medium"|"low", "likely_reports": [string]}], "empty_seats": [string]}
The signer alone is not enough: a rep needs a way in besides the CEO. List every relevant person the sources name, up to 8: the signer, whoever runs finance, legal, people/HR and security, and likely champions such as the sales or operations lead. "empty_seats" = buyer roles from the table for which no person is named, as job titles a rep could search for.
Only people named in the sources. "likely_reports" are role titles inferred from the buyer table, not names, unless a source names them.
If sources disagree about who holds a role, prefer the company's own pages and the most recent dated source, and lower the confidence. Ignore jokes and ad campaigns.`, src);
  people.people = (people.people ?? []).filter((p) => p.name);
  emit("people", "done", `${people.people.length} found`);

  // Person-level evidence: what the top contacts have said or done publicly, and whether they are new in seat.
  emit("person", "running");
  const top = people.people.filter((p) => p.confidence !== "low").slice(0, 4);
  const tenure = await personEvidence(account, top, sources);
  emit("person", process.env.EXA_API_KEY ? "done" : "skipped", process.env.EXA_API_KEY ? `${sources.filter((x) => x.kind === "person").length} items about ${top.length} people` : "needs Exa search");

  emit("signals", "running");
  const signals = await stage("intent-signals", [positioning], `Account: ${account.name}. ${context}
Named contacts: ${JSON.stringify(top.map((p) => ({ name: p.name, title: p.title })))}
THE SIGNALS (only these count; anything else is background):
${rubric("startups")}
Already detected by code, do not report these again: ${found.candidates.map((c) => `${c.signal_id} ("${c.headline}")`).join("; ") || "none"}.
Sources marked "fetched for signal: X" were pulled to check signal X; judge whether they really show it.
Return: {"signals": [{"headline": string, "signal_id": string (one id from THE SIGNALS), "strength": "strong"|"moderate"|"weak", "coverage": [string], "quote": string (copied word for word from the source, 5 to 30 words), "source_id": string, "date": "YYYY-MM-DD"|null, "person": string|null, "how_to_use": string}],
"rejected": [{"candidate": string, "reason": string}], "bottom_line": string}
Zero signals is a valid answer. A signal without an exact quote from a source will be thrown out.
The quote itself must show the event the signal claims. A funding quote proves a funding signal, not an "enterprise customers" signal. One signal per event; do not restate the same event under a second row.
Two levels. Company signals: "person" is null. Person signals: something one named contact said or did publicly (their own post about the raise, a deal, compliance, hiring or broker pain; a press or podcast quote). Set "person" to that contact's exact name, take the quote from a source marked "person" for them, and say in "how_to_use" how a rep can mention it without sounding like surveillance. A post that is only a job title or a generic share is not a signal. Do not report "new in role"; that is checked separately.`, digest(sources));
  // Every signal must be one from the registry; then code-detected ones are added and all go through the same gate.
  const off = [];
  const fromModel = (signals.signals ?? []).filter((x) => {
    const def = signalById(x.signal_id) ?? signalsFor("startups").find((d) => norm(d.name) === norm(x.signal_id ?? x.maps_to ?? ""));
    if (!def) { off.push({ candidate: x.headline, reason: "Not one of the signals the agent tracks, so it is background, not a reason to call." }); return false; }
    Object.assign(x, { signal_id: def.id, maps_to: def.name, coverage: x.coverage?.length ? x.coverage : def.coverage });
    return true;
  });
  const have = new Set(fromModel.filter((x) => !x.person).map((x) => x.signal_id));
  signals.signals = [...tenure, ...fromModel, ...found.candidates.filter((c) => !have.has(c.signal_id))];
  signals.rejected = [...(signals.rejected ?? []), ...off];

  const gated = evidenceGate(signals, sources, await offeringsText());
  // Attach how each signal was found and why it matters, and record the outcome of every check.
  gated.signals = gated.signals.map((x) => ({ ...x, priority: signalById(x.signal_id)?.priority, found_by: signalById(x.signal_id)?.how.process, why_it_matters: signalById(x.signal_id)?.why, angle: signalById(x.signal_id)?.angle }));
  for (const x of gated.signals) found.checks[x.signal_id] = { status: "found", detail: x.headline };
  for (const c of Object.values(found.checks)) if (c.status === "checked") c.detail = c.detail.replace(/ to read$/, " read, none qualified");
  if (found.checks.exec_post?.status === "checked") found.checks.exec_post.detail = `${sources.filter((x) => x.kind === "person").length} public items about ${top.length} contacts read, none tied to an insurance moment`;

  // Customer stories: which of Corgi's published stories are closest to this account, and why.
  emit("proof", "running");
  const library = await customerStories();
  const picked = await chatJson({
    system: `${HOUSE_RULES}\nYou match a prospect to the most similar published Corgi customer stories. Similar means the same situation first (what is forcing the insurance purchase), then the same kind of company. Pick at most 3, best first. Pick none if nothing is genuinely close. "use_when_the_prospect" is a matching hint about the PROSPECT; it is not a fact about the customer, so never repeat it as something the customer did. Return {"picks": [{"customer": string (exact name from the list), "why_similar": string (one sentence naming what this prospect and that customer have in common; about the customer, use only its "what" and "situation")}]}`,
    user: `# Prospect\n${account.name}. ${context}\nSignals: ${JSON.stringify(gated.signals.map((x) => ({ headline: x.headline, maps_to: x.maps_to, person: x.person })))}\n\n# Corgi customer stories\n${JSON.stringify(library.map(({ customer, what, situation, result, useWhen }) => ({ customer, what, situation, result, use_when_the_prospect: useWhen })))}`,
  }).catch((err) => ({ picks: [], failed: err.message }));
  const proof = (picked.picks ?? []).map((pk) => ({ ...library.find((x) => x.customer.toLowerCase() === String(pk.customer).toLowerCase()), why_similar: pk.why_similar })).filter((x) => x.customer).slice(0, 3)
    // The note is the agent's own reasoning. If it credits the customer with a funding event the story never mentions, replace it with the story's own words.
    .map((x) => (FUNDING_CLAIM.test((String(x.why_similar).match(new RegExp(`[^.;]*\\b${x.customer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^.;]*`, "g")) ?? []).join(" ")) && !FUNDING_CLAIM.test(`${x.what} ${x.situation} ${x.result} ${x.quote}`)
      ? { ...x, why_similar: `Matched on situation. ${x.customer}: ${x.situation.charAt(0).toLowerCase()}${x.situation.slice(1)}.` } : x));
  if (!proof.length) {
    const top = gated.signals.find((x) => !x.person && x.strength !== "weak");
    const hit = top && STORY_FOR_SIGNAL.find(([pattern]) => pattern.test(`${top.maps_to} ${top.headline}`));
    const story = hit && library.find((x) => x.customer === hit[1]);
    if (story) { proof.push({ ...story, why_similar: `Matched by rule on the signal "${top.headline}". ${story.customer}: ${story.situation.charAt(0).toLowerCase()}${story.situation.slice(1)}.` }); picked.failed = undefined; }
  }
  emit("proof", picked.failed ? "failed" : "done", picked.failed ? "story matching did not run; messages use product claims" : proof.length ? proof.map((x) => x.customer).join(", ") : "no close match");
  emit("signals", "done", `${gated.signals.length} passed, ${gated.rejected.length} rejected`);

  let messages = [];
  const contacts = (people.people ?? []).filter((p) => p.confidence !== "low").slice(0, 3);
  if (contacts.length && research.fit?.verdict !== "not_a_fit") {
    emit("drafts", "running");
    const drafts = await stage("draft-outreach", [positioning, `# Voice rules\n${await readContext("voice.md")}`],
      `${await repRules()}Account: ${account.name}. ${context}
Contacts: ${JSON.stringify(contacts)}
Signals that passed the evidence check: ${JSON.stringify(gated.signals.map(({ found_by, why_it_matters, source_url, ...x }) => x))}
Each signal carries an "angle": why that event creates an insurance requirement, and the question to ask. Build the sentence after the opening fact from the lead signal's angle.
Choosing the lead signal for a contact: first one that fits their role, then the lowest "priority" number (1 beats 2 beats 3), then the strongest. A signal about that contact themselves wins only against signals of the same or lower priority.
${gated.signals.length ? "" : "No signal passed. Write relevance-based drafts and set nurture to true."}
Customer stories you may use as proof (and no others): ${JSON.stringify(proof.map(storyFacts))}
Say nothing about a customer beyond these fields. Do not carry a fact about the prospect (its funding round, its launch) over to the customer.
Proof line: one sentence built from one of these stories, chosen to match the situation in that contact's message, naming the customer and keeping its result or number exactly as given (for example "Eragon met every requirement on a 7-figure enterprise contract and closed it in days"). If the list is empty or none fits the message, use a product claim from section 6. A customer's words are theirs: either name the customer and say what happened to them, or leave the story out. Never turn a customer's quote into a sentence about Corgi. Set "proof_used" to the customer's name or null.
Numbers and timeframes: copy them exactly from the sources, the stories or the positioning. A range stays a range ("60 to 90 days", never "sixty days"); "about two minutes" keeps "about".
Every message must name the specific coverage line the fact calls for, and it must be a line listed in section 2.
Return: {"messages": [{"contact": string, "title": string, "signal_used": string|null, "nurture": boolean, "call_opener": string, "email": {"subject": string, "body": string}, "followup": string, "linkedin_note": string, "linkedin_dm": string, "why": string, "proof_used": string|null}]}
Sign every message as [Your name]. Plain text, no markdown.
If a signal has "person" equal to the contact, lead that contact's message with it and name where it was seen ("your post about...", "your interview with..."). Never use one person's signal in another person's message.
Claims about Corgi: use the wording in section 6 of the positioning ("quote in minutes", "same-day binding"), never stronger words like "instant".
Never imply you know the person or their work ("saw your work", "impressed by"). Only refer to something a source states, and say what it is.`, "(see the contacts and signals above)");
    const facts = `${await positioningFacts()}\n${signalsText()}`;
    messages = (drafts.messages ?? []).map(fixSender).map(lint).map((m) => claimChecks(m, { signals: gated.signals, proof, library, account, research, people: people.people, facts }));
    emit("drafts", "done", `${messages.length} contacts`);
  } else emit("drafts", "skipped", contacts.length ? "not a fit" : "no named contact found");

  return { research, people, signals: gated, messages, proof, checks: found.checks };
}

const BUYER_SEAT = /\b(cfo|chief financial|finance|controller|general counsel|legal|counsel|people|hr|human resources|security|ciso|coo|chief operating|operations)\b/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// One search per contact for their public posts and mentions (about 1 cent each with Exa). Results that do not
// name both the person and the company are dropped, so a namesake elsewhere cannot leak in.
// Returns ready-made "new in seat" signals, worked out in code from the start date on a public profile.
async function personEvidence(account, contacts, sources) {
  if (!process.env.EXA_API_KEY) return [];
  const company = norm(account.name);
  const tenure = [];
  const seenUrls = new Set(sources.map((x) => x.url));
  await Promise.all(contacts.map(async (p) => {
    const last = norm(p.name).split(" ").at(-1);
    const hits = await search(`${p.name} ${account.name} ${p.title} LinkedIn posts, interviews and announcements`, { limit: 6 });
    for (const h of hits) {
      const text = norm(`${h.title} ${h.snippet}`);
      if (!text.includes(last) || !text.includes(company.split(" ")[0])) continue;
      if (seenUrls.has(h.url)) continue;
      seenUrls.add(h.url);
      const postDate = h.snippet.match(/\b(20\d{2}-\d{2}-\d{2})/)?.[1] ?? null;
      sources.push({ id: `S${sources.length + 1}`, kind: "person", person: p.name, url: h.url, title: `${p.name}: ${h.title}`.slice(0, 140), date: h.date ?? postDate, text: `About ${p.name} (${p.title}). ${h.title}. ${h.snippet}` });
    }
    // New in seat: "Mon YYYY - Present" next to the company name on that person's public profile.
    for (const src of sources.filter((x) => /linkedin\.com\/in\//.test(x.url) && norm(x.text.slice(0, 300)).includes(last))) {
      for (const m of src.text.matchAll(/([A-Z][a-z]{2})[a-z]* (20\d{2}) [-–] Present/g)) {
        const before = norm(src.text.slice(Math.max(0, m.index - 260), m.index));
        // The date must sit next to this person's own job at this company, not a board seat or an older role.
        const titleWords = norm(p.title).split(" ").filter((w) => w.length > 2 && !["and", "the", "head", "chief", "officer"].includes(w));
        if (!before.includes(company.split(" ")[0]) || !titleWords.some((w) => before.slice(-160).includes(w))) continue;
        if (/\b(founder|owner)\b/i.test(p.title)) continue; // founders are never "new in seat"
        const started = new Date(Date.UTC(Number(m[2]), MONTHS.indexOf(m[1].toLowerCase()), 1));
        const days = Math.round((Date.now() - started) / 86_400_000);
        if (days < 0 || days > 120) continue;
        const buyer = BUYER_SEAT.test(p.title);
        tenure.push({ headline: `${p.name} started as ${p.title} in ${m[1]} ${m[2]}`, signal_id: "new_leader", maps_to: "New finance, legal, people or security lead", strength: buyer ? "moderate" : "weak", coverage: ["All lines"],
          quote: src.text.slice(Math.max(0, m.index - 80), m.index + m[0].length).replace(/\s+/g, " ").trim(), source_id: src.id, date: started.toISOString().slice(0, 10), person: p.name,
          how_to_use: buyer ? "New leaders review vendors in their first months. Ask what they have inherited, without congratulating them on a job you only read about." : "Background: recently joined. Not a reason to pitch insurance on its own." });
        return;
      }
    }
  }));
  return tenure;
}

// Used only when the model matches no story: the signal type decides which published story fits.
const STORY_FOR_SIGNAL = [
  [/priced round|series [a-h]|funding|raise|board member|director/i, "Imagine AI"],
  [/upmarket|enterprise|soc 2|trust page|certificate|contract|procurement/i, "Eragon"],
  [/office|lease/i, "Origami"],
  [/ai product|agent launch|ai launch|launch/i, "Intryc"],
];

// What reps have told the agent about earlier drafts, placed at the top of the request so it is followed, not skimmed.
async function repRules() {
  const rules = await feedbackRules();
  return rules.length ? `RULES FROM REPS. These come from feedback on earlier drafts. Follow every one in every message; where one conflicts with the default tone in the voice rules, the rep's rule wins. They change tone and content only: the sender is still "[Your name]" and the facts still come from the sources.\n${rules.map((r) => `- ${r}`).join("\n")}\n\n` : "";
}

// Only the verified parts of a customer story go to the drafting and rewrite steps.
const storyFacts = ({ customer, what, situation, result, quote, speaker }) => ({ customer, what, situation, result, quote, speaker });

// Words that claim a funding event or deal. Used to stop a prospect's news being attributed to a Corgi customer.
const FUNDING_CLAIM = /\b(rais(e|ed|es|ing)|fundrais\w*|funding|funded|series [a-h]\b|seed round|(a|the|their|its|new) round|acquir\w*)/i;

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, thirty: 30, sixty: 60, ninety: 90 };
const UNITS = "days?|weeks?|months?|minutes?|hours?";

// Checks on what a draft claims: run on first drafts and on every rewrite.
export function claimChecks(m, { signals, proof, library, account, research, people, facts }) {
  const issues = [];
  const all = `${m.call_opener} ${m.email.body} ${m.followup} ${m.linkedin_note} ${m.linkedin_dm}`;
  // "Your post" is only honest when a verified signal is about this very person.
  if (/\byour (own )?(post|interview|podcast|talk|article)\b/i.test(all) && !signals.some((x) => x.person === m.contact)) issues.push(`Says "your post" or similar, but no verified signal is about ${m.contact}. Reword before sending.`);
  // Customers: only the stories matched to this account, and nothing said about them that the story does not say.
  for (const story of library) {
    const name = new RegExp(`\\b${story.customer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    const text = story.customer === "Series" ? all.replace(/\bSeries (?:[A-H]\b|seed|round)/gi, "") : all;
    // A customer's words presented as Corgi's own: six words in a row from their quote, without their name.
    const quoted = norm(story.quote).split(" "), body = ` ${norm(text)} `;
    if (!name.test(text) && quoted.some((_, i) => i + 6 <= quoted.length && body.includes(` ${quoted.slice(i, i + 6).join(" ")} `))) issues.push(`Uses ${story.customer}'s own words without naming them. Name the customer or reword.`);
    if (!name.test(text)) continue;
    if (!proof.some((x) => x.customer === story.customer)) issues.push(`Mentions ${story.customer}, which was not matched to this account as a similar customer.`);
    const told = `${story.what} ${story.situation} ${story.result} ${story.quote}`;
    for (const sentence of text.match(/[^.!?\n]+[.!?]?/g) ?? []) if (name.test(sentence) && FUNDING_CLAIM.test(sentence) && !FUNDING_CLAIM.test(told)) issues.push(`Says ${story.customer} raised funding or similar, which Corgi's story does not say.`);
  }
  const proofText = proof.map((x) => `${x.result} ${x.quote} ${x.situation}`).join(" ");
  for (const pct of all.match(/\b\d+ ?%/g) ?? []) if (!proofText.replace(/\s/g, "").includes(pct.replace(/\s/g, ""))) issues.push(`Uses "${pct}", which is not in a matched customer story.`);
  // Ranges from the positioning must stay whole: "60–90 days" may not become "sixty days".
  for (const [, lo, hi, unit] of facts.matchAll(new RegExp(`\\b(\\d+)\\s*(?:–|-|to)\\s*(\\d+)\\s*(${UNITS})`, "gi"))) {
    if (Number(lo) === 0) continue; // "0–90 days" in the tables is a signal window, not a claim
    const word = (n) => Object.keys(WORD_NUMBERS).find((w) => WORD_NUMBERS[w] === Number(n)) ?? n;
    const says = (n) => new RegExp(`\\b(?:${n}|${word(n)})\\b`, "i");
    const stem = unit.replace(/s\??$/, "");
    for (const hit of all.matchAll(new RegExp(`[^.\\n]{0,40}\\b(?:${lo}|${word(lo)}|${hi}|${word(hi)})\\b[^.\\n]{0,24}${stem}`, "gi")))
      if (!(says(lo).test(hit[0]) && says(hi).test(hit[0])) && /D&O|requirement|investor|round|close/i.test(all)) { issues.push(`Timing changed: the positioning says ${lo} to ${hi} ${stem}s, the draft says "${hit[0].trim().slice(-48)}".`); break; }
  }
  // Any other number must come from this account's data, a matched story, or the positioning.
  const known = new Set((`${JSON.stringify({ account, research, signals, people })} ${proofText} ${facts}`.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  const unknown = new Set();
  for (const n of all.match(/\d+(?:[.,]\d+)*/g) ?? []) if (!known.has(Number(n.replace(/,/g, "")))) unknown.add(n);
  for (const [, w] of all.matchAll(new RegExp(`\\b(${Object.keys(WORD_NUMBERS).join("|")})\\s+(?:${UNITS})`, "gi"))) if (!known.has(WORD_NUMBERS[w.toLowerCase()])) unknown.add(w);
  if (unknown.size) issues.push(`Uses ${[...unknown].map((n) => `"${n}"`).join(", ")}, not found in this account's data, a matched story or the positioning. Check before sending.`);
  return issues.length ? { ...m, lint: [...new Set([...m.lint, ...issues])] } : m;
}

// A signal ships only if its quote is really in the source it cites.
const LINE_ALIASES = { gl: "general liability", epl: "employment practices", epli: "employment practices", "r&w": "representations", "workers comp": "workers' comp", bop: "business owners" };
// True when a coverage line named by the model is something Corgi actually sells (section 2 of the positioning).
const sells = (line, offerings) => {
  const l = line.toLowerCase().trim();
  if (/^all( lines)?$/.test(l)) return true;
  const key = LINE_ALIASES[l] ?? l;
  return offerings.includes(key) || key.split(/[^a-z&']+/).filter((w) => w.length > 3).some((w) => offerings.includes(w));
};

const ageInDays = (date) => (date && !Number.isNaN(Date.parse(date)) ? Math.round((Date.now() - Date.parse(date)) / 86_400_000) : 0);

export function evidenceGate(result, sources, offerings = "") {
  const byId = Object.fromEntries(sources.map((s) => [s.id, s]));
  const passed = [];
  const rejected = [...(result.rejected ?? [])];
  for (const s of result.signals ?? []) {
    const source = byId[s.source_id];
    const quote = norm(s.quote ?? "");
    const tokens = quote.split(" ").filter((t) => t.length > 3);
    const text = source ? norm(source.text) : "";
    const overlap = tokens.length ? tokens.filter((t) => text.includes(t)).length / tokens.length : 0;
    if (!source) rejected.push({ candidate: s.headline, reason: "Evidence check failed: cited source does not exist." });
    else if (tokens.length < 3 || !(text.includes(quote) || overlap >= 0.9)) rejected.push({ candidate: s.headline, reason: `Evidence check failed: the quote is not in ${s.source_id}.` });
    else if (s.person && source.person !== s.person && !norm(source.text).includes(norm(s.person).split(" ").at(-1))) rejected.push({ candidate: s.headline, reason: `Evidence check failed: ${s.source_id} is not about ${s.person}.` });
    else if (offerings && !(s.coverage ?? []).some((c) => sells(c, offerings))) rejected.push({ candidate: s.headline, reason: `Does not map to a coverage line Corgi sells (${(s.coverage ?? []).join(", ") || "none named"}).` });
    else if (ageInDays(s.date ?? source.date) > 365) rejected.push({ candidate: s.headline, reason: `Too old to be a reason to reach out now: dated ${s.date ?? source.date}, more than 12 months ago. Background only.` });
    else {
      if (offerings) s.coverage = s.coverage.filter((c) => sells(c, offerings));
      // Freshness: past six months (three for something a person said) it can support a message but not lead one.
      const age = ageInDays(s.date ?? source.date);
      if (age > (signalById(s.signal_id)?.windowDays ?? (s.person ? 90 : 180)) && s.strength !== "weak") { s.strength = "weak"; s.how_to_use = `Dated ${s.date ?? source.date}, so supporting evidence only. ${s.how_to_use}`; }
      const date = s.date ?? source.date;
      // No date means we cannot place it inside a signal window, so it can only ever support a message.
      passed.push({ ...s, source_url: source.url, date, strength: date ? s.strength : "weak", how_to_use: date ? s.how_to_use : `Undated, so supporting evidence only. ${s.how_to_use}` });
    }
  }
  const order = { strong: 0, moderate: 1, weak: 2 };
  return { signals: passed.sort((a, b) => order[a.strength] - order[b.strength]), rejected, bottom_line: result.bottom_line ?? "" };
}

const BANNED = ["i hope this finds you well", "i wanted to reach out", "quick question", "touching base", "circle back", "i know you're busy", "game-changer", "revolutionize", "seamless", "cutting-edge", "i was impressed by"];

// The sender is always "[Your name]". If the model put a name there, or left the rep out, fix it here and say so.
export function fixSender(m) {
  const corrections = [];
  const NOT_NAMES = /^(Hi|Hello|Hey|Team|Us|Me|Everyone|People|Folks|Here|Carrier)$/;
  // Names can be hyphenated or have three parts ("Matan Bar-Efrat"); take the whole name, not its last piece.
  const swap = (text) => text.replace(/(?<![\w-])([A-Z][\w'’]*(?:-[A-Z][\w'’]*)*(?: [A-Z][\w'’]*(?:-[A-Z][\w'’]*)*){0,2})(,? (?:here )?(?:at|with|from) Corgi\b)/g, (all, name, rest) => (NOT_NAMES.test(name) ? all : (corrections.push(`"${name}" replaced with [Your name] as the sender`), `[Your name]${rest}`)));
  let opener = swap(m.call_opener ?? ""), body = swap(m.email?.body ?? "");
  if (!/\[your name\]/i.test(opener)) {
    const greeting = opener.match(/^(?:Hi|Hello|Hey),? [^,.!?]{1,30}[,.!]\s*/)?.[0] ?? "";
    const rest = opener.slice(greeting.length).replace(/^(?:i'm |i am )?calling (?:from|with|at) Corgi\b,?\s*/i, "I'm calling ");
    opener = `${greeting}[Your name] at Corgi. ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
    corrections.push("[Your name] added to the call opener");
  }
  if (!/\[your name\]\s*$/i.test(body)) {
    const lines = body.trimEnd().split("\n");
    if (/^[A-Z][\w.'-]*(?: [A-Z][\w.'-]*){0,2}$/.test(lines.at(-1).trim()) && !/[.?!]$/.test(lines.at(-1))) lines.pop();
    body = `${lines.join("\n").trimEnd()}\n\n[Your name]`;
    corrections.push("email signature set to [Your name]");
  }
  return corrections.length ? { ...m, call_opener: opener, email: { ...m.email, body }, corrections: [...new Set(corrections)] } : m;
}

export function lint(message) {
  const clean = (t) => (t ?? "").replace(/\s*—\s*/g, ", ");
  const m = { ...message, call_opener: clean(message.call_opener), followup: clean(message.followup), linkedin_note: clean(message.linkedin_note), linkedin_dm: clean(message.linkedin_dm), email: { subject: clean(message.email?.subject), body: clean(message.email?.body) } };
  const issues = [];
  const all = `${m.email.subject} ${m.email.body} ${m.followup} ${m.linkedin_note} ${m.linkedin_dm} ${m.call_opener}`.toLowerCase();
  for (const phrase of BANNED) if (all.includes(phrase)) issues.push(`Banned phrase: "${phrase}"`);
  // The sender is always the placeholder: present in the call opener, signing the email, and never replaced by a name.
  const named = `${m.call_opener}\n${m.email.body}`.match(/(?<![\w-])([A-Z][\w'’]*(?:-[A-Z][\w'’]*)*(?: [A-Z][\w'’]*(?:-[A-Z][\w'’]*)*){0,2}),? (?:here )?(?:at|with|from) Corgi\b/);
  if (named && !/^(Hi|Hello|Hey|Team|Us|Me|Everyone|People|Folks|Here|Carrier)$/.test(named[1])) issues.push(`Introduces "${named[1]}" as the Corgi rep. The sender should be [Your name].`);
  if (!/\[your name\]/i.test(m.call_opener)) issues.push("The call opener does not introduce the rep as [Your name].");
  if (!/\[your name\]\s*$/i.test(m.email.body)) issues.push("The email is not signed [Your name].");
  if (words(m.email.body) > 100) issues.push(`Email is ${words(m.email.body)} words (limit 90)`);
  if (m.linkedin_note.length > 280) issues.push(`LinkedIn note is ${m.linkedin_note.length} characters (limit 280)`);
  return { ...m, lint: issues };
}

// ---------- Trucking: no model needed ----------

async function truckingStages(account, sources, emit) {
  emit("signals", "running", "reading federal insurance filings");
  const { raw, ...result } = await insuranceSignal(account.usdot);
  await saveJson(account.slug, "raw/fmcsa.json", raw);
  const sig = result.signal;
  const fmcsa = { id: `S${sources.length + 1}`, kind: "fmcsa", url: result.sources[0], title: `Federal carrier record and insurance filings, USDOT ${account.usdot}`, date: new Date().toISOString().slice(0, 10),
    text: `${result.legalName}, ${result.location}. ${result.powerUnits} power units, ${result.drivers} drivers. USDOT status ${result.usdotStatus}. Liability insurer on file: ${result.currentInsurer}, policy start ${result.currentPolicyStart}.${sig?.coverageEnds ? ` Coverage end date filed: ${sig.coverageEnds}.` : ""}` };
  sources.push(fmcsa);

  // Ownership check: a subsidiary's parent usually buys the insurance.
  const parentNews = sources.filter((s) => s.kind === "news" && /\b(acquire[sd]?|acquisition|buys|bought|subsidiary|division of|parent company)\b/i.test(s.title));
  const signals = [];
  const rejected = [];
  let verdict;
  const end = sig?.coverageEnds ? longDate(sig.coverageEnds) : null;

  if (result.verdict === "disqualified") {
    verdict = { label: "Do not work", reason: result.disqualifiers.join("; ") };
    rejected.push({ candidate: "Insurance filing lookup", reason: `Disqualified: ${result.disqualifiers.join("; ")}.` });
  } else if (sig?.type === "coverage_end_date_no_replacement" && parentNews.length) {
    verdict = { label: "Rejected by research", reason: `Filings show coverage ending ${end} with no replacement, but news points to a parent company, which usually buys insurance for the group.` };
    rejected.push({ candidate: `Liability coverage end date ${end}, no replacement on file`, reason: `Possible parent company: "${parentNews[0].title}" (${parentNews[0].id}). Confirm ownership before any outreach.` });
  } else if (sig?.type === "coverage_end_date_no_replacement") {
    const reversed = sig.reversedNoticesOnThisPolicy;
    verdict = { label: reversed ? "Work it: moderate signal" : "Work it: strong signal", reason: `Liability coverage with ${sig.insurer} has a filed end date of ${end} (${sig.daysLeft} days) and no replacement is on file.${reversed ? ` ${reversed} earlier end dates on this policy were withdrawn, so it may be reinstated.` : ""}` };
    signals.push({
      headline: `Liability coverage ends ${end}; no replacement policy on file`,
      signal_id: reversed ? "truck_reversed" : "truck_end_date",
      maps_to: reversed ? "End date, no replacement, earlier notices reversed" : "End date, no replacement",
      strength: sig.strength, coverage: ["Auto liability", "Cargo"],
      quote: `Policy ${sig.policyNo} with ${sig.insurer}, effective ${sig.policyStart}, end date ${sig.coverageEnds}. No later liability filing on record.`,
      source_id: fmcsa.id, source_url: result.sources[2], date: fmcsa.date,
      how_to_use: reversed ? "Call. Ask whether the end date is still in motion; do not assert a deadline or a reason." : "Call today. Lead with the date and the public filing; never imply why the policy is ending.",
    });
    if (result.insurersSince2021.length >= 3) signals.push({ headline: `${result.insurersSince2021.length} liability insurers since 2021`, signal_id: "truck_churn", maps_to: "Supporting fact", strength: "weak", coverage: ["Auto liability"], quote: result.insurersSince2021.join("; "), source_id: fmcsa.id, source_url: result.sources[2], date: fmcsa.date, how_to_use: "Background only: suggests they shop on price (inference). Do not mention." });
  } else if (sig?.type === "already_replaced") {
    verdict = { label: "Skip this cycle", reason: `A new liability policy with ${sig.newInsurer} started ${sig.newPolicyStart}. Note that month for next year.` };
    rejected.push({ candidate: "Coverage end date", reason: "Already replaced: a newer policy is on file." });
  } else if (sig?.type === "renewal_anniversary_estimate" && sig.strength === "weak") {
    verdict = { label: "Weak timing signal", reason: `No end date on file. Estimated renewal ${longDate(sig.estimatedRenewal)} (${sig.daysLeft} days), assuming a 12-month term.` };
    signals.push({ headline: `Estimated renewal around ${longDate(sig.estimatedRenewal)}`, signal_id: "truck_renewal", maps_to: "Renewal estimate", strength: "weak", coverage: ["Auto liability", "Cargo"], quote: `Current liability policy with ${result.currentInsurer} started ${result.currentPolicyStart}.`, source_id: fmcsa.id, source_url: result.sources[1], date: fmcsa.date, how_to_use: "Frame as a guess, not a fact." });
  } else {
    verdict = { label: "No signal right now", reason: sig ? `No end date on file; estimated renewal is ${sig.daysLeft} days away.` : "No liability policy found in the current federal filings." };
  }
  emit("signals", "done", verdict.label);
  for (const x of signals) Object.assign(x, { found_by: signalById(x.signal_id)?.how.process, why_it_matters: signalById(x.signal_id)?.why });
  const checks = Object.fromEntries(signalsFor("trucking").map((d) => [d.id, signals.some((x) => x.signal_id === d.id) ? { status: "found", detail: signals.find((x) => x.signal_id === d.id).headline }
    : { status: "checked", detail: d.id === "truck_churn" ? `${result.insurersSince2021.length} insurer${result.insurersSince2021.length === 1 ? "" : "s"} since 2021` : sig?.type === "already_replaced" ? "A newer policy is already on file" : d.id === "truck_renewal" && sig?.daysLeft ? `Estimated renewal is ${sig.daysLeft} days away` : "Not the case in the current filings" }]));

  emit("people", "running");
  const people = result.officers.map((o, i) => ({ name: titleCase(o), title: "Company officer on the federal registration", role: i === 0 ? "Economic buyer (inference)" : "Influencer (inference)", why: "Fleet owners usually sign for insurance at this fleet size.", source_id: fmcsa.id, confidence: "medium", likely_reports: ["Safety director", "Dispatcher / operations lead"], phone: result.phone, phone_note: "Business line on the federal registration" }));
  emit("people", "done", `${people.length} found`);

  const lead = signals.find((s) => s.strength !== "weak" || s.maps_to === "Renewal estimate");
  const messages = lead && people[0] ? [lint(truckingDraft(people[0], lead, result, sig))] : [];
  emit("drafts", messages.length ? "done" : "skipped", messages.length ? "1 contact" : "no usable signal");

  const research = {
    one_liner: `For-hire trucking fleet based in ${titleCase(result.location.split(",")[0])},${result.location.split(",")[1]}.`,
    facts: [
      { label: "HQ", value: `${titleCase(result.location.split(",")[0])},${result.location.split(",")[1]}`, source_id: fmcsa.id },
      { label: "Fleet", value: `${result.powerUnits} power units, ${result.drivers} drivers`, source_id: fmcsa.id },
      { label: "Status", value: `USDOT ${result.usdotStatus}; operating authority ${result.authorityActive ? "active" : "not active"}`, source_id: fmcsa.id },
      result.phone && { label: "Phone", value: `${result.phone} (business line on the federal registration)`, source_id: fmcsa.id },
      { label: "Safety rating", value: result.safetyRating === "S" ? "Satisfactory" : result.safetyRating ?? "None on file", source_id: fmcsa.id },
      { label: "Current liability insurer", value: `${result.currentInsurer ?? "None on file"}${result.currentPolicyStart ? `, since ${result.currentPolicyStart}` : ""}`, source_id: fmcsa.id },
    ].filter(Boolean),
    priorities: [], timeline: [],
    fit: { verdict: result.verdict === "disqualified" || parentNews.length ? "not_a_fit" : "fit", reason: verdict.reason },
  };
  return { research, people: { people, empty_seats: ["Safety director", "Dispatcher", "Operations manager"] }, signals: { signals, rejected, bottom_line: verdict.reason }, messages, verdict,
    checks,
    notes: ["A replacement policy can be filed any day. Re-run this account on the day you reach out.", "The filings never say why a policy is ending. Do not state or imply a reason."] };
}

function truckingDraft(person, lead, result, sig) {
  const first = person.name.split(" ")[0];
  const filed = result.currentInsurer ?? "your insurer";
  const insurer = (filed === filed.toUpperCase() ? titleCase(filed) : filed).replace(/ (Company|Corporation|Inc)\.?$/i, "");
  if (lead.maps_to === "Renewal estimate") {
    const month = new Date(`${sig.estimatedRenewal}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    return { contact: person.name, title: person.title, signal_used: lead.headline, nurture: false,
      call_opener: `Hi ${first}, [Your name] at Corgi, we're a trucking insurance carrier. Your current policy with ${insurer} started in ${month} last year, so I'm guessing renewal is coming up around then. Who is quoting it?`,
      email: { subject: `${month.toLowerCase()} renewal`, body: `Hi ${first},\n\nYour federal filing shows your liability policy with ${insurer} started in ${month} last year, so I'm guessing renewal is close.\n\nCorgi is a licensed insurance carrier writing auto liability and cargo for fleets directly. If you are collecting quotes, can we add one?\n\n[Your name]` },
      followup: `Hi ${first}, following up on the ${month} renewal. If quotes are already in, I can still put ours next to them.\n\n[Your name]`,
      linkedin_note: `Hi ${first}, [Your name] at Corgi, a trucking insurance carrier. Looks like your liability renewal is around ${month}. Happy to quote if you are comparing.`,
      linkedin_dm: `Hi ${first}, your federal filing shows your ${insurer} policy started in ${month} last year. If you are comparing quotes for renewal, we write auto liability and cargo directly. Worth adding one?`,
      why: "Renewal month is an estimate from the filed policy start date, so every line is framed as a guess." };
  }
  const end = longDate(sig.coverageEnds);
  const short = new Date(`${sig.coverageEnds}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toLowerCase();
  const soft = sig.reversedNoticesOnThisPolicy > 0;
  return { contact: person.name, title: person.title, signal_used: lead.headline, nurture: false,
    call_opener: soft
      ? `Hi ${first}, [Your name] at Corgi, we're a trucking insurance carrier. I'm calling because your federal filing shows an end date of ${end} on your liability policy with ${insurer}. Is that still in motion, and is it worth us putting a quote next to it this week?`
      : `Hi ${first}, [Your name] at Corgi, we're a trucking insurance carrier. I'm calling because your federal filing shows your liability coverage with ${insurer} running through ${end}, and I don't see a new policy filed yet. Do you already have that handled, or is it worth us putting a quote next to it this week?`,
    email: { subject: soft ? `your ${short} filing` : `coverage through ${short}`,
      body: soft
        ? `Hi ${first},\n\nYour federal liability filing shows an end date of ${end} on the ${insurer} policy. Is that still in motion?\n\nCorgi is a licensed insurance carrier writing auto liability and cargo for fleets directly, with no broker in between. If you want a second number before ${end}, we can quote it this week.\n\nWorth a look?\n\n[Your name]`
        : `Hi ${first},\n\nYour federal liability filing shows coverage with ${insurer} running through ${end}, and no new policy is on file yet.\n\nCorgi is a licensed insurance carrier writing auto liability and cargo for fleets directly, with no broker in between. If the replacement is not locked in, we can put a quote next to it before ${end}.\n\nWorth a look this week?\n\n[Your name]` },
    followup: `Hi ${first}, the ${end} date on your filing is getting close. If a quote from a second carrier would help, I can turn one around this week.\n\n[Your name]`,
    linkedin_note: `Hi ${first}, [Your name] at Corgi, a trucking insurance carrier. Your federal filing shows a liability end date of ${end}. If the replacement isn't settled, happy to quote before then.`,
    linkedin_dm: `Hi ${first}, your federal liability filing shows an end date of ${end} with ${insurer}. We are a carrier writing auto liability and cargo for fleets directly. If the replacement isn't settled, want a quote before then?`,
    why: `Leads with the date from the public federal filing (${lead.source_id}), names where it was seen, and never says why the policy is ending. No proof line: Corgi has published no trucking customer or speed claim.` };
}

// ---------- The loop ----------

export async function runAccount(target, onEvent = () => {}) {
  const stages = [];
  const emit = (id, status, detail = "") => {
    const row = { id, status, detail };
    const i = stages.findIndex((s) => s.id === id);
    if (i >= 0) stages[i] = row; else stages.push(row);
    onEvent({ type: "stage", ...row });
  };

  emit("resolve", "running");
  let account = target;
  if (typeof target === "string") {
    const found = await locate(target);
    if (!found.account) throw new Error(`"${target}" could be ${found.candidates.map((c) => c.domain).join(" or ")}. Run it with the domain.`);
    account = found.account;
  }
  emit("resolve", "done", `${account.name}${account.domain ? ` · ${account.domain}` : ""} · ${account.segment}`);

  emit("collect", "running");
  const { sources, roles } = await collect(account);
  // Startups: run every signal's own fetcher (job feed, SEC filings, federal contracts, targeted news).
  const found = account.segment === "trucking" ? null : await collectSignals(account, roles, sources);
  const kinds = sources.reduce((acc, s) => ((acc[s.kind] = (acc[s.kind] ?? 0) + 1), acc), {});
  emit("collect", "done", `${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing found"}${found ? ` · ${Object.keys(found.checks).length} signal checks` : ""}`);

  const llm = await llmConfig();
  let out;
  if (account.segment === "trucking") out = await truckingStages(account, sources, emit);
  else if (llm) {
    out = await modelStages(account, sources, emit, found);
    const top = out.signals.signals.find((x) => x.strength !== "weak");
    out.verdict = out.research.fit?.verdict === "not_a_fit" ? { label: "Not a fit", reason: out.research.fit.reason }
      // A signal does not make an account workable if we could not confirm it is a company Corgi can insure.
      : out.research.fit?.verdict === "unclear" ? { label: "Check fit first", reason: `${out.research.fit.reason}${top ? ` Signal found: ${top.headline}.` : ""}` }
      : top ? { label: `Work it: ${top.strength} signal`, reason: top.headline }
      // Stated by code, not by the model: what was checked and what happened to the candidates.
      : { label: "No signal right now", reason: `Nothing recent enough to be a reason to call. ${Object.keys(out.checks ?? {}).length} signals were checked${out.signals.rejected.length ? ` and ${out.signals.rejected.length} candidate${out.signals.rejected.length > 1 ? "s were" : " was"} rejected` : ""}${out.signals.signals.length ? `; ${out.signals.signals.length} weak one${out.signals.signals.length > 1 ? "s" : ""} can support a message but not lead it` : ""}. Nurture.` };
    out.notes = ["People and titles come from public pages and search snippets. Confirm each person still works there before sending."];
  } else {
    for (const id of ["research", "people", "signals", "drafts"]) emit(id, "skipped", "no model connected");
    const jobs = sources.find((s) => s.kind === "jobs");
    out = {
      research: { one_liner: sources.find((s) => s.kind === "page")?.title ?? "", priorities: [], timeline: sources.filter((s) => s.kind === "news" || s.kind === "sec").map((s) => ({ date: s.date, event: s.title, source_id: s.id })).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
        facts: [jobs && { label: "Open roles", value: `${jobs.data.total}. Top locations: ${jobs.data.byLocation.slice(0, 5).map(([k, n]) => `${k} (${n})`).join(", ")}`, source_id: jobs.id },
          ...sources.filter((s) => s.kind === "sec").slice(0, 2).map((s) => ({ label: "SEC filing", value: s.text, source_id: s.id }))].filter(Boolean), fit: { verdict: "unclear", reason: "" } },
      people: { people: [], empty_seats: [] }, signals: { signals: [], rejected: [], bottom_line: "" }, messages: [],
      verdict: { label: "Evidence collected, not analyzed", reason: "No model is connected, so research, signals and drafts were skipped. Add a model key to .env and run again." }, notes: [],
    };
  }

  // Public profile link when one of the sources is that person's LinkedIn page; otherwise a ready-made LinkedIn search.
  const linkedinSearch = (terms) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(terms)}`;
  out.people.people = (out.people.people ?? []).map((p) => {
    const first = norm(p.name).split(" ")[0], last = norm(p.name).split(" ").at(-1);
    const profile = sources.find((s) => /linkedin\.com\/in\//.test(s.url) && norm(s.title + " " + s.text.slice(0, 200)).includes(first) && norm(s.title + " " + s.text.slice(0, 200)).includes(last));
    return { ...p, profile_url: profile?.url ?? null, find_url: linkedinSearch(`${p.name} ${account.name}`) };
  });
  const personasToFind = (out.people.empty_seats ?? []).map((role) => ({ role, find_url: linkedinSearch(`${role} ${account.name}`) }));

  // Free Apollo search for the other buyers (finance, ops, legal, people, security). Names stay partly hidden until revealed.
  let apolloContacts;
  if (apollo.connected() && account.domain && account.segment !== "trucking") {
    const known = new Set(out.people.people.map((p) => norm(p.name).split(" ")[0]));
    apolloContacts = await apollo.searchContacts(account.domain).then((list) => list.filter((c) => !known.has(norm(c.first_name ?? ""))), () => undefined);
  }

  await saveJson(account.slug, "sources.json", sources);
  const brief = { account, ranAt: new Date().toISOString(), model: llm && account.segment !== "trucking" ? `${llm.provider} · ${llm.model}` : null, stages,
    verdict: out.verdict, research: out.research, people: out.people.people ?? [], personasToFind, apolloContacts,
    signalChecks: signalsFor(account.segment).map((d) => ({ id: d.id, name: d.name, priority: d.priority, ...((out.checks ?? found?.checks ?? {})[d.id] ?? { status: "checked", detail: "" }) })),
    proof: out.proof ?? [], signals: out.signals.signals, rejected: out.signals.rejected, bottomLine: out.signals.bottom_line, messages: out.messages, notes: out.notes ?? [] };
  await saveJson(account.slug, "brief.json", brief);
  onEvent({ type: "done", slug: account.slug });
  return brief;
}

// Follow-up questions about a finished run.
export async function ask(slug, question) {
  const brief = await loadJson(slug, "brief.json");
  if (!brief) return "I don't have a run for that account yet.";
  if (!(await llmConfig())) {
    const skipped = brief.stages.some((s) => s.status === "skipped" && s.detail === "no model connected");
    return skipped
      ? `No model is connected, so I only did the part that needs none: I collected the evidence (see the Sources tab). Reading it to find signals, people and messages is the model's job, and that step was skipped. Add one model key to .env (a free Gemini key works), restart, and run ${brief.account.name} again.`
      : `${brief.verdict.label}: ${brief.verdict.reason} For anything beyond what is on the page, connect a model: add one key to .env and restart.`;
  }
  return chat({
    system: `You help a Corgi sales rep with one account. Answer from the run data only; if it is not there, say so. When asked to rewrite a message, follow the voice rules and return plain text.\n\n# Voice rules\n${await readContext("voice.md")}\n\n# Corgi positioning\n${await readContext("positioning.md")}`,
    user: `# Run data\n${JSON.stringify({ ...brief, stages: undefined })}\n\n# Rep's question\n${question}`,
  });
}

// Decides what a chat message is asking for. Uses the model when one is connected.
export async function route(message, open, runs) {
  const text = message.trim();
  if (/^(re-?run|refresh|run (?:it |this )?again|redo)(?: (?:it|this|this account|the account))?[.!]?$/i.test(text))
    return open ? { action: "run", account: open.account.usdot ? `usdot ${open.account.usdot}` : open.account.domain, force: true } : { action: "say", text: "Open an account first, then I can re-run it." };
  const command = text.match(/^(re-?run|refresh|run|research|prep|look up|message (?:the )?key contacts at)\s+(.+)$/i);
  if (command) return { action: "run", account: command[2].replace(/[?.!]+$/, ""), force: /^re|^refresh/i.test(command[1]) };
  if (/^(usdot\s*#?\s*)?\d{4,8}$/i.test(text) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\/?$/i.test(text)) return { action: "run", account: text };
  if (!(await llmConfig())) return !open && text.split(/\s+/).length <= 5 ? { action: "run", account: text } : { action: "answer" };
  try {
    const r = await chatJson({
      system: `You route messages in a sales account-research app. Reply with JSON: {"action": "run"|"open"|"revise"|"answer", "account": string|null}.
- "run": the rep names a company to research that is not in the saved list (also "what about X?", or just a company name).
- "open": the rep names a company that IS in the saved list. "account" = its exact saved name.
- "revise": the rep wants the drafted messages for the open account changed (shorter, different tone, different contact, different angle).
- "answer": any other question about the open account.
If no account is open and the message is not about a company, use "answer".`,
      user: `Saved accounts: ${runs.map((x) => x.name).join(", ") || "none"}\nOpen account: ${open?.account.name ?? "none"}\nMessage: ${text}`,
    });
    // The model sometimes names the action but leaves the account empty; the message itself is the best guess then.
    const account = r.account || text.replace(/^(what|how) about\s+/i, "").replace(/[?.!]+$/, "");
    if (r.action === "answer" && !open && text.split(/\s+/).length <= 4) return { action: "run", account };
    if (["run", "open", "revise", "answer"].includes(r.action)) return { ...r, account };
  } catch {}
  return { action: "answer" };
}

// Rewrites the drafts for an open run and saves them, so the brief on screen updates.
export async function revise(slug, instruction) {
  const brief = await loadJson(slug, "brief.json");
  if (!brief) throw new Error("Open an account first.");
  const r = await chatJson({
    system: `You revise outreach drafts for a Corgi sales rep. Follow the voice rules and use only Corgi claims from section 6 of the positioning. Facts about the account may only come from the run data. Keep "[Your name]" as the signature. Plain text, no markdown.
Reply with JSON: {"messages": [{"contact": string, "title": string, "signal_used": string|null, "proof_used": string|null (the customer story named in the message, if any), "nurture": boolean, "call_opener": string, "email": {"subject": string, "body": string}, "followup": string, "linkedin_note": string, "linkedin_dm": string, "why": string}], "summary": string (one sentence saying what you changed)}
The call opener introduces the rep as "[Your name]" and every email ends with "[Your name]"; never put a real name there.
Customer stories: use only the ones under "customer_stories_allowed_as_proof", and say nothing about a customer beyond those fields. A fact about the prospect (its funding round, its launch) is never a fact about the customer.
Numbers and timeframes: copy them exactly. A range stays a range ("60 to 90 days", never "sixty days"); "about two minutes" keeps "about".
Return every message, changed or not. To write for a different contact, pick them from the people list.

# Voice rules
${await readContext("voice.md")}

# Corgi positioning
${await readContext("positioning.md")}`,
    user: `${await repRules()}# Run data\n${JSON.stringify({ account: brief.account, research: brief.research, people: brief.people, signals: brief.signals, customer_stories_allowed_as_proof: (brief.proof ?? []).map(storyFacts), messages: brief.messages.map(({ lint: _, ...m }) => m) })}\n\n# What the rep wants\n${instruction}`,
  });
  const checks = { signals: brief.signals, proof: brief.proof ?? [], library: await customerStories(), account: brief.account, research: brief.research, people: brief.people, facts: `${await positioningFacts()}\n${signalsText()}` };
  brief.messages = (r.messages ?? []).map(fixSender).map(lint).map((m) => claimChecks(m, checks));
  brief.revisedAt = new Date().toISOString();
  await saveJson(slug, "brief.json", brief);
  return r.summary ?? "Drafts updated.";
}
