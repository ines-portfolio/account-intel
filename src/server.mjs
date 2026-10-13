// Local web server: serves the chat page and the API. Start with `npm start`.
import "./env.mjs";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./env.mjs";
import { runAccount, ask, locate, route, revise } from "./pipeline.mjs";
import { listRuns, loadRun, loadJson, saveJson, appendFeedback, appendChat, clearChat, deleteRun, creditLog, logCredits, readPositioning, savePositioning } from "./store.mjs";
import { SIGNALS, BASIS } from "./signals.mjs";
import * as apollo from "./tools/apollo.mjs";
import { authEnabled, currentUser, checkLogin, sessionCookie, clearCookie, guestMayRun, notify } from "./auth.mjs";
import { llmConfig } from "./llm.mjs";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(APP_ROOT, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
const FRESH_MS = 7 * 86_400_000; // a saved run younger than this is reused instead of repeated

const json = (res, status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
const body = async (req) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
};

const card = (b, extra = {}) => ({ type: "card", slug: b.account.slug, name: b.account.name, verdict: b.verdict, ranAt: b.ranAt, rerun: b.account.usdot ? `usdot ${b.account.usdot}` : b.account.domain, ...extra });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    // Apollo delivers direct phone numbers here, minutes after a confirmed request. The one-time token ties the call to that request.
    if (req.method === "POST" && url.pathname === "/api/apollo/webhook") {
      const slug = url.searchParams.get("slug"), i = Number(url.searchParams.get("i"));
      const brief = await loadJson(slug ?? "", "brief.json");
      const person = brief?.people[i];
      if (!person?.phone_request || person.phone_request.token !== url.searchParams.get("token")) return json(res, 403, { error: "Unknown request" });
      const numbers = apollo.phonesFromWebhook(await body(req));
      person.direct_phones = numbers;
      person.phone_request = { ...person.phone_request, token: null, answered: new Date().toISOString().slice(0, 10) };
      await saveJson(slug, "brief.json", brief);
      return json(res, 200, { ok: true });
    }
    // When the app is reachable through a public tunnel, outsiders may only reach the webhook above.
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? "");
    if (!local && !process.env.ALLOW_PUBLIC_UI) return json(res, 403, { error: "This address only accepts Apollo callbacks." });
    // A copy that is open to the internet must have sign-in switched on.
    if (!local && !authEnabled()) return json(res, 403, { error: "Public access needs sign-in. Set AUTH_ENABLED=true and AUTH_USERS." });

    // ---------- Sign-in (only when AUTH_ENABLED=true) ----------
    const user = authEnabled() ? currentUser(req.headers.cookie) : { label: "Local", role: "owner", local: true };
    const secure = req.headers["x-forwarded-proto"] === "https";
    if (authEnabled()) {
      if (req.method === "POST" && url.pathname === "/api/login") {
        const { email, password } = await body(req);
        const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
        const result = checkLogin(email, password, ip);
        if (!result.user) return json(res, result.status, { error: result.error });
        if (result.user.notify !== false) notify(`🔑 ${result.user.label} signed in to Account Intel (${result.user.email}).`);
        return res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": sessionCookie(result.user, secure) }).end(JSON.stringify({ ok: true }));
      }
      if (req.method === "POST" && url.pathname === "/api/logout") return res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": clearCookie }).end(JSON.stringify({ ok: true }));
      const open = ["/login", "/style.css", "/corgi-logo.svg", "/corgi-mark.svg"].includes(url.pathname);
      if (!user && !open) return url.pathname.startsWith("/api/") ? json(res, 401, { error: "Please sign in." }) : res.writeHead(302, { Location: `/login${url.pathname === "/" && !url.search ? "" : `?next=${encodeURIComponent(url.pathname + url.search)}`}` }).end();
      if (user && url.pathname === "/login") return res.writeHead(302, { Location: "/" }).end();
    }
    const guest = user?.role !== "owner";
    const ownerOnly = (req.method === "PUT" && url.pathname === "/api/positioning") || (req.method === "DELETE" && /^\/api\/runs\/[^/]+$/.test(url.pathname)) || (req.method === "POST" && /^\/api\/apollo\/(reveal|company|phone)$/.test(url.pathname));
    if (guest && ownerOnly) return json(res, 403, { error: "Only the owner of this app can do that." });
    if (req.method === "GET" && url.pathname === "/api/status") {
      const llm = await llmConfig();
      const spent = (await creditLog()).reduce((n, e) => n + e.credits, 0);
      return json(res, 200, { model: llm ? `${llm.provider} · ${llm.model}` : null, search: process.env.EXA_API_KEY ? "Exa" : "keyless", apollo: apollo.connected() ? { creditsUsed: spent, cost: apollo.COST, phoneReady: Boolean(process.env.PUBLIC_URL) } : null,
        // For the set-up dialog: which keys are in place, whether .env exists yet, and who to ask.
        user: authEnabled() ? { label: user.label, role: user.role === "owner" ? "owner" : "guest" } : null,
        keys: { model: Boolean(llm), search: Boolean(process.env.EXA_API_KEY), apollo: apollo.connected() }, envFile: existsSync(path.join(APP_ROOT, ".env")), admin: process.env.ADMIN_CONTACT || null });
    }
    // Settings: Corgi's positioning, editable. Signals: the fixed list of what the agent looks for and how.
    if (req.method === "GET" && url.pathname === "/api/positioning") return json(res, 200, await readPositioning());
    if (req.method === "PUT" && url.pathname === "/api/positioning") {
      try { return json(res, 200, await savePositioning(await body(req))); } catch (err) { return json(res, 400, { error: err.message }); }
    }
    if (req.method === "GET" && url.pathname === "/api/signals") {
      const keys = { search: Boolean(process.env.EXA_API_KEY) };
      return json(res, 200, { signals: SIGNALS.map((x) => ({ ...x, ready: !x.how.key || keys[x.how.key] })), basis: BASIS });
    }
    if (req.method === "GET" && url.pathname === "/api/runs") return json(res, 200, await listRuns());
    if (req.method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const run = await loadRun(decodeURIComponent(url.pathname.slice("/api/runs/".length)));
      return run ? json(res, 200, run) : json(res, 404, { error: "Run not found" });
    }
    const runPath = url.pathname.match(/^\/api\/runs\/([^/]+)(\/chat)?$/);
    if (req.method === "DELETE" && runPath) {
      const slug = decodeURIComponent(runPath[1]);
      await (runPath[2] ? clearChat(slug) : deleteRun(slug));
      return json(res, 200, { ok: true });
    }
    // Apollo. Anything that costs credits is refused unless the request carries the rep's explicit confirmation.
    if (req.method === "POST" && url.pathname.startsWith("/api/apollo/")) {
      const action = url.pathname.split("/").pop();
      const { slug, confirm, personIndex, contactId } = await body(req);
      const brief = await loadJson(slug, "brief.json");
      if (!apollo.connected()) return json(res, 400, { error: "Apollo is not connected. Add APOLLO_API_KEY to .env." });
      if (!brief?.account.domain) return json(res, 400, { error: "This account has no website domain to look up." });
      const cost = apollo.COST[action === "reveal" ? "email" : action];
      if (cost === undefined) return json(res, 404, { error: "Unknown Apollo action" });
      if (cost > 0 && confirm !== true) return json(res, 402, { error: `This spends ${cost} Apollo credit. Confirm to continue.`, credits: cost });
      if (action === "phone") {
        const person = brief.people[personIndex];
        if (!person) return json(res, 400, { error: "Person not found in this brief." });
        if (!process.env.PUBLIC_URL) return json(res, 400, { error: "Direct numbers need a public address for Apollo to call back. Set PUBLIC_URL in .env (see README)." });
        const token = randomUUID();
        const hook = `${process.env.PUBLIC_URL.replace(/\/$/, "")}/api/apollo/webhook?slug=${encodeURIComponent(slug)}&i=${personIndex}&token=${token}`;
        const asked = await apollo.requestPhone({ name: person.name, domain: brief.account.domain }, hook);
        if (!asked) return json(res, 404, { error: `Apollo has no record of ${person.name}; nothing was requested.` });
        await logCredits("apollo", cost, `direct phone request (up to ${cost} mobile credits): ${person.name} at ${brief.account.name}`);
        Object.assign(person, { phone_request: { token, at: new Date().toISOString() }, company_phone: person.company_phone ?? asked.company_phone });
      } else if (action === "contacts") {
        const known = new Set(brief.people.map((p) => p.name.split(" ")[0].toLowerCase()));
        brief.apolloContacts = (await apollo.searchContacts(brief.account.domain)).filter((c) => !known.has((c.first_name ?? "").toLowerCase()));
      } else if (action === "reveal") {
        const person = brief.people[personIndex];
        const contact = (brief.apolloContacts ?? []).find((c) => c.id === contactId);
        if (!person && !contact) return json(res, 400, { error: "Person not found in this brief." });
        const found = await apollo.revealPerson(contact ? { id: contact.id } : { name: person.name, domain: brief.account.domain });
        await logCredits("apollo", cost, `email lookup: ${person?.name ?? `${contact.first_name} (${contact.title})`} at ${brief.account.name}`);
        const fields = { email: found?.email ?? null, email_status: found ? found.email_status ?? "not found" : "not found", email_checked: new Date().toISOString().slice(0, 10) };
        fields.company_phone = found?.company_phone ?? null;
        if (person) Object.assign(person, fields, { profile_url: person.profile_url ?? found?.linkedin_url ?? null });
        else {
          brief.people.push({ name: found?.name || contact.first_name, title: found?.title || contact.title, role: contact.role && contact.role !== "Other" ? contact.role : "Found on Apollo", why: `${contact.why ?? ""} Listed at this company on Apollo; not checked against other sources.`.trim(), source_id: null, confidence: "medium", likely_reports: [], profile_url: found?.linkedin_url ?? null, ...fields });
          brief.apolloContacts = brief.apolloContacts.filter((c) => c.id !== contactId);
        }
      } else if (action === "company") {
        const found = await apollo.companyFacts(brief.account.domain);
        await logCredits("apollo", cost, `company facts: ${brief.account.name}`);
        if (found) {
          const sources = (await loadJson(slug, "sources.json")) ?? [];
          const id = `S${sources.length + 1}`;
          sources.push({ id, kind: "apollo", url: found.url, title: `Apollo company record: ${found.name}`, date: new Date().toISOString().slice(0, 10), text: found.facts.map(([k, v]) => `${k}: ${v}`).join(". ") });
          await saveJson(slug, "sources.json", sources);
          brief.research.facts.push(...found.facts.map(([label, value]) => ({ label, value, source_id: id })));
        }
        brief.apolloCompany = true;
      }
      await saveJson(slug, "brief.json", brief);
      return json(res, 200, { ok: true, credits: cost });
    }
    // A comment left on one person's drafts: rewrite only those, and keep the exchange in the account's conversation.
    if (req.method === "POST" && url.pathname === "/api/revise") {
      const { slug, contact, comment } = await body(req);
      if (!comment?.trim()) return json(res, 400, { error: "Say what should change." });
      const summary = await revise(slug, `Change only the messages for ${contact}; return the other contacts' messages exactly as they are. The rep's comment: ${comment.trim()}`);
      await appendChat(slug, [{ role: "user", text: `On ${contact}'s messages: ${comment.trim()}`, at: new Date().toISOString() }, { role: "bot", text: summary }]);
      return json(res, 200, { ok: true, summary });
    }
    if (req.method === "POST" && url.pathname === "/api/feedback") {
      const { account, contact, message, reason } = await body(req);
      if (!reason?.trim()) return json(res, 400, { error: "A reason is required." });
      const date = new Date().toISOString().slice(0, 10);
      await appendFeedback(`\n### ${date} — Rep feedback on a draft for ${contact} at ${account}\n- **What happened:** the rep rejected this draft: "${String(message).replace(/\s+/g, " ").slice(0, 300)}"\n- **Why:** ${reason.trim()}\n- **How to apply:** ${reason.trim()}\n`);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      const { message, slug } = await body(req);
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const replies = [];
      let target = slug;
      const hasModel = Boolean(await llmConfig());
      const send = (event) => {
        // Tell the page when a reply is a dead end only because no model key is set, so it can offer the set-up steps.
        if (!hasModel && (event.type === "answer" || event.type === "error") && /model/i.test(event.text ?? "")) event.needs = "model";
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === "stage") return;
        if (event.type === "card") target = event.slug;
        replies.push(event.type === "card" ? { role: "bot", card: event } : event.type === "confirm" ? { role: "bot", confirm: event } : { role: "bot", text: event.text, error: event.type === "error" || undefined, needs: event.needs });
      };
      try {
        const runs = await listRuns();
        const open = slug ? await loadJson(slug, "brief.json") : null;
        const what = await route(String(message ?? ""), open, runs);
        if (what.action === "say") send({ type: "answer", text: what.text });
        if (what.action === "open") {
          const hit = runs.find((r) => r.name.toLowerCase() === String(what.account).toLowerCase()) ?? runs.find((r) => r.name.toLowerCase().includes(String(what.account).toLowerCase()));
          if (hit) send(card(await loadJson(hit.slug, "brief.json"), { saved: true }));
          else what.action = "run";
        }
        // A company that is already saved opens from its name alone, with no search and no model needed.
        const wanted = String(what.account ?? "").toLowerCase().replace(/[?.!]+$/, "").trim();
        const known = what.action === "run" && !what.force && wanted && runs.find((r) => [r.name.toLowerCase(), r.name.toLowerCase().replace(/,? (inc|llc|corp)\.?$/, ""), r.slug].includes(wanted));
        if (known) send(card(await loadJson(known.slug, "brief.json"), { saved: true }));
        else if (what.action === "run") {
          const found = await locate(what.account);
          if (found.candidates) send({ type: "confirm", query: found.query, candidates: found.candidates });
          else {
            const existing = await loadJson(found.account.slug, "brief.json");
            if (existing && !what.force && Date.now() - Date.parse(existing.ranAt) < FRESH_MS) send(card(existing, { saved: true }));
            else if (!guestMayRun(user)) send({ type: "error", text: "This sign-in has reached its limit of new research runs for today. Saved accounts still open, and you can ask questions about them." });
            else {
              if (!user.local && user.notify !== false) notify(`🔎 ${user.label} is researching ${found.account.name}.`);
              send(card(await runAccount(found.account, (e) => e.type === "stage" && send(e))));
            }
          }
        } else if (what.action === "revise") {
          if (!open) send({ type: "answer", text: "Open an account first, then tell me what to change in its drafts." });
          else send({ type: "updated", slug, text: await revise(slug, String(message)) });
        } else if (what.action === "answer") {
          send({ type: "answer", text: open ? await ask(slug, String(message)) : "Give me a company name, a domain or a USDOT number and I will research it." });
        }
      } catch (err) {
        send({ type: "error", text: err.message });
      }
      // The conversation is stored with the account it is about, so a rep can come back to it.
      if (target) await appendChat(target, [{ role: "user", text: String(message), at: new Date().toISOString() }, ...replies]).catch(() => {});
      return res.end();
    }
    if (req.method === "GET") {
      const file = path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname === "/login" ? "login.html" : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
      if (!file.startsWith(PUBLIC)) return json(res, 403, { error: "Forbidden" });
      const data = await readFile(file).catch(() => null);
      if (data) return res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(data);
    }
    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, async () => {
  const llm = await llmConfig();
  console.log(`Account Intel running at http://localhost:${PORT}`);
  console.log(llm ? `Model: ${llm.provider} · ${llm.model}` : "Model: none connected. Trucking accounts and saved runs work; startup analysis needs a key in .env.");
});
