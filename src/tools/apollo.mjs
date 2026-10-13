// Apollo. Nothing here runs on its own: the search is free, and every call that spends
// credits is made only after the rep confirms the cost in the app (see /api/apollo/* in server.mjs).
const BASE = "https://api.apollo.io/api/v1";
const headers = () => ({ "X-Api-Key": process.env.APOLLO_API_KEY, "Content-Type": "application/json", "Cache-Control": "no-cache" });
// Apollo bills direct dials in mobile credits. The rate depends on the plan, so it is set in .env and shown to the rep before spending.
export const COST = { contacts: 0, email: 1, company: 1, phone: Number(process.env.APOLLO_PHONE_CREDITS) || 8 };
export const connected = () => Boolean(process.env.APOLLO_API_KEY);

async function call(path, init) {
  const res = await fetch(`${BASE}/${path}`, { ...init, headers: headers(), signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Apollo returned ${res.status}`);
  return body;
}

// Which buyer role a job title points to, most useful first. Mirrors the buyers table in positioning.md.
const ROLES = [
  [/\b(cfo|chief financial|finance|controller|accounting|fp&a|treasur)/i, "Runs the process", "Finance usually runs the insurance purchase and renewals."],
  [/\b(coo|chief operating|operations|chief of staff|bizops|business operations)/i, "Runs the process", "At companies without a finance lead, operations usually handles insurance."],
  [/\b(general counsel|legal|counsel|compliance)/i, "Influencer", "Legal reviews D&O and E&O terms and contract insurance clauses."],
  [/\b(people|hr|human resources|talent)/i, "Influencer", "People leaders own workers' comp and employment practices coverage."],
  [/\b(ciso|security|information technology|\bit\b)/i, "Influencer", "Security leads own cyber coverage and customer security reviews."],
  [/\b(cro|chief revenue|sales|revenue|partnerships|customer)/i, "Champion", "Sales feels it when a deal is blocked on a certificate of insurance."],
  [/\b(ceo|founder|president|owner)/i, "Economic buyer", "Founders sign for insurance at early-stage companies."],
];

// Free: people at the company who could matter in an insurance purchase. Apollo hides last names and emails
// until a contact is revealed. Two searches: by seniority, and by the functions that touch insurance.
export async function searchContacts(domain) {
  const base = { q_organization_domains_list: [domain], per_page: 25 };
  const searches = await Promise.all([
    call("mixed_people/api_search", { method: "POST", body: JSON.stringify({ ...base, person_seniorities: ["owner", "founder", "c_suite", "partner", "vp", "head", "director"] }) }),
    call("mixed_people/api_search", { method: "POST", body: JSON.stringify({ ...base, person_titles: ["finance", "controller", "operations", "chief of staff", "legal", "counsel", "people", "human resources", "security"] }) }).catch(() => ({})),
  ]);
  const seen = new Set();
  return searches.flatMap((r) => r.people ?? []).filter((p) => !seen.has(p.id) && seen.add(p.id)).map((p) => {
    const rank = ROLES.findIndex(([re]) => re.test(p.title ?? ""));
    return { id: p.id, first_name: p.first_name, last_name_hidden: p.last_name_obfuscated ?? "", title: p.title ?? "", has_email: Boolean(p.has_email), role: ROLES[rank]?.[1] ?? "Other", why: ROLES[rank]?.[2] ?? "", rank: rank < 0 ? 99 : rank };
  }).sort((x, y) => x.rank - y.rank).slice(0, 12);
}

// 1 credit: one person's work email (and name, title, LinkedIn). Never asks for personal emails or phone numbers.
export async function revealPerson(query) {
  const p = (await call("people/match", { method: "POST", body: JSON.stringify({ ...query, reveal_personal_emails: false, reveal_phone_number: false }) })).person;
  if (!p) return null;
  return { name: p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" "), title: p.title ?? "", email: p.email && !/email_not_unlocked/.test(p.email) ? p.email : null, email_status: p.email_status ?? null, linkedin_url: p.linkedin_url ?? null,
    // The company's main line comes back with the same lookup. Direct dials are a separate, pricier Apollo product (see README).
    company_phone: p.organization?.primary_phone?.number ?? p.organization?.phone ?? null };
}

// 1 credit: headcount, revenue and funding estimates for a company.
export async function companyFacts(domain) {
  const o = (await call(`organizations/enrich?domain=${encodeURIComponent(domain)}`, { method: "GET" })).organization;
  if (!o?.name) return null;
  return {
    name: o.name, url: o.linkedin_url || `https://${domain}`,
    facts: [
      o.estimated_num_employees && ["Headcount", `${o.estimated_num_employees} (Apollo estimate)`],
      o.annual_revenue_printed && ["Revenue", `$${o.annual_revenue_printed} a year (Apollo estimate)`],
      o.total_funding_printed && ["Total funding", `$${o.total_funding_printed} (Apollo estimate)`],
      o.latest_funding_stage && ["Latest round", `${o.latest_funding_stage}${o.latest_funding_round_date ? `, ${o.latest_funding_round_date.slice(0, 10)}` : ""} (Apollo)`],
      o.founded_year && ["Founded", `${o.founded_year} (Apollo)`],
    ].filter(Boolean),
  };
}

// Mobile credits: asks Apollo for one person's direct numbers. Apollo answers minutes later by calling webhookUrl,
// which must be a public HTTPS address (see PUBLIC_URL in .env).
export async function requestPhone(query, webhookUrl) {
  const p = (await call("people/match", { method: "POST", body: JSON.stringify({ ...query, reveal_personal_emails: false, reveal_phone_number: true, webhook_url: webhookUrl }) })).person;
  return p ? { id: p.id, company_phone: p.organization?.primary_phone?.number ?? p.organization?.phone ?? null } : null;
}

// Pulls the numbers out of Apollo's webhook call, whatever nesting it arrives in.
export function phonesFromWebhook(payload) {
  const people = payload?.people ?? payload?.matches ?? (payload?.person ? [payload.person] : []);
  return people.flatMap((p) => p.phone_numbers ?? []).map((n) => ({ number: n.sanitized_number ?? n.raw_number, type: n.type_cd ?? n.type ?? "phone" })).filter((n) => n.number);
}
