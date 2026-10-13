// The signal registry: every reason-to-call the agent looks for, why it matters, and exactly how it is fetched.
// It is fixed in code on purpose. A longer list means more noise for reps, so signals are not editable in the app.
// The same list drives the fetchers below, the model's rubric, the checks on each run, and the "How signals work" page.
import { news } from "./tools/web.mjs";
import { formD } from "./tools/edgar.mjs";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (date) => (date && !Number.isNaN(Date.parse(date)) ? Math.round((Date.now() - Date.parse(date)) / 86_400_000) : null);

export const SIGNALS = [
  // ---------- Startups, in priority order ----------
  { id: "enterprise_push", segment: "startups", priority: 1, name: "Selling to bigger customers", window: "live or last 6 months", windowDays: 180, coverage: ["Tech E&O", "Cyber Liability", "General Liability"],
    what: "The company is moving upmarket: hiring enterprise sellers or compliance staff, publishing a security or trust page, or naming large customers.",
    why: "Enterprise procurement asks for a certificate of insurance before signing. This is usually the first hard insurance deadline a startup hits, and a deal is waiting on it.",
    how: { tools: ["Public job feeds (Ashby, Greenhouse, Lever)", "Company website"], process: "Reads every open role and flags enterprise-sales, solutions and compliance titles. Fetches the company's security, trust, customers and enterprise pages.", key: null },
    angle: "Enterprise customers ask for a certificate of insurance (Tech E&O and cyber) before they sign. Ask whether a deal is waiting on one." },
  { id: "funding", segment: "startups", priority: 1, name: "Priced funding round", window: "0–90 days", windowDays: 90, coverage: ["D&O", "Crime"],
    what: "A seed, Series A or later round closed in the last three months.",
    why: "Investors commonly require D&O within 60 to 90 days of close, and new board seats mean new personal liability.",
    how: { tools: ["SEC EDGAR full-text search (Form D)", "Google News"], process: "Looks up the company's Form D filings, which are due within 15 days of a first sale, and searches news for the round announcement.", key: null },
    angle: "Investors commonly require D&O within 60 to 90 days of close. Ask whether D&O is already in place for the new board." },
  { id: "hiring_states", segment: "startups", priority: 1, name: "Hiring across US states", window: "live job posts", windowDays: 30, coverage: ["Workers' Comp", "Employment Practices (EPL)"],
    what: "Open roles in several US states, or a company based abroad hiring its first US employees.",
    why: "Workers' comp is required state by state, from the first employee in each one. Headcount growth also raises employment-practices risk.",
    how: { tools: ["Public job feeds (Ashby, Greenhouse, Lever)", "The company's own careers page (read with Exa)"], process: "Reads the location of every open role and counts the distinct US states. If the company has no job board, its own careers page is read instead. For a company based abroad, one US role is enough.", key: null },
    angle: "Each new state with an employee needs workers' comp there. Ask whether coverage follows the hiring plan." },
  { id: "insurance_job", segment: "startups", priority: 1, name: "A job post that owns insurance", window: "live job posts", windowDays: 30, coverage: ["All lines"],
    what: "An open finance, operations, legal or people role whose description lists insurance, risk management or certificates of insurance.",
    why: "Nobody owns insurance yet, and the company is about to hand it to a new hire. Until then the founder or finance lead is the buyer.",
    how: { tools: ["Public job feeds (Ashby, Greenhouse, Lever)"], process: "Reads the full description of every open finance, operations, legal and people role and looks for insurance duties.", key: null },
    angle: "The company is hiring someone to own insurance. Offer to take it off the founder's plate before that hire starts." },
  { id: "new_leader", segment: "startups", priority: 2, name: "New finance, legal, people or security lead", window: "0–90 days", windowDays: 120, coverage: ["All lines"],
    what: "A CFO, head of finance, general counsel, head of people or security lead started in the last three months.",
    why: "New leaders review the vendors they inherit in their first months, and insurance sits with exactly these roles.",
    how: { tools: ["Exa search (public profiles)", "Google News"], process: "Finds each top contact's public profile and reads the start date of their current role. Searches news for appointment announcements.", key: "search" },
    angle: "New leaders review what they inherit. Ask what the insurance setup looks like, without congratulating them on a job you only read about." },
  { id: "ai_launch", segment: "startups", priority: 2, name: "AI product or agent launch", window: "0–6 months", windowDays: 180, coverage: ["AI Liability", "Tech E&O"],
    what: "The company launched an AI product, feature or agent in the last six months.",
    why: "AI output is a new kind of liability, and buyers now ask about it in security reviews.",
    how: { tools: ["Google News", "Company website"], process: "Searches news for launch announcements and reads the company's blog and product pages.", key: null },
    angle: "Customers ask how AI output is covered. Ask whether AI liability is part of their Tech E&O today." },
  { id: "public_contract", segment: "startups", priority: 2, name: "Federal contract award", window: "0–6 months", windowDays: 180, coverage: ["Tech E&O", "Cyber Liability", "General Liability"],
    what: "A US federal contract awarded to the company in the last six months.",
    why: "Government contracts carry insurance clauses with set minimums that must be met to start work.",
    how: { tools: ["USAspending.gov API"], process: "Searches federal contract awards by recipient name for the last six months.", key: null },
    angle: "Federal contracts set insurance minimums. Ask whether the current limits meet the contract. Confirm the recipient is this company first." },
  { id: "office", segment: "startups", priority: 2, name: "New office or lease", window: "0–6 months", windowDays: 180, coverage: ["General Liability", "Commercial Property"],
    what: "The company opened an office, moved headquarters or signed a lease.",
    why: "Landlords require general liability before handing over the keys.",
    how: { tools: ["Google News"], process: "Searches news for office openings, moves and leases.", key: null },
    angle: "Landlords require general liability before move-in. Ask whether the lease is waiting on a certificate." },
  { id: "mna", segment: "startups", priority: 2, name: "Acquisition, either side", window: "0–6 months", windowDays: 180, coverage: ["Representations & Warranties", "D&O"],
    what: "The company bought another company or is being acquired.",
    why: "Diligence checks coverage, and deals use representations and warranties insurance.",
    how: { tools: ["Google News"], process: "Searches news for acquisition and merger announcements.", key: null },
    angle: "Deals bring diligence on coverage. Ask whether the acquisition changed what they need insured." },
  { id: "board", segment: "startups", priority: 3, name: "New board member", window: "0–90 days", windowDays: 120, coverage: ["D&O"],
    what: "A new director or independent board member was announced.",
    why: "A new director carries personal liability and often asks for D&O before joining.",
    how: { tools: ["Google News"], process: "Searches news for board appointments.", key: null },
    angle: "New directors ask about D&O. Ask whether the policy was reviewed when the board changed." },
  { id: "exec_post", segment: "startups", priority: 3, name: "A leader's own public post", window: "0–90 days", windowDays: 90, coverage: ["Varies"],
    what: "A top contact posted publicly about the raise, a big deal, a compliance push, hiring or broker pain.",
    why: "It is the most personal opener available: something that person chose to say in public.",
    how: { tools: ["Exa search (public posts and interviews)"], process: "Runs one search per top contact for their recent public posts, interviews and announcements, and keeps only results that name both the person and the company.", key: "search" },
    angle: "Open with what they said and where, then connect it to the insurance requirement it creates." },
  { id: "renewal", segment: "startups", priority: 3, name: "Renewal window", window: "10–11 months after a round", windowDays: 400, coverage: ["All lines"],
    what: "A funding round closed ten to eleven months ago.",
    why: "Policies bought at a raise renew a year later. This is an estimate, so it supports a message and never leads one.",
    how: { tools: ["SEC EDGAR full-text search (Form D)"], process: "Takes the filing date of the last Form D and adds ten to eleven months.", key: null },
    angle: "Frame it as a guess: policies bought at the last round are probably up for renewal." },
  // ---------- Trucking ----------
  { id: "truck_end_date", segment: "trucking", priority: 1, name: "Coverage end date, no replacement", window: "end date in the future", windowDays: 60, coverage: ["Auto Liability", "Cargo"],
    what: "The carrier's liability policy has an end date on file with the federal regulator, and no newer policy has been filed.",
    why: "Carriers must keep liability insurance on file to operate. A public end date is a dated deadline to buy.",
    how: { tools: ["FMCSA open data (data.transportation.gov)"], process: "Reads the carrier's active policies and ended-or-ending policies, and checks whether a later filing replaces the ending one.", key: null },
    angle: "Lead with the date and the public filing. Never say or imply why the policy is ending." },
  { id: "truck_reversed", segment: "trucking", priority: 2, name: "End date filed before and withdrawn", window: "end date in the future", windowDays: 60, coverage: ["Auto Liability", "Cargo"],
    what: "Same as above, but earlier end dates on this policy were filed and then withdrawn.",
    why: "The deadline is real but may be reversed again, so the rep asks and does not assert.",
    how: { tools: ["FMCSA open data (data.transportation.gov)"], process: "Counts earlier cancellation filings against the policy that is still active.", key: null },
    angle: "Ask whether the end date is still in motion." },
  { id: "truck_renewal", segment: "trucking", priority: 3, name: "Renewal estimate", window: "within 90 days", windowDays: 90, coverage: ["Auto Liability", "Cargo"],
    what: "No end date on file; the current policy started about a year ago.",
    why: "Most policies run twelve months. It is an estimate, so it supports a call and is framed as a guess.",
    how: { tools: ["FMCSA open data (data.transportation.gov)"], process: "Adds twelve months to the start date of the current policy.", key: null },
    angle: "Frame it as a guess about their renewal month." },
  { id: "truck_churn", segment: "trucking", priority: 3, name: "Frequent insurer changes", window: "since 2021", windowDays: 2000, coverage: ["Auto Liability"],
    what: "Three or more liability insurers since 2021.",
    why: "Suggests the carrier shops on price. Background for the rep, never mentioned to the prospect.",
    how: { tools: ["FMCSA open data (data.transportation.gov)"], process: "Counts distinct insurers across the carrier's current and past filings.", key: null },
    angle: "Background only. Do not mention it." },
];

