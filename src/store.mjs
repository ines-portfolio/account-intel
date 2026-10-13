// Run storage. Local mode keeps every run as files under runs/{slug}/.
// A Supabase adapter with the same four functions is the planned team mode.
import { mkdir, readFile, writeFile, readdir, appendFile, rm, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./env.mjs";

const RUNS = path.join(APP_ROOT, "runs");
const safe = (slug) => slug.replace(/[^a-z0-9._-]/gi, "");

export const slugify = (s) =>
  s.toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function saveJson(slug, name, data) {
  const file = path.join(RUNS, safe(slug), name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 1));
}

export async function loadJson(slug, name) {
  const file = path.join(RUNS, safe(slug), name);
  return existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : null;
}

export async function listRuns() {
  if (!existsSync(RUNS)) return [];
  const out = [];
  for (const dir of await readdir(RUNS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const brief = await loadJson(dir.name, "brief.json");
    if (brief) out.push({ slug: dir.name, name: brief.account.name, segment: brief.account.segment, ranAt: brief.ranAt, verdict: brief.verdict });
  }
  return out.sort((a, b) => b.ranAt.localeCompare(a.ranAt));
}

export async function loadRun(slug) {
  const [brief, sources] = await Promise.all([loadJson(slug, "brief.json"), loadJson(slug, "sources.json")]);
  return brief ? { ...brief, chat: (await loadJson(slug, "chat.json")) ?? [], sources: (sources ?? []).map(({ text, ...s }) => ({ ...s, excerpt: (text ?? "").slice(0, 400) })) } : null;
}

export async function readContext(name) {
  return readFile(path.join(APP_ROOT, "context", "corgi", name), "utf8");
}

export async function readSkill(name) {
  const raw = await readFile(path.join(APP_ROOT, ".claude", "skills", name, "SKILL.md"), "utf8");
  return raw.replace(/^---[\s\S]*?---\s*/, "");
}

export async function appendFeedback(entry) {
  await appendFile(path.join(APP_ROOT, "context", "corgi", "feedback.md"), entry);
}

// Each account keeps its own conversation next to its brief.
export async function appendChat(slug, items) {
  await saveJson(slug, "chat.json", [...((await loadJson(slug, "chat.json")) ?? []), ...items]);
}

export async function clearChat(slug) {
  await saveJson(slug, "chat.json", []);
}

export async function deleteRun(slug) {
  const dir = path.join(RUNS, safe(slug));
  if (!safe(slug) || path.dirname(dir) !== RUNS || !existsSync(path.join(dir, "brief.json"))) throw new Error("Run not found");
  await rm(dir, { recursive: true });
}

// Paid lookups are logged here so the app can show what has been spent.
const LEDGER = path.join(RUNS, "_credits.json");
export async function creditLog() {
  return existsSync(LEDGER) ? JSON.parse(await readFile(LEDGER, "utf8")) : [];
}
export async function logCredits(tool, credits, what) {
  await mkdir(RUNS, { recursive: true });
  await writeFile(LEDGER, JSON.stringify([...(await creditLog()), { at: new Date().toISOString(), tool, credits, what }], null, 1));
}

// Customer stories and the list of coverage lines, both read from the one positioning file.
export async function customerStories() {
  const text = await readContext("positioning.md");
  const table = text.slice(text.indexOf("### Customer stories")).split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Customer") && !l.startsWith("|---"));
  return table.map((row) => {
    const [customer, what, situation, result, quote, speaker, useWhen, source] = row.split("|").slice(1, -1).map((c) => c.trim());
    const [url, quoteUrl] = source.match(/https?:\/\/[^\s)]+/g) ?? [];
    return { customer, what, situation, result, quote: quote.replace(/^"|"$/g, ""), speaker, useWhen, url, quoteUrl: quoteUrl ?? url };
  }).filter((x) => x.customer && x.url);
}

// The positioning file without the customer-story rows: the numbers a draft may use besides the account's own data.
export async function positioningFacts() {
  return (await readContext("positioning.md")).split("\n").filter((l) => !/^\| (?!Customer)[^|]+\|.*corgi\.insure/.test(l)).join("\n");
}

export async function offeringsText() {
  const text = await readContext("positioning.md");
  return text.slice(text.indexOf("## 2. Offerings"), text.indexOf("## 3.")).toLowerCase();
}

