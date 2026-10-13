// Open roles from public job-board feeds (Ashby, Greenhouse, Lever). No key.
// Each role carries its location, description and publish date, which the signal checks read.
const get = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};
const plain = (html) => String(html ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const FEEDS = [
  { provider: "Ashby", url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`, page: (s) => `https://jobs.ashbyhq.com/${s}`,
    parse: (d) => d?.jobs?.map((j) => ({ title: j.title?.trim(), department: j.department, location: [j.location, ...(j.secondaryLocations ?? []).map((x) => x.location)].filter(Boolean).join("; "), url: j.jobUrl, description: plain(j.descriptionPlain), published: day(j.publishedAt) })) },
  { provider: "Greenhouse", url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`, page: (s) => `https://boards.greenhouse.io/${s}`,
    parse: (d) => d?.jobs?.map((j) => ({ title: j.title?.trim(), department: j.departments?.[0]?.name ?? null, location: j.location?.name, url: j.absolute_url, description: plain(j.content), published: day(j.first_published ?? j.updated_at) })) },
  { provider: "Lever", url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`, page: (s) => `https://jobs.lever.co/${s}`,
    parse: (d) => (Array.isArray(d) ? d.map((j) => ({ title: j.text?.trim(), department: j.categories?.team, location: j.categories?.location, url: j.hostedUrl, description: plain(`${j.descriptionPlain ?? ""} ${j.additionalPlain ?? ""}`), published: day(j.createdAt) })) : null) },
];

export async function openRoles(slugCandidates) {
  for (const slug of [...new Set(slugCandidates.filter(Boolean))]) {
    const hits = await Promise.all(FEEDS.map(async (f) => ({ f, jobs: f.parse(await get(f.url(slug))) })));
    const hit = hits.find((h) => h.jobs?.length);
    if (!hit) continue;
    const count = (key) => Object.entries(hit.jobs.reduce((acc, j) => ((acc[j[key] ?? "Unspecified"] = (acc[j[key] ?? "Unspecified"] ?? 0) + 1), acc), {})).sort((a, b) => b[1] - a[1]);
    return { provider: hit.f.provider, boardUrl: hit.f.page(slug), total: hit.jobs.length, byLocation: count("location"), byDepartment: count("department"), jobs: hit.jobs };
  }
  return null;
}