export const BASIS = [
  { claim: "D&O is commonly required within 60 to 90 days of a priced round", url: "https://beancount.io/blog/2026/05/10/directors-officers-d-and-o-insurance-startups-2026-coverage-limits-premium-benchmarks-investors-guide" },
  { claim: "The first hard insurance milestone is usually a customer contract, not a funding round", url: "https://www.vouch.us/blog/when-does-my-startup-need-insurance" },
  { claim: "Carriers must keep insurance on file and insurers give 30 days' notice of cancellation", url: "https://www.law.cornell.edu/cfr/text/49/387.313" },
  { claim: "Corgi's own customer stories are about enterprise contracts, security reviews and renewals", url: "https://www.corgi.insure/customers" },
];

export const signalById = (id) => SIGNALS.find((s) => s.id === id);
export const signalsFor = (segment) => SIGNALS.filter((s) => s.segment === segment);

// The rubric the model scores against, and the text the number checks treat as allowed.
export const rubric = (segment) => signalsFor(segment).map((s) => `- ${s.id}: ${s.name} (${s.window}). ${s.what} Coverage: ${s.coverage.join(", ")}.`).join("\n");
export const signalsText = () => SIGNALS.map((s) => `${s.name}. ${s.what} ${s.why} ${s.angle} ${s.window}`).join("\n");