// The lessons reps have saved, as short rules. Only the rule goes to the model: never the rejected draft itself,
// because a model shown a rejected draft tends to copy it.
export async function feedbackRules() {
  const entries = (await readContext("feedback.md")).split(/\n(?=### \d{4}-\d{2}-\d{2})/).slice(1);
  const field = (entry, name) => entry.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`))?.[1]?.trim() ?? "";
  const rules = entries.map((e) => {
    const how = field(e, "How to apply"), why = field(e, "Why");
    return /^avoid this in future drafts/i.test(how) || !how ? why : how;
  }).filter(Boolean);
  return [...new Set(rules)].slice(-12);
}

// ---------- Positioning, as the settings page sees it ----------
// The markdown file stays the single source of truth. These two functions read the parts a person edits most
// (one-liner, offerings, claims, customer stories) into simple lists and write them back in place.

const POSITIONING = path.join(APP_ROOT, "context", "corgi", "positioning.md");
const OFFER_LINE = /^\*\*([^*]+):\*\* (.+)$/;
const STORY_ROW = (l) => l.startsWith("| ") && !l.startsWith("| Customer") && !l.startsWith("|---");
const clean = (v) => String(v ?? "").replace(/[|\n\r]+/g, " ").replace(/\s+/g, " ").trim();

function parts(text) {
  const [head, ...rest] = text.split(/\n(?=## \d+\. )/);
  return { head, sections: rest.map((block) => ({ id: block.match(/^## (\d+)\./)[1], title: block.split("\n")[0].replace(/^## \d+\. /, ""), body: block.slice(block.indexOf("\n") + 1) })) };
}

export async function readPositioning() {
  const text = await readFile(POSITIONING, "utf8");
  const { head, sections } = parts(text);
  const sec = (id) => sections.find((x) => x.id === id)?.body ?? "";
  return {
    updated: head.match(/Last (?:edited in the app|verified against public sources): ([\d-]+)/g)?.at(-1)?.split(": ")[1] ?? null,
    oneLiner: sec("1").trim().split("\n\n")[0],
    offerings: sec("2").split("\n").map((l) => l.match(OFFER_LINE)).filter(Boolean).map(([, label, items]) => ({ label, items: items.replace(/\.$/, "").split(/\s·\s|,\s+/).map((x) => x.trim()).filter(Boolean) })),
    claims: (sec("6").split("\n").find((l) => l.startsWith("**Product claims")) ?? "").replace(/^\*\*[^*]+\*\*\s*/, "").replace(/\.$/, "").split(/\s·\s/).map((x) => x.trim()).filter(Boolean),
    stories: (await customerStories()).map(({ quoteUrl, ...x }) => ({ ...x, quoteUrl: quoteUrl === x.url ? "" : quoteUrl })),
    sections: sections.map(({ id, title, body }) => ({ id, title, text: body.trim() })),
  };
}

export async function savePositioning(patch) {
  const text = await readFile(POSITIONING, "utf8");
  const { head, sections } = parts(text);
  const sec = (id) => sections.find((x) => x.id === id);
  if (typeof patch.oneLiner === "string" && patch.oneLiner.trim()) {
    const paras = sec("1").body.trim().split("\n\n");
    paras[0] = patch.oneLiner.replace(/\s+/g, " ").trim();
    sec("1").body = `\n${paras.join("\n\n")}\n`;
  }
  if (Array.isArray(patch.offerings)) {
    const groups = patch.offerings.map((g) => ({ label: clean(g.label).replace(/[*:]/g, ""), items: (g.items ?? []).map(clean).filter(Boolean) })).filter((g) => g.label && g.items.length);
    if (!groups.length) throw new Error("Keep at least one offering.");
    const lines = sec("2").body.split("\n");
    const first = lines.findIndex((l) => OFFER_LINE.test(l)), last = lines.findLastIndex((l) => OFFER_LINE.test(l));
    lines.splice(first, last - first + 1, groups.map((g) => `**${g.label}:** ${g.items.join(", ")}.`).join("\n\n"));
    sec("2").body = lines.join("\n");
  }
  if (Array.isArray(patch.claims)) {
    const claims = patch.claims.map(clean).filter(Boolean);
    if (!claims.length) throw new Error("Keep at least one claim.");
    sec("6").body = sec("6").body.replace(/^\*\*Product claims[^\n]*$/m, `**Product claims (startup product):** ${claims.join(" · ")}.`);
  }
  if (Array.isArray(patch.stories)) {
    const rows = patch.stories.map((x) => {
      const row = Object.fromEntries(["customer", "what", "situation", "result", "quote", "speaker", "useWhen", "url", "quoteUrl"].map((k) => [k, clean(x[k])]));
      if (!row.customer || !row.result || !/^https?:\/\//.test(row.url)) throw new Error(`"${row.customer || "A story"}" needs a customer name, a result and a source link starting with https://.`);
      return `| ${row.customer} | ${row.what || "Not stated on Corgi's site"} | ${row.situation} | ${row.result.replace(/\.$/, "")} | "${row.quote.replace(/^["“]|["”]$/g, "")}" | ${row.speaker} | ${row.useWhen} | ${row.url}${row.quoteUrl && row.quoteUrl !== row.url ? ` (quote from ${row.quoteUrl})` : ""} |`;
    });
    const lines = sec("6").body.split("\n");
    const first = lines.findIndex(STORY_ROW), last = lines.findLastIndex(STORY_ROW);
    lines.splice(first, last - first + 1, ...rows);
    sec("6").body = lines.join("\n");
  }
  if (patch.section?.id && typeof patch.section.text === "string" && sec(patch.section.id)) {
    if (!patch.section.text.trim()) throw new Error("A section cannot be empty.");
    sec(patch.section.id).body = `\n${patch.section.text.trim()}\n`;
  }
  // Keep the previous version, so any edit made in the app can be undone by hand.
  const history = path.join(APP_ROOT, "context", "corgi", "history");
  await mkdir(history, { recursive: true });
  await copyFile(POSITIONING, path.join(history, `positioning_${new Date().toISOString().replace(/[:.]/g, "-")}.md`));
  const stamp = `Last edited in the app: ${new Date().toISOString().slice(0, 10)}.`;
  const newHead = /Last edited in the app: [\d-]+\./.test(head) ? head.replace(/Last edited in the app: [\d-]+\./, stamp) : head.replace(/(Last verified against public sources: [\d-]+\.)/, `$1 ${stamp}`);
  await writeFile(POSITIONING, [newHead, ...sections.map((x) => `## ${x.id}. ${x.title}\n${x.body.replace(/\n*$/, "\n")}`)].join("\n"));
  return readPositioning();
}
