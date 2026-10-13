// Open roles for companies that list jobs on their own website instead of a job board (Ashby, Greenhouse, Lever).
// The careers page is read as text, the model lists the roles on it, and each role's own page is fetched for its description.
import { readPages } from "./web.mjs";
import { chatJson, llmConfig } from "../llm.mjs";

const slug = (s) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function careersRoles(domain, homeLinks = []) {
  if (!domain || !(await llmConfig())) return null;
  const origin = `https://${domain}`;
  const linked = homeLinks.map((l) => { try { return new URL(l, origin).href.split(/[?#]/)[0]; } catch { return null; } }).filter((u) => u && /\/(careers|jobs|join-us|work-with-us)\/?$/i.test(u));
  const candidates = [...new Set([...linked, `${origin}/careers`, `${origin}/jobs`])].slice(0, 3);
  const page = (await readPages(candidates, 8000)).find((p) => /\b(open (roles|positions)|careers?|join us|we're hiring|apply)\b/i.test(p.text));
  if (!page) return null;
  let listed;
  try {
    listed = (await chatJson({
      system: 'You read the text of a company careers page and list the open roles on it. Return {"roles": [{"title": string, "location": string, "department": string|null}]}. Include only roles the page lists as open. Copy each location exactly as written ("NYC or Lisbon"). If the page lists no roles, return {"roles": []}.',
      user: page.text,
    })).roles ?? [];
  } catch { return null; }
  // A role counts only if its title really appears on the page.
  const text = page.text.toLowerCase();
  const jobs = listed.filter((r) => r.title && text.includes(r.title.toLowerCase().slice(0, 24))).slice(0, 40).map((r) => ({ title: r.title.trim(), department: r.department ?? null, location: r.location ?? "", url: page.url, description: "", published: null }));
  if (!jobs.length) return null;
  // Role pages usually live at /careers/{role-name}; read up to eight for their descriptions.
  const guesses = jobs.slice(0, 8).map((j) => ({ j, url: `${page.url.replace(/\/$/, "")}/${slug(j.title)}` }));
  for (const p of await readPages(guesses.map((g) => g.url), 5000)) {
    const hit = guesses.find((g) => g.url.replace(/\/$/, "") === p.url.replace(/\/$/, ""));
    if (hit && p.text.toLowerCase().includes(hit.j.title.toLowerCase().slice(0, 20))) Object.assign(hit.j, { description: p.text, url: p.url });
  }
  const count = (key) => Object.entries(jobs.reduce((acc, j) => ((acc[j[key] || "Unspecified"] = (acc[j[key] || "Unspecified"] ?? 0) + 1), acc), {})).sort((a, b) => b[1] - a[1]);
  return { provider: "the company's careers page", boardUrl: page.url, total: jobs.length, byLocation: count("location"), byDepartment: count("department"), jobs };
}