const US_STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia" };
const CITY_STATE = { "san francisco": "CA", "los angeles": "CA", "new york": "NY", "nyc": "NY", boston: "MA", seattle: "WA", austin: "TX", dallas: "TX", houston: "TX", chicago: "IL", denver: "CO", miami: "FL", atlanta: "GA", "salt lake city": "UT", phoenix: "AZ", philadelphia: "PA", columbus: "OH" };

export function usStates(location) {
  const found = new Set();
  const text = String(location ?? "");
  for (const [, code] of text.matchAll(/,\s*([A-Z]{2})\b/g)) if (US_STATES[code]) found.add(code);
  for (const [code, name] of Object.entries(US_STATES)) if (new RegExp(`\\b${name}\\b`, "i").test(text) && !(code === "WA" && /Washington,? D\.?C/i.test(text))) found.add(code);
  for (const [city, code] of Object.entries(CITY_STATE)) if (new RegExp(`\\b${city}\\b`, "i").test(text)) found.add(code);
  return [...found];
}

const ENTERPRISE_ROLE = /\b(enterprise (account executive|sales|ae)|strategic account|solutions? engineer|sales engineer|deal desk|security (compliance|grc)|grc (analyst|manager|lead|specialist)|compliance (manager|lead|analyst|officer)|head of security|trust (and|&) (safety|security))/i;
const OWNER_ROLE = /\b(finance|financial|controller|cfo|operations|bizops|chief of staff|legal|counsel|head of people|people ops|hr\b|human resources|office manager)\b/i;
// Duties, not perks: "insurance program", "certificates of insurance", "D&O". Benefit lines ("medical insurance coverage") are excluded below.
const INSURANCE_DUTY = /\b((business|corporate|commercial|company) insurance|insurance (policies|program|renewals?|brokers?|carriers?|portfolio|placement)|certificates? of insurance|\bCOIs?\b|D&O|directors (and|&) officers|workers'? comp(ensation)? (insurance|coverage|polic))/i;
const BENEFIT = /\b(medical|dental|vision|health|life|disability|pet|benefits?|401|stipend|wellness)\b/i;
const dutySentence = (description) => String(description ?? "").split(/(?<=[.;!?])\s+|\s[-•·]\s/).find((x) => INSURANCE_DUTY.test(x) && !BENEFIT.test(x));

// One fetcher per signal. Each adds the evidence it finds to `sources` and returns ready-made signals where
// code alone can decide (a filing, a job post), leaving judgment calls (was this headline a launch?) to the model.
export async function collectSignals(account, roles, sources) {
  const name = account.name.replace(/\b(LLC|INC|Corp|Corporation)\b\.?/gi, "").trim();
  const candidates = [];
  const checks = {};
  const seenUrl = new Set(sources.map((s) => s.url));
  const add = (kind, s) => {
    const src = { id: `S${sources.length + 1}`, kind, date: null, ...s };
    sources.push(src);
    seenUrl.add(src.url);
    return src;
  };
  const candidate = (id, c) => {
    const def = signalById(id);
    candidates.push({ signal_id: id, maps_to: def.name, coverage: def.coverage, person: null, detected_by: "code", ...c });
  };
  // News search for one signal: recent, and clearly about this company.
  const headlines = async (id, query, limit = 4) => {
    const def = signalById(id);
    const items = (await news(`"${name}" ${query}`, 12)).filter((i) => norm(i.title).includes(norm(name)) && (daysAgo(i.date) ?? 9999) <= Math.max(def.windowDays, 180) && !seenUrl.has(i.url));
    for (const i of items.slice(0, limit)) add("news", { url: i.url, title: i.title, date: i.date, signal: id, text: `${i.title}. ${i.snippet}` });
    checks[id] = { status: "checked", detail: items.length ? `${Math.min(items.length, limit)} recent headline${items.length > 1 ? "s" : ""} to read` : "No recent headlines" };
  };

  let usRoles = null;
  const jobChecks = () => {
    const jobs = roles?.jobs ?? [];
    if (!roles) {
      for (const id of ["enterprise_push", "hiring_states", "insurance_job"]) checks[id] = { status: "checked", detail: "No job board or readable careers page found" };
      return;
    }
    const board = { url: roles.boardUrl, date: today() };
    // Selling to bigger customers: who they are hiring
    const ent = jobs.filter((j) => ENTERPRISE_ROLE.test(j.title ?? ""));
    if (ent.length) {
      const titles = [...new Set(ent.map((j) => j.title))].slice(0, 6).join("; ");
      const src = add("jobs", { ...board, title: `${ent.length} enterprise-sales or compliance roles open`, signal: "enterprise_push", text: `Open roles on ${roles.provider} that point to selling to larger customers: ${titles}.` });
      candidate("enterprise_push", { headline: `Hiring ${ent.length} enterprise-sales or compliance role${ent.length > 1 ? "s" : ""}`, strength: ent.length >= 3 ? "strong" : "moderate", quote: `Open roles on ${roles.provider} that point to selling to larger customers: ${titles}.`, source_id: src.id, date: today(), how_to_use: signalById("enterprise_push").angle });
    }
    checks.enterprise_push = { status: ent.length ? "found" : "checked", detail: ent.length ? `${ent.length} matching open roles` : `${jobs.length} open roles read, none enterprise-sales or compliance` };
    // Hiring across states
    const perState = {};
    for (const j of jobs) for (const st of usStates(j.location)) perState[st] = (perState[st] ?? 0) + 1;
    const states = Object.entries(perState).sort((a, b) => b[1] - a[1]);
    if (states.length >= 3) {
      const list = states.slice(0, 8).map(([st, n]) => `${st} (${n})`).join(", ");
      const src = add("jobs", { ...board, title: `Open roles in ${states.length} US states`, signal: "hiring_states", text: `${jobs.length} open roles on ${roles.provider}. Roles located in ${states.length} US states: ${list}.` });
      candidate("hiring_states", { headline: `Open roles in ${states.length} US states`, strength: states.length >= 5 ? "strong" : "moderate", quote: `Roles located in ${states.length} US states: ${list}.`, source_id: src.id, date: today(), how_to_use: signalById("hiring_states").angle });
    }
    checks.hiring_states = { status: states.length >= 3 ? "found" : "checked", detail: `${jobs.length} open roles in ${states.length} US state${states.length === 1 ? "" : "s"}` };
    // Kept for the "first US hires" check, which needs to know where the company is based (decided after research).
    const inUS = jobs.filter((j) => usStates(j.location).length);
    if (states.length && states.length < 3) {
      const titles = `Open roles located in the US on ${roles.provider}: ${inUS.slice(0, 6).map((j) => `${j.title} (${j.location})`).join("; ")}.`;
      usRoles = { states: states.map(([st]) => st), titles, source_id: add("jobs", { ...board, title: `${inUS.length} open role${inUS.length > 1 ? "s" : ""} located in the US`, signal: "hiring_states", text: titles }).id };
    }
    // A job post that owns insurance
    const owners = jobs.filter((j) => OWNER_ROLE.test(j.title ?? "") && dutySentence(j.description));
    for (const j of owners.slice(0, 2)) {
      const duty = dutySentence(j.description).replace(/\s+/g, " ").trim().slice(0, 260);
      const src = add("jobs", { url: j.url ?? roles.boardUrl, date: j.published ?? today(), title: `Open role: ${j.title}`, signal: "insurance_job", text: `Open role: ${j.title}. From the job description: ${duty}` });
      candidate("insurance_job", { headline: `Hiring a ${j.title} whose duties include insurance`, strength: "strong", quote: duty, source_id: src.id, date: j.published ?? today(), how_to_use: signalById("insurance_job").angle });
    }
    checks.insurance_job = { status: owners.length ? "found" : "checked", detail: owners.length ? `${owners.length} role${owners.length > 1 ? "s" : ""} list insurance duties` : `${jobs.filter((j) => OWNER_ROLE.test(j.title ?? "")).length} finance, ops, legal and people roles read, none mention insurance` };
  };

  const filings = async () => {
    const list = await formD(name);
    const fresh = list.find((f) => (daysAgo(f.filed) ?? 9999) <= 90);
    const src = (f) => sources.find((s) => s.kind === "sec" && s.date === f.filed) ?? add("sec", { url: f.url, title: `SEC Form ${f.form} filed by ${f.issuer}`, date: f.filed, signal: "funding", text: `SEC Form ${f.form} (notice of a private securities offering) filed ${f.filed} by ${f.issuer}.` });
    if (fresh) candidate("funding", { headline: `Filed an SEC Form D on ${fresh.filed}`, strength: "strong", quote: `SEC Form ${fresh.form} (notice of a private securities offering) filed ${fresh.filed} by ${fresh.issuer}`, source_id: src(fresh).id, date: fresh.filed, how_to_use: signalById("funding").angle });
    const anniversary = list.find((f) => { const d = daysAgo(f.filed); return d !== null && d >= 300 && d <= 340; });
    if (anniversary) candidate("renewal", { headline: `Likely renewal window: last round filed ${anniversary.filed}`, strength: "weak", quote: `SEC Form ${anniversary.form} (notice of a private securities offering) filed ${anniversary.filed} by ${anniversary.issuer}`, source_id: src(anniversary).id, date: today(), how_to_use: signalById("renewal").angle });
    checks.renewal = { status: anniversary ? "found" : "checked", detail: list.length ? `Last Form D filed ${list[0].filed}` : "No Form D on file" };
    return { fresh, count: list.length };
  };

  const contracts = async () => {
    const start = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
    try {
      const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ filters: { recipient_search_text: [name], award_type_codes: ["A", "B", "C", "D"], time_period: [{ start_date: start, end_date: today() }] }, fields: ["Award ID", "Recipient Name", "Award Amount", "Start Date", "Awarding Agency", "Description"], limit: 5, sort: "Start Date", order: "desc" }) });
      // The API matches loosely, so keep only recipients whose name is this company's name, optionally followed by Inc, LLC and the like.
      const hits = ((await res.json()).results ?? []).filter((r) => (norm(r["Recipient Name"]) === norm(name) || norm(r["Recipient Name"]).startsWith(`${norm(name)} `)) && (daysAgo(r["Start Date"]) ?? 9999) <= 180);
      if (hits[0]) {
        const r = hits[0];
        const text = `Federal contract ${r["Award ID"]} awarded to ${r["Recipient Name"]} by the ${r["Awarding Agency"]}, $${Math.round(r["Award Amount"]).toLocaleString("en-US")}, starting ${r["Start Date"]}. ${String(r.Description ?? "").slice(0, 200)}`;
        const src = add("contract", { url: `https://www.usaspending.gov/award/${r.generated_internal_id}`, title: `Federal contract: ${r["Awarding Agency"]}`, date: r["Start Date"], signal: "public_contract", text });
        candidate("public_contract", { headline: `Federal contract from the ${r["Awarding Agency"]}, starting ${r["Start Date"]}`, strength: "moderate", quote: `Federal contract ${r["Award ID"]} awarded to ${r["Recipient Name"]} by the ${r["Awarding Agency"]}`, source_id: src.id, date: r["Start Date"], how_to_use: signalById("public_contract").angle });
      }
      checks.public_contract = { status: hits.length ? "found" : "checked", detail: hits.length ? `${hits.length} award${hits.length > 1 ? "s" : ""} in the last 6 months` : "No federal awards in the last 6 months" };
    } catch {
      checks.public_contract = { status: "error", detail: "USAspending did not respond" };
    }
  };

  jobChecks();
  const [filed] = await Promise.all([
    filings(), contracts(),
    headlines("funding", "raises OR funding OR \"series\" OR seed"),
    headlines("ai_launch", "launches OR launch OR unveils OR introduces AI"),
    headlines("office", "\"new office\" OR \"opens office\" OR headquarters OR lease"),
    headlines("mna", "acquires OR acquired OR acquisition OR merger"),
    headlines("board", "\"board of directors\" OR \"joins the board\" OR \"board member\""),
    headlines("new_leader", "appoints OR names OR hires CFO OR \"general counsel\" OR \"head of people\" OR CISO"),
  ]);
  if (filed.fresh) checks.funding = { status: "found", detail: `Form D filed ${filed.fresh.filed}` };
  else checks.funding.detail = `${filed.count ? "No Form D in the last 90 days" : "No Form D on file"}; ${checks.funding.detail.toLowerCase()}`;
  const needsExa = !process.env.EXA_API_KEY;
  checks.exec_post = needsExa ? { status: "needs_key", detail: "Needs Exa search" } : { status: "checked", detail: "Searched after the buyers were found" };
  if (needsExa) checks.new_leader = { ...checks.new_leader, detail: `${checks.new_leader.detail}; start dates need Exa search` };
  return { candidates, checks, usRoles };
}
