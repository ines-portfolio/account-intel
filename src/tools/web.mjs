// Keyless web access: page fetch, news (Google News RSS), best-effort search (Bing RSS).
// With EXA_API_KEY set, search uses Exa instead.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const decode = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

export function htmlToText(html) {
  const raw = decode(
    html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " "),
  );
  // Site builders such as Framer leave their inlined CSS in the page text. Strip "selector{...}" rules, innermost first.
  let text = raw;
  for (let i = 0; i < 4 && text.includes("{"); i++) text = text.replace(/[^{}\s][^{}\n]{0,200}\{[^{}]*\}/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

export async function fetchPage(url, maxChars = 12000) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 2_000_000);
    const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
    const meta = decode(html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "");
    const body = htmlToText(html);
    const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
    return { url: res.url, title, text: `${meta} ${body}`.trim().slice(0, maxChars), links };
  } catch {
    return null;
  }
}

function rssItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const tag = (t) => decode(item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "").trim();
    return { title: tag("title"), url: tag("link"), snippet: htmlToText(tag("description")), date: tag("pubDate") ? new Date(tag("pubDate")).toISOString().slice(0, 10) : null };
  });
}

export async function news(query, limit = 10) {
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`, { signal: AbortSignal.timeout(12000) });
    return rssItems(await res.text()).slice(0, limit);
  } catch {
    return [];
  }
}

// mustMention drops results that never name the company; Bing's feed returns junk for some queries.
export async function search(query, { limit = 8, mustMention } = {}) {
  let results = [];
  try {
    if (process.env.EXA_API_KEY) {
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "x-api-key": process.env.EXA_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ query, numResults: limit, contents: { text: { maxCharacters: 1500 } } }),
        signal: AbortSignal.timeout(20000),
      });
      results = ((await res.json()).results ?? []).map((r) => ({ title: r.title ?? "", url: r.url, snippet: r.text ?? "", date: r.publishedDate?.slice(0, 10) ?? null }));
    } else {
      const res = await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
      results = rssItems(await res.text()).map((r) => ({ ...r, date: null }));
    }
  } catch {
    return [];
  }
  if (mustMention) {
    const needle = mustMention.toLowerCase();
    results = results.filter((r) => `${r.title} ${r.snippet} ${r.url}`.toLowerCase().includes(needle));
  }
  return results.slice(0, limit);
}

// Reads pages that only render in a browser (many careers pages do). Uses Exa's page reader when the key is set;
// otherwise falls back to a plain fetch, which returns little for such pages.
export async function readPages(urls, maxChars = 6000) {
  if (process.env.EXA_API_KEY) {
    try {
      const res = await fetch("https://api.exa.ai/contents", { method: "POST", headers: { "x-api-key": process.env.EXA_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ urls, text: { maxCharacters: maxChars } }), signal: AbortSignal.timeout(25000) });
      const results = ((await res.json()).results ?? []).filter((r) => (r.text ?? "").length > 200);
      if (results.length) return results.map((r) => ({ url: r.url, title: r.title ?? "", text: r.text }));
    } catch {}
  }
  return (await Promise.all(urls.map((u) => fetchPage(u, maxChars)))).filter((p) => p && p.text.length > 200).map(({ url, title, text }) => ({ url, title, text }));
}
