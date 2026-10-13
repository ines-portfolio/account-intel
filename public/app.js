const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// What the loader says while each stage runs.
const STAGES = {
  resolve: ["Finding the company", "Matching the name to the right website or carrier record"],
  collect: ["Fetching the evidence", "Their site, recent news, open roles, SEC filings and public profiles"],
  research: ["Reading up on them", "What they do, where, how big, and whether they fit"],
  people: ["Working out who buys", "The signer, who runs the process, and who else to reach"],
  person: ["Checking what the buyers have said", "Public posts, interviews and start dates for the top contacts"],
  signals: ["Sniffing out a reason to call", "Only signals with a real quote and source make it through"],
  proof: ["Matching customer stories", "Which of Corgi's published customers look most like this one"],
  drafts: ["Drafting the messages", "Call opener, email and LinkedIn, one signal per person"],
};

// Corgi loader: the logo's dog trotting above an orange shimmer bar, with a label for the current step.
const loader = (title, detail = "", cls = "") => `<div class="corgi-loader ${cls}" role="status" aria-live="polite">
  <div class="corgi-loader__row"><span class="corgi-loader__dog" aria-hidden="true"><img src="/corgi-mark.svg" alt=""></span><span class="corgi-loader__track"><span class="corgi-loader__bar"></span></span></div>
  <span class="corgi-loader__label">${esc(title)}…<small>${esc(detail)}</small></span><ul class="steps"></ul></div>`;

let current = null; // the account whose brief and conversation are open
let runs = [];
let tab = "Summary";
let busy = false;
let apollo = null; // { creditsUsed, cost } when Apollo is connected
let app = { keys: { model: true, search: true, apollo: true } }; // last /api/status reply: which keys are in place

const tone = (label) => (/^Work it: strong/.test(label) ? "good" : /^Work it|Weak|Check fit/.test(label) ? "warn" : /Rejected|Not a fit|Do not/.test(label) ? "bad" : "");
const scrollDown = () => ($("#log").scrollTop = $("#log").scrollHeight);

function add(html, cls = "msg bot") {
  const el = document.createElement("div");
  el.className = cls;
  el.innerHTML = html;
  $("#log").append(el);
  scrollDown();
  return el;
}

// One dialog for every confirmation, so nothing destructive or paid happens on a single click.
function dialog({ title, body, confirm = "Confirm", input = false }) {
  return new Promise((resolve) => {
    const m = $("#modal");
    m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p>${body}</p>${input ? '<textarea placeholder="Type here"></textarea>' : ""}
      <div class="rowx"><button class="ghost" data-no>Cancel</button><button class="btn-primary" data-yes>${esc(confirm)}</button></div></div>`;
    m.hidden = false;
    (m.querySelector("textarea") ?? m.querySelector("[data-yes]")).focus();
    const close = (value) => { m.hidden = true; m.onclick = m.onkeydown = null; resolve(value); };
    m.onclick = (e) => {
      if (e.target === m || e.target.closest("[data-no]")) close(null);
      else if (e.target.closest("[data-yes]")) close(input ? m.querySelector("textarea").value.trim() || null : true);
    };
    m.onkeydown = (e) => e.key === "Escape" && close(null);
  });
}

// Shown when the page cannot reach the app (it was stopped, or the computer went to sleep).
function offline() {
  const text = "<b>Can't reach the app</b>It may have been stopped. In the app folder run <span class=\"mono\">npm start</span>, then refresh this page.";
  if (!$("#brief").hidden) $("#brief").innerHTML = `<div class="empty">${text}</div>`;
  else add(`<div class="empty">${text}</div>`, "msg bot error");
  $("#status").textContent = "Not connected";
  $("#status").classList.add("off");
}

// ---------- Missing keys: placeholders and the set-up window ----------

const KEYS = {
  model: { name: "AI model", env: "GEMINI_API_KEY", unlocks: "Research, signals, customer stories, drafts, follow-up questions and rewrites for startup accounts.", without: "Saved accounts and trucking companies still work.", cost: "Free tier",
    steps: ['Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in with a Google account.', "Click <b>Create API key</b> and copy it."],
    note: "Any one of these works instead: ANTHROPIC_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or a local Ollama model." },
  search: { name: "Exa search", env: "EXA_API_KEY", unlocks: "Better web search: more named people, their public profiles and posts, and signals about a person.", without: "The app uses a free search that finds fewer people.", cost: "About 3 cents per account; free credits on sign-up",
    steps: ['Open <a href="https://dashboard.exa.ai/api-keys" target="_blank" rel="noopener">dashboard.exa.ai/api-keys</a> and create an account.', "Create an API key and copy it."] },
  apollo: { name: "Apollo", env: "APOLLO_API_KEY", unlocks: "Extra contacts by role, and work email plus company phone line for a person.", without: "People show name, title and LinkedIn link only.", cost: "Needs a paid Apollo plan. 1 credit per email lookup, always confirmed first",
    steps: ['In <a href="https://app.apollo.io" target="_blank" rel="noopener">Apollo</a>, open <b>Settings → Integrations → API</b>.', "Create an API key and copy it."] },
};

// A placeholder for content that needs a key: the shape of what would be here, why it is not, and how to fix it.
function needKey(kind, title, what, shape = "cards") {
  const k = KEYS[kind];
  return `<div class="keyless"><div class="skeleton ${shape}" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="keyless__body"><b>${esc(title)}</b><p>${esc(what)} It needs the ${esc(k.name)} key, which is not set up in this copy of the app.</p>
    <div class="rowx"><button class="btn-primary" data-keys="${kind}">How to set it up</button><span class="sub">${esc(k.without)}</span></div></div></div>`;
}
const gap = (kind, label, why) => `<button class="gap" type="button" data-keys="${kind}" data-tip="${esc(why)} Click for the set-up steps." aria-label="${esc(label)}: ${esc(why)}">${esc(label)}<span aria-hidden="true">i</span></button>`;
const keyHint = (kind, text) => `<span class="sub">${esc(text)} <button class="link" data-keys="${kind}">Set it up</button></span>`;

function keysDialog(focus = "model") {
  const m = $("#modal");
  const adminMessage = (kind) => `Hi, the Account Intel app is missing its ${KEYS[kind].name} key (${KEYS[kind].env}). Could you add it to the app's .env file and restart the app? It unlocks: ${KEYS[kind].unlocks}`;
  const section = (kind) => {
    const k = KEYS[kind], on = app.keys[kind];
    return `<details class="keyrow" ${kind === focus && !on ? "open" : ""}>
      <summary><span class="pill ${on ? "good" : ""}">${on ? "Connected" : "Not set up"}</span><b>${esc(k.name)}</b><span class="sub">${esc(k.cost)}</span></summary>
      <p><b>What it unlocks:</b> ${esc(k.unlocks)} ${on ? "" : `<br><b>Without it:</b> ${esc(k.without)}`}</p>
      ${on ? "" : `<ol>${k.steps.map((x) => `<li>${x}</li>`).join("")}
        <li>${app.envFile ? "Open the file <span class=\"mono\">.env</span> in the app folder." : "In the app folder, make a copy of <span class=\"mono\">.env.example</span> and name it <span class=\"mono\">.env</span>."}</li>
        <li>Paste the key right after <span class="mono">${k.env}=</span> and save the file.</li>
        <li>Stop the app (Ctrl+C in its terminal window), start it again with <span class="mono">npm start</span>, and refresh this page.</li></ol>
        ${k.note ? `<p class="sub">${esc(k.note)}</p>` : ""}
        <div class="rowx"><button class="copy-btn" type="button" data-copy="${esc(adminMessage(kind))}" data-label="Copy a message for my admin"><span class="copy-btn__icon" aria-hidden="true">⧉</span><span class="copy-btn__label">Copy a message for my admin</span></button></div>`}
    </details>`;
  };
  m.innerHTML = `<div class="dialog wide" role="dialog" aria-modal="true" aria-label="Set up keys">
    <div class="row1"><h3>Set up the app's keys</h3><button class="x" data-no aria-label="Close">×</button></div>
    <p>Some features call outside services, and each needs a key. Keys live in one file on the computer that runs the app. They are never typed into this page.</p>
    ${["model", "search", "apollo"].map(section).join("")}
    <div class="keyrow admin"><b>Not the person who set this up?</b><p>${app.admin ? `Ask <b>${esc(app.admin)}</b>.` : "Ask whoever installed the app for you."} Open the key you need above and use <b>Copy a message for my admin</b> to send them exactly what to add.</p></div>
    <div class="rowx"><span class="sub" id="keycheck"></span><button class="ghost" data-recheck>I added a key: check again</button><button class="btn-primary" data-no>Done</button></div></div>`;
  m.hidden = false;
  m.onkeydown = (e) => e.key === "Escape" && (m.hidden = true);
  m.onclick = async (e) => {
    if (e.target === m || e.target.closest("[data-no]")) return (m.hidden = true);
    if (e.target.closest("[data-recheck]")) {
      const before = JSON.stringify(app.keys);
      await refresh();
      if (JSON.stringify(app.keys) === before) return ($("#keycheck").textContent = "Nothing new yet. Keys are read when the app starts, so restart it after saving .env.");
      keysDialog(focus);
      if (current) render(); else home();
    }
  };
  m.querySelector("[data-no]").focus();
}

// ---------- Pages: How signals work, and Corgi positioning ----------

function showPage(view, html) {
  current = null;
  $("#main").classList.remove("full", "view-brief");
  $("#toreport").hidden = true;
  $("#main").classList.add("solo");
  $("#brief").hidden = true;
  $("#chat").classList.add("page");
  $("#context").innerHTML = "";
  document.body.classList.remove("menu");
  document.querySelectorAll(".navlink").forEach((el) => el.classList.toggle("on", el.dataset.view === view));
  document.querySelectorAll(".item.active").forEach((el) => el.classList.remove("active"));
  history.replaceState(null, "", `/?view=${view}`);
  $("#log").innerHTML = `<div class="pagebody">${html}</div>`;
  $("#log").scrollTop = 0;
}

async function signalsPage() {
  showPage("signals", loader("Fetching the signal list", "", "inline"));
  const { signals, basis } = await (await fetch("/api/signals")).json();
  const row = (x) => `<details class="keyrow">
    <summary><span class="pill ${x.priority === 1 ? "good" : x.priority === 2 ? "warn" : ""}">Priority ${x.priority}</span><b>${esc(x.name)}</b><span class="sub">${esc(x.coverage.join(", "))}</span>${x.ready ? "" : gap("search", "Needs Exa", "This signal is fetched with Exa search, which is not set up in this copy of the app. It is skipped until the key is added.")}</summary>
    <dl><dt>What it is</dt><dd>${esc(x.what)}</dd><dt>Why it matters</dt><dd>${esc(x.why)}</dd>
    <dt>How the agent gets it</dt><dd>${x.how.tools.map((t) => `<span class="pill">${esc(t)}</span>`).join(" ")}<br>${esc(x.how.process)}</dd>
    <dt>Counts as a reason to call</dt><dd>${esc(x.window)}</dd><dt>How it is used in a message</dt><dd>${esc(x.angle)}</dd></dl></details>`;
  const group = (segment, title, sub) => `<h3>${title}</h3><p class="sub">${sub}</p>${signals.filter((x) => x.segment === segment).map(row).join("")}`;
  showPage("signals", `<h1>How signals work</h1>
    <p>A signal is a dated, public event that gives a company a reason to buy insurance now. The agent looks for the ${signals.length} below and nothing else.</p>
    <div class="steps3"><div><b>1. Fetch</b>Each signal has its own fetcher: a public source, read the same way every time.</div><div><b>2. Check</b>A signal only counts with a quote that is really in the source, a recent date, and a coverage line Corgi sells.</div><div><b>3. Use</b>Each message opens with one signal and the insurance requirement it creates.</div></div>
    <div class="notice"><div><b>This list cannot be edited here</b>Every extra signal adds noise for reps, so the list is fixed. Each account's Signals tab shows which of these were checked and what came back.</div></div>
    ${group("startups", "Startups", "In priority order. Priority 1 signals have a third party forcing the purchase by a date.")}
    ${group("trucking", "Trucking fleets", "All from federal insurance filings. No AI model is used for these.")}
    <h3>What the priorities are based on</h3><ul>${basis.map((x) => `<li>${esc(x.claim)} <a class="src" href="${esc(x.url)}" target="_blank" rel="noopener">source</a></li>`).join("")}</ul>
    <p class="sub">The order and the time windows are our own judgment from those sources. They should be tested against Corgi's closed deals.</p>`);
}

let pos = null; // the positioning as last loaded for the settings page
async function settingsPage(note = "") {
  if (!pos) { showPage("settings", loader("Fetching the positioning", "", "inline")); pos = await (await fetch("/api/positioning")).json(); }
  const chips = (list, kind, g = "") => `<div class="chips edit">${list.map((x, i) => `<span class="chip">${esc(x)}<button class="x" data-rm="${kind}" data-g="${g}" data-i="${i}" aria-label="Remove ${esc(x)}">×</button></span>`).join("")}
    <span class="addchip"><input data-add="${kind}" data-g="${g}" placeholder="Add…" aria-label="Add an item"><button class="ghost" data-addbtn="${kind}" data-g="${g}">Add</button></span></div>`;
  const readOnly = app.user?.role === "guest";
  showPage("settings", `<h1>Corgi positioning</h1>
    ${readOnly ? '<div class="notice"><div><b>You can read this page, not change it</b>Only the owner of this app can edit the positioning.</div></div>' : ""}
    <p>Everything the agent says about Corgi comes from here. A change applies to the next account you run. ${pos.updated ? `<span class="sub">Last changed ${esc(pos.updated)}.</span>` : ""}</p>
    ${note ? `<div class="notice"><div><b>${esc(note)}</b>The next run uses it. The previous version was kept.</div></div>` : ""}
    <div class="card"><h3>What Corgi is</h3><p class="sub">One or two sentences. Used when a message introduces Corgi.</p>
      <textarea id="oneliner" rows="3">${esc(pos.oneLiner)}</textarea><div class="rowx"><button class="btn-primary" data-save="oneLiner">Save</button></div></div>
    <div class="card"><h3>What Corgi sells</h3><p class="sub">A signal only counts if it points to something on this list, and every message must name one of these.</p>
      ${pos.offerings.map((g, gi) => `<div class="group"><div class="rowx" style="margin:0 0 6px;justify-content:space-between"><h4 style="margin:0">${esc(g.label)}</h4><button class="link" data-rmgroup="${gi}">Remove group</button></div>${chips(g.items, "offer", gi)}</div>`).join("")}
      <div class="group"><span class="addchip"><input id="newgroup" placeholder="New group, e.g. Real estate" aria-label="New group name"><button class="ghost" data-addgroup>Add a group</button></span></div>
      <div class="rowx"><button class="btn-primary" data-save="offerings">Save offerings</button></div></div>
    <div class="card"><h3>Claims reps may use</h3><p class="sub">The only product claims a message may make, in these words.</p>${chips(pos.claims, "claim")}
      <div class="rowx"><button class="btn-primary" data-save="claims">Save claims</button></div></div>
    <div class="card"><h3>Customer stories</h3><p class="sub">The agent matches these to each account and uses one as proof. Results and quotes must come from Corgi's own pages.</p>
      ${pos.stories.map((x, i) => `<div class="story"><div><b>${esc(x.customer)}</b><div class="sub">${esc(x.result)}</div></div><div class="rowx" style="margin:0;flex-wrap:nowrap"><button class="ghost" data-story="${i}">Edit</button><button class="ghost" data-rmstory="${i}">Remove</button></div></div>`).join("")}
      <div class="rowx"><button class="ghost" data-story="new">+ Add a story</button><button class="btn-primary" data-save="stories">Save stories</button></div></div>
    <div class="card"><h3>Segments, buyers and competitors</h3><p class="sub">Longer guidance, edited as text.</p>
      ${pos.sections.filter((x) => ["3", "4", "5", "7", "8"].includes(x.id)).map((x) => `<div class="story"><div><b>${esc(x.title)}</b><div class="sub">${esc(x.text.replace(/[#*>|]/g, "").replace(/\s+/g, " ").slice(0, 110))}…</div></div><button class="ghost" data-section="${x.id}">Edit text</button></div>`).join("")}</div>
    <div class="notice"><div><b>Signals are not edited here</b>The list of signals is fixed so reps are not flooded with noise.</div><button class="ghost" data-view="signals">How signals work</button></div>`);
}

// A form in the dialog: fields is [{ key, label, value, long }]. Resolves to the values, or null if cancelled.
function formDialog(title, fields, confirm = "Done") {
  return new Promise((resolve) => {
    const m = $("#modal");
    m.innerHTML = `<div class="dialog wide" role="dialog" aria-modal="true"><div class="row1"><h3>${esc(title)}</h3><button class="x" data-no aria-label="Close">×</button></div>
      ${fields.map((f) => `<label class="field"><span>${esc(f.label)}</span>${f.long ? `<textarea data-k="${f.key}" rows="${f.rows ?? 3}">${esc(f.value ?? "")}</textarea>` : `<input data-k="${f.key}" value="${esc(f.value ?? "")}">`}</label>`).join("")}
      <div class="rowx"><button class="ghost" data-no>Cancel</button><button class="btn-primary" data-yes>${esc(confirm)}</button></div></div>`;
    m.hidden = false;
    m.querySelector("[data-k]").focus();
    const close = (v) => { m.hidden = true; m.onclick = m.onkeydown = null; resolve(v); };
    m.onkeydown = (e) => e.key === "Escape" && close(null);
    m.onclick = (e) => {
      if (e.target === m || e.target.closest("[data-no]")) close(null);
      else if (e.target.closest("[data-yes]")) close(Object.fromEntries([...m.querySelectorAll("[data-k]")].map((el) => [el.dataset.k, el.value.trim()])));
    };
  });
}

async function savePositioning(patch, done) {
  const res = await fetch("/api/positioning", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  const data = await res.json();
  if (!res.ok) return dialog({ title: "Could not save", body: esc(data.error), confirm: "OK" });
  pos = data;
  settingsPage(done);
}

async function settingsClick(t) {
  const list = (kind, g) => (kind === "offer" ? pos.offerings[Number(g)].items : pos.claims);
  if (t.dataset.rm) { list(t.dataset.rm, t.dataset.g).splice(Number(t.dataset.i), 1); return settingsPage(); }
  if (t.dataset.addbtn) {
    const input = document.querySelector(`[data-add="${t.dataset.addbtn}"][data-g="${t.dataset.g}"]`);
    if (!input.value.trim()) return input.focus();
    list(t.dataset.addbtn, t.dataset.g).push(input.value.trim());
    return settingsPage();
  }
  if (t.dataset.addgroup !== undefined) {
    const label = $("#newgroup").value.trim();
    if (!label) return $("#newgroup").focus();
    pos.offerings.push({ label, items: [] });
    return settingsPage();
  }
  if (t.dataset.rmgroup !== undefined) { pos.offerings.splice(Number(t.dataset.rmgroup), 1); return settingsPage(); }
  if (t.dataset.rmstory !== undefined) { pos.stories.splice(Number(t.dataset.rmstory), 1); return settingsPage(); }
  if (t.dataset.story !== undefined) {
    const i = t.dataset.story === "new" ? -1 : Number(t.dataset.story), x = pos.stories[i] ?? {};
    const v = await formDialog(i < 0 ? "Add a customer story" : `Edit ${x.customer}`, [
      { key: "customer", label: "Customer", value: x.customer }, { key: "what", label: "What they do", value: x.what },
      { key: "situation", label: "The situation they were in", value: x.situation, long: true, rows: 2 }, { key: "result", label: "The result, in one line (as Corgi's page states it)", value: x.result, long: true, rows: 2 },
      { key: "quote", label: "Quote, word for word", value: x.quote, long: true }, { key: "speaker", label: "Who said it (name, title, company)", value: x.speaker },
      { key: "useWhen", label: "Use when the prospect… (a matching hint, never shown as a fact)", value: x.useWhen, long: true, rows: 2 },
      { key: "url", label: "Link to the story on corgi.insure", value: x.url }, { key: "quoteUrl", label: "Link to the quote, if it is on a different page", value: x.quoteUrl }]);
    if (!v) return;
    if (i < 0) pos.stories.push(v); else pos.stories[i] = v;
    return settingsPage();
  }
  if (t.dataset.section) {
    const x = pos.sections.find((y) => y.id === t.dataset.section);
    const v = await formDialog(`Edit: ${x.title}`, [{ key: "text", label: "This section is plain text with simple formatting. Keep the headings and tables in the same shape.", value: x.text, long: true, rows: 18 }], "Save section");
    return v && savePositioning({ section: { id: x.id, text: v.text } }, `Saved "${x.title}"`);
  }
  if (t.dataset.save === "oneLiner") return savePositioning({ oneLiner: $("#oneliner").value }, "Saved the description");
  if (t.dataset.save) return savePositioning({ [t.dataset.save]: pos[t.dataset.save] }, `Saved ${t.dataset.save === "offerings" ? "the offerings" : t.dataset.save === "claims" ? "the claims" : "the customer stories"}`);
}

// ---------- Sidebar ----------

async function refresh() {
  const [list, status] = await Promise.all([fetch("/api/runs").then((r) => r.json()), fetch("/api/status").then((r) => r.json())]);
  runs = list;
  apollo = status.apollo;
  app = status;
  const missing = Object.values(status.keys).filter((v) => !v).length;
  $("#status").classList.toggle("off", !status.model);
  $("#status").innerHTML = `${status.model ? esc(`${status.model} · search: ${status.search}`) : "No AI model connected"}${missing ? ` <button class="link" data-keys="${status.keys.model ? (status.keys.search ? "apollo" : "search") : "model"}">${status.keys.model ? `${missing} optional key${missing > 1 ? "s" : ""} not set` : "Set up keys"}</button>` : ""}`;
  $("#count").textContent = runs.length || "";
  $("#accounts").innerHTML = runs.map((r) => `<div class="item ${current?.account.slug === r.slug ? "active" : ""}" data-open="${esc(r.slug)}" tabindex="0" title="${esc(r.name)} · ${esc(r.verdict.label)}">
    <span class="dot ${tone(r.verdict.label)}"></span><span class="ini" aria-hidden="true">${esc(r.name.slice(0, 2))}</span><span class="nm" ${/not analyzed/.test(r.verdict.label) ? 'title="Collected while no AI model key was set up. Open it for the set-up steps."' : ""}><b>${esc(r.name)}</b><small>${esc(r.verdict.label)} · ${esc(r.ranAt.slice(5, 10))}</small></span>
    <button class="del" data-del="${esc(r.slug)}" title="Delete this account and its conversation" aria-label="Delete ${esc(r.name)}">✕</button></div>`).join("") || '<div class="note">No accounts yet. Start a new chat.</div>';
  $("#credits").textContent = apollo ? `Apollo credits used here: ${apollo.creditsUsed}` : "";
  $("#who").innerHTML = status.user ? `<span>Signed in as ${esc(status.user.label)}</span><button class="link" data-signout>Sign out</button>` : "";
  document.body.classList.toggle("guest", status.user?.role === "guest");
}

// ---------- Home (new chat) ----------

async function home() {
  $("#chat").classList.remove("page");
  $("#main").classList.remove("full", "view-brief");
  $("#toreport").hidden = true;
  current = null;
  $("#main").classList.add("solo");
  $("#brief").hidden = true;
  $("#context").innerHTML = "";
  $("#input").placeholder = "Company, domain or USDOT number";
  document.body.classList.remove("menu");
  history.replaceState(null, "", "/");
  await refresh();
  $("#log").innerHTML = "";
  add(`<h1>Who are we breaking into?</h1><p>Name a company. I research it, find who buys, check for a real reason to reach out now, and draft the messages. Each account keeps its own conversation in the sidebar.</p>
    <div class="chips"><button class="chip" data-send="UpSmith">UpSmith</button><button class="chip" data-send="Besh LLC">Besh LLC</button><button class="chip" data-send="usdot 424572">usdot 424572</button></div>
    ${app.keys.model ? "" : `<div class="notice"><div><b>Researching a new startup is switched off</b>No AI model key is set up in this copy of the app. Saved accounts open as usual and trucking companies still run live.</div><button class="btn-primary" data-keys="model">How to set it up</button></div>`}
    ${runs.length ? `<div class="label">All researched accounts</div><div class="card" style="padding:8px 20px"><table class="runs">${runs.map((r) => `<tr data-open="${esc(r.slug)}"><td>${esc(r.name)}</td><td>${esc(r.segment)}</td><td><span class="pill ${tone(r.verdict.label)}">${esc(r.verdict.label)}</span></td><td class="mono">${esc(r.ranAt.slice(0, 10))}</td></tr>`).join("")}</table></div>` : ""}`, "hello");
  $("#log").scrollTop = 0;
  $("#input").focus();
}

// ---------- Conversation ----------

function accountCard(c) {
  const el = add(`<div class="top"><strong>${esc(c.name)}</strong><span class="pill ${tone(c.verdict.label)}">${esc(c.verdict.label)}</span></div>
    <p>${esc(c.verdict.reason)}</p>
    <div class="actions"><button class="ghost" data-open="${esc(c.slug)}">Open brief</button><a class="ghost" href="/?run=${encodeURIComponent(c.slug)}" target="_blank" rel="noopener">New tab ↗</a>
    <button class="ghost" data-send="rerun ${esc(c.rerun)}">Re-run</button><span class="sub">${c.saved ? "saved" : "researched"} ${esc(c.ranAt.slice(0, 10))}</span>
    ${/not analyzed/.test(c.verdict.label) && !app.keys.model ? '<button class="btn-primary" data-keys="model" style="padding:6px 14px;font-size:13px">How to set it up</button>' : ""}</div>`, "acct");
  el.dataset.slug = c.slug;
}

const confirmChips = (c) => add(`I found more than one company for "${esc(c.query)}". Which one?<div class="chips" style="margin-top:10px">${c.candidates.map((x) => `<button class="chip" data-send="run ${esc(x.domain)}" title="${esc(x.title)}"><b>${esc(x.domain)}</b> · ${esc(x.title.slice(0, 40))}</button>`).join("")}</div><div class="sub" style="margin-top:8px">Or type the right domain.</div>`);

function showItem(m) {
  if (m.role === "user") add(esc(m.text), "msg user");
  else if (m.card) accountCard(m.card);
  else if (m.confirm) confirmChips(m.confirm);
  else say(m);
}

const say = (m) => add(`${esc(m.text)}${m.needs ? `<div class="rowx"><button class="btn-primary" data-keys="${esc(m.needs)}">How to set it up</button></div>` : ""}`, m.error ? "msg bot error" : "msg bot");

function loaderView(box, stages) {
  const running = Object.values(stages).filter((s) => s.status === "running").at(-1) ?? Object.values(stages).at(-1);
  const [title, detail] = STAGES[running?.id] ?? ["Thinking", "Working out what you are asking for"];
  if (!box.querySelector(".corgi-loader__dog")) box.innerHTML = loader(title, detail);
  box.querySelector(".corgi-loader__label").innerHTML = `${esc(title)}…<small>${esc(detail)}</small>`;
  box.querySelector(".steps").innerHTML = Object.values(stages).map((s) => `<li class="${s.status}" title="${esc(s.detail)}">${s.status === "done" ? "✓ " : ""}${esc((STAGES[s.id] ?? [s.id])[0])}</li>`).join("");
}

async function send(message) {
  if (busy) return;
  busy = true;
  $("#form button").disabled = true;
  document.querySelector(".hello")?.remove();
  document.querySelector(".note")?.remove();
  add(esc(message), "msg user");
  const box = add("", "loadwrap");
  const stages = {};
  loaderView(box, stages);
  let openAfter = null;
  try {
    const res = await post("/api/chat", { message, slug: current?.account.slug });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const part of parts) {
        const event = JSON.parse(part.replace(/^data: /, ""));
        if (event.type === "stage") { stages[event.id] = event; loaderView(box, stages); }
        else if (event.type === "card") openAfter = { slug: event.slug };
        else if (event.type === "updated") { add(esc(event.text)); openAfter = { slug: event.slug, tab: "Messages", flash: true }; }
        else if (event.type === "confirm") confirmChips(event);
        else say({ text: event.text, error: event.type === "error", needs: event.needs });
        scrollDown();
      }
    }
  } catch (err) {
    if (err instanceof TypeError) offline();
    else add(esc(`Something went wrong: ${err.message}`), "msg bot error");
  }
  box.remove();
  busy = false;
  $("#form button").disabled = false;
  // The reply is saved with the account; opening it shows that account's whole conversation.
  if (openAfter) await openRun(openAfter.slug, openAfter.tab, openAfter.flash);
  $("#input").focus();
}

// ---------- Account: brief + its conversation ----------

async function openRun(slug, startTab, flash = false) {
  $("#chat").classList.remove("page");
  $("#main").classList.remove("solo");
  $("#brief").hidden = false;
  document.body.classList.remove("menu");
  const switching = current?.account.slug !== slug;
  // On a small screen one pane shows at a time: a newly opened account shows its report, a follow-up stays in the chat.
  if (switching) $("#main").classList.add("view-brief");
  $("#toreport").hidden = false;
  if (switching) $("#brief").innerHTML = loader("Fetching the brief", "", "inline");
  const res = await fetch(`/api/runs/${encodeURIComponent(slug)}`).catch(() => null);
  if (!res) return offline();
  if (!res.ok) { await home(); return add(esc("That account is no longer saved."), "msg bot error"); }
  current = await res.json();
  tab = startTab ?? (switching ? "Summary" : tab);
  render(flash);
  $("#log").innerHTML = "";
  current.chat.forEach(showItem);
  if (!current.chat.length) add(`Ask anything about ${esc(current.account.name)}, or ask for changes to the drafts.`, "note");
  document.querySelectorAll(".acct").forEach((el) => el.classList.toggle("active", el.dataset.slug === slug));
  $("#context").innerHTML = `<b>${esc(current.account.name)}</b>${current.chat.length ? '<button class="ghost" data-clear>Clear chat</button>' : ""}`;
  $("#input").placeholder = "Ask, change a draft, or name a company";
  history.replaceState(null, "", `/?run=${encodeURIComponent(slug)}`);
  refresh();
}

const src = (id) => {
  const s = current.sources.find((x) => x.id === id);
  return s ? `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">${esc(id)}</a>` : "";
};
const copyBtn = (text, label = "Copy") => `<button class="copy-btn" type="button" data-copy="${esc(text)}" data-label="${label}" aria-label="${label} to clipboard"><span class="copy-btn__icon" aria-hidden="true">⧉</span><span class="copy-btn__label">${label}</span></button>`;
const block = (label, text) => (text ? `<div class="block"><div class="bar"><h4>${esc(label)}</h4>${copyBtn(text)}</div><pre>${esc(text)}</pre></div>` : "");
const cost = (n) => (n ? `<span class="cost">${n} credit${n > 1 ? "s" : ""}</span>` : '<span class="cost free">free</span>');

const phoneRow = (p) => {
  const number = p.phone ?? p.company_phone;
  return number ? `<span class="email">${esc(number)}</span>${copyBtn(number, "Copy phone")}<span class="sub">${esc(p.phone ? p.phone_note ?? "" : "Company main line (Apollo)")}</span>` : "";
};

function directPhoneRow(p, i) {
  if (!apollo || !current.account.domain || current.account.segment === "trucking") return "";
  if (p.direct_phones?.length) return p.direct_phones.map((n) => `<span class="email">${esc(n.number)}</span>${copyBtn(n.number, "Copy phone")}<span class="sub">${esc(n.type)} (Apollo)</span>`).join("");
  if (p.phone_request?.answered) return `<span class="sub">Apollo has no direct number for this person (checked ${esc(p.phone_request.answered)})</span>`;
  if (p.phone_request) return `<span class="sub">Direct number requested. Apollo sends it within a few minutes.</span><button class="ghost" data-open="${esc(current.account.slug)}">Check now</button>`;
  if (!apollo.phoneReady) return ""; // off unless PUBLIC_URL is set
  return `<button class="ghost" data-phone="${i}">Get direct phone ${cost(apollo.cost.phone)}</button>`;
}

// Opens the rep's own mail app with the draft filled in. The app itself never sends anything.
const personFor = (m) => current.people.find((p) => p.name === m.contact);
const mailBtn = (m) => `<a class="ghost" href="mailto:${encodeURIComponent(personFor(m)?.email ?? "")}?subject=${encodeURIComponent(m.email.subject)}&body=${encodeURIComponent(m.email.body)}">Open in email app ↗</a>${personFor(m)?.email ? "" : '<span class="sub">no address yet: find it on the People tab</span>'}`;
const profileBtn = (m) => (personFor(m)?.profile_url ? `<a class="ghost" href="${esc(personFor(m).profile_url)}" target="_blank" rel="noopener">Open LinkedIn profile ↗</a>` : "");

function emailRow(p, i) {
  if (p.email) return `<span class="email">${esc(p.email)}</span>${copyBtn(p.email, "Copy email")}<span class="sub">Apollo: ${esc(p.email_status ?? "unverified")}</span>`;
  if (p.email_checked) return `<span class="sub">No work email on Apollo (checked ${esc(p.email_checked)})</span>`;
  if (!current.account.domain) return "";
  if (!apollo) return gap("apollo", "Email", "No email is shown because Apollo is not set up in this copy of the app. With it, one click looks up this person's work email for 1 credit.")
    + gap("apollo", "Phone", "No phone number is shown because Apollo is not set up. The company's main line comes back with the same email lookup.");
  if (app.user?.role === "guest") return '<span class="sub">Email lookup is switched off for this sign-in.</span>';
  return `<button class="ghost" data-reveal="${i}">Find email ${cost(apollo.cost.email)}</button>`;
}

// Summary rows that have no value because a key is missing: shown as rows, so the gap is visible where the fact would be.
function missingFacts(b, unanalyzed, startup) {
  const has = (label) => b.research.facts.some((f) => f.label.toLowerCase().startsWith(label.toLowerCase()));
  if (unanalyzed) return ["What they do", "HQ", "Headcount", "Funding", "Sells to"].filter((l) => !has(l))
    .map((l) => `<tr><td>${l}</td><td>${gap("model", "Not analyzed", `The sources for this account were collected, but working out "${l}" from them needs the AI model key, which is not set up.`)}</td></tr>`).join("");
  if (!startup || apollo) return "";
  return ["Headcount", "Revenue"].filter((l) => !has(l))
    .map((l) => `<tr><td>${l}</td><td>${gap("apollo", "Not available", `No ${l.toLowerCase()} figure was found in public sources. Apollo's estimate would fill this in, but Apollo is not set up.`)}</td></tr>`).join("");
}

function render(flash = false) {
  const b = current;
  const li = (name) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name)}`;
  const tabs = [["Summary"], ["Signals", b.signals.length], ["People", b.people.length], ["Proof", (b.proof ?? []).length], ["Messages", b.messages.length], ["Sources", b.sources.length]];
  const canApollo = apollo && b.account.domain && app.user?.role !== "guest";
  const startup = b.account.segment !== "trucking";
  // This account was collected while no model key was set: its analysis tabs are placeholders, not empty results.
  const unanalyzed = b.stages?.some((x) => x.status === "skipped" && x.detail === "no model connected");
  const WAITING = {
    Signals: ["Signals would appear here", "The reasons to reach out now, each with a quote, a source and a date, plus the ones the agent rejected.", "cards"],
    People: ["The buying center would appear here", "Who signs, who runs the process and who else to reach, with their LinkedIn links.", "rows"],
    Proof: ["Customer stories would appear here", "The Corgi customers most like this account, with a one-liner and a quote for each.", "cards"],
    Messages: ["Drafts would appear here", "A call opener, an email, a follow-up and two LinkedIn messages for each person.", "text"],
  };
  const views = {
    Summary: () => `${unanalyzed ? `<div class="notice"><div><b>Evidence collected, not analyzed yet</b>The app gathered ${b.sources.length} sources for ${esc(b.account.name)}, but reading them needs the AI model key. Set it up, then click Re-run.</div><button class="btn-primary" data-keys="model">How to set it up</button></div>` : ""}<div class="card">
      <p>${esc(b.research.one_liner)}</p>
      <table>${b.research.facts.map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(f.value)}${src(f.source_id)}</td></tr>`).join("")}${missingFacts(b, unanalyzed, startup)}</table>
      ${canApollo && !b.apolloCompany ? `<div class="rowx"><button class="ghost" data-company>Add headcount, revenue and funding from Apollo ${cost(apollo.cost.company)}</button></div>` : ""}
      ${b.research.priorities?.length ? `<h4>What they are prioritizing (inference)</h4><ul>${b.research.priorities.map((p) => `<li>${esc(p.text)}${src(p.source_id)}</li>`).join("")}</ul>` : ""}
      ${b.research.timeline?.length ? `<h4>Timeline</h4><table>${b.research.timeline.slice(0, 12).map((t) => `<tr><td class="mono">${esc(t.date ?? "")}</td><td>${esc(t.event)}${src(t.source_id)}</td></tr>`).join("")}</table>` : ""}
      ${b.notes.length ? `<h4>Before you reach out</h4><ul>${b.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div>`,
    Signals: () => `
      ${b.signals.map((s) => `<div class="card"><div class="rowx" style="margin:0 0 6px"><span class="pill ${esc(s.strength)}">${esc(s.strength)}</span>${s.person ? `<span class="pill">about ${esc(s.person)}</span>` : '<span class="pill">company</span>'}<h3>${esc(s.headline)}</h3></div>
        <blockquote>“${esc(s.quote)}” ${src(s.source_id)} ${s.date ? `<span class="mono">${esc(s.date)}</span>` : ""}</blockquote>
        <div class="sub">${esc(s.maps_to)} · Coverage: ${esc((s.coverage ?? []).join(", "))}</div><div style="margin-top:6px">${esc(s.how_to_use)}</div>
        ${s.found_by ? `<div class="sub" style="margin-top:8px"><b>How it was found:</b> ${esc(s.found_by)}</div>` : ""}</div>`).join("") || `<div class="empty"><b>No signal passed the evidence check</b>${esc(b.bottomLine)}</div>`}
      ${startup && !app.keys.search ? `<div class="rowx" style="margin:0 0 16px"><span class="sub">Signals about people:</span>${gap("search", b.signals.some((x) => x.person) ? "Saved ones only" : "None on a new run", "Signals about a person (their own posts, a new role) come from Exa search, which is not set up. A new run of this account will not find any.")}</div>` : ""}
      ${(b.signalChecks ?? []).length ? `<h4>Everything the agent checked</h4><div class="card checks">${b.signalChecks.map((c) => `<div class="check ${esc(c.status)}"><span class="mark" aria-hidden="true">${c.status === "found" ? "✓" : c.status === "error" ? "!" : "–"}</span><b>${esc(c.name)}</b><span class="sub">${c.status === "needs_key" ? gap("search", "Not checked", "This signal comes from Exa search, which is not set up in this copy of the app.") : esc(c.detail)}</span></div>`).join("")}
        <div class="rowx"><button class="link" data-view="signals">How each signal is fetched</button></div></div>` : ""}
      ${b.rejected.length ? `<h4>Considered and rejected</h4>${b.rejected.map((r) => `<div class="card"><strong>${esc(r.candidate)}</strong><div class="sub">${esc(r.reason)}</div></div>`).join("")}` : ""}`,
    People: () => `
      ${startup && !app.keys.search ? `<div class="rowx" style="margin:0 0 16px"><span class="sub">People search:</span>${gap("search", "Limited", "Exa search is not set up, so a new run uses a free search that finds fewer people and no public profiles. The people below were saved earlier.")}</div>` : ""}
      ${b.people.map((p, i) => `<div class="card"><h3>${esc(p.name)}</h3><div class="sub">${esc(p.title)} ${src(p.source_id)}</div>
        <div class="rowx"><span class="pill">${esc(p.role)}</span><span class="pill">confidence: ${esc(p.confidence)}</span></div>
        <p style="margin:8px 0 0">${esc(p.why)}</p>
        ${b.signals.filter((x) => x.person === p.name).map((x) => `<blockquote><b>Signal about them:</b> ${esc(x.headline)} ${src(x.source_id)}</blockquote>`).join("")}
        ${p.likely_reports?.length ? `<div class="sub">Likely reports (inference): ${esc(p.likely_reports.join(", "))}</div>` : ""}
        <div class="rowx">${p.profile_url ? `<a class="ghost" href="${esc(p.profile_url)}" target="_blank" rel="noopener">LinkedIn profile ↗</a>` : `<a class="ghost" href="${esc(p.find_url ?? li(`${p.name} ${b.account.name}`))}" target="_blank" rel="noopener">Find on LinkedIn ↗</a>${startup && !app.keys.search ? gap("search", "Profile link", "No direct LinkedIn profile is linked because Exa search is not set up, and Exa is what finds public profiles. Use the search link beside this instead.") : ""}`}
          ${copyBtn(p.name, "Copy name")}${emailRow(p, i)}</div>${phoneRow(p) ? `<div class="rowx">${phoneRow(p)}</div>` : ""}${directPhoneRow(p, i) ? `<div class="rowx">${directPhoneRow(p, i)}</div>` : ""}</div>`).join("") || '<div class="empty"><b>No named contact found</b>Nothing in public sources names a buyer here.</div>'}
      ${canApollo ? `<h4>Other people at the company (Apollo)</h4>${b.apolloContacts ? (b.apolloContacts.length ? b.apolloContacts.map((c) => `<div class="card" style="padding:14px 20px"><div class="rowx" style="margin:0;justify-content:space-between"><div><strong>${esc(c.first_name)} ${esc(c.last_name_hidden)}</strong> ${c.role && c.role !== "Other" ? `<span class="pill">${esc(c.role)}</span>` : ""}<div class="sub">${esc(c.title)}${c.why ? ` · ${esc(c.why)}` : ""}</div></div>
          ${c.has_email ? `<button class="ghost" data-contact="${esc(c.id)}">Reveal name and email ${cost(apollo.cost.email)}</button>` : '<span class="sub">No email on file</span>'}</div></div>`).join("") : '<p class="sub">Apollo lists no other senior contacts here.</p>')
        : `<div class="rowx" style="margin-top:0"><button class="ghost" data-contacts>Search Apollo for more senior contacts ${cost(apollo.cost.contacts)}</button></div>`}<p class="sub">Apollo hides last names and emails until you reveal a contact. Nothing is spent without your confirmation.</p>`
        : startup && b.account.domain ? `<h4>Other people at the company (Apollo)</h4>${needKey("apollo", "More contacts would appear here", "Senior people in finance, operations, legal, people and security, ranked by their part in an insurance purchase, with a button to look up each work email.", "rows")}` : ""}
      ${(b.personasToFind ?? []).length ? `<h4>Roles with no named person</h4><div class="chips">${b.personasToFind.map((x) => `<a class="chip" href="${esc(x.find_url)}" target="_blank" rel="noopener">${esc(x.role)} ↗</a>`).join("")}</div><p class="sub">Each opens a LinkedIn search.</p>` : ""}`,
    Proof: () => (b.proof ?? []).map((x) => `<div class="card"><div class="rowx" style="margin:0 0 6px;justify-content:space-between"><h3>${esc(x.customer)}</h3><a class="ghost" href="${esc(x.url)}" target="_blank" rel="noopener">Read on corgi.insure ↗</a></div>
        <div class="sub">${esc(x.what)}</div>
        <h4>Why the agent matched them</h4><p style="margin:0">${esc(x.why_similar)}</p><p class="sub" style="margin:4px 0 0">The agent's reasoning, not a Corgi claim. Only the one-liner and the quote below go into messages.</p>
        ${block("One-liner for a message", `${x.customer}: ${x.situation.charAt(0).toLowerCase()}${x.situation.slice(1)}. ${x.result}.`)}
        ${block(`Quote · ${x.speaker}`, `“${x.quote}”`)}
        ${x.quoteUrl && x.quoteUrl !== x.url ? `<p class="sub">The quote is on <a href="${esc(x.quoteUrl)}" target="_blank" rel="noopener">Corgi's homepage</a>; the story is on the page linked above.</p>` : ""}</div>`).join("")
      || `<div class="empty"><b>No close customer story</b>${b.account.segment === "trucking" ? "Corgi has published no customer story for trucking, so the messages use no customer proof." : "None of Corgi's published customer stories matches this account's situation closely enough, so the messages use a product claim."}</div>`,
    Messages: () => b.messages.map((m, i) => `<div class="card ${flash ? "flash" : ""}"><h3>${esc(m.contact)}</h3><div class="sub">${esc(m.title)}</div>
        <div class="sub" style="margin-top:6px">${m.nurture ? "Nurture draft: no signal passed. " : ""}Signal used: ${esc(m.signal_used ?? "none")}${m.proof_used ? ` · Customer story: ${esc(m.proof_used)}` : ""}</div>
        ${m.lint?.length ? `<div class="lint">${m.lint.map(esc).join(" · ")}</div>` : ""}
        ${m.corrections?.length ? `<div class="sub" style="margin-top:6px">Corrected automatically: ${m.corrections.map(esc).join("; ")}.</div>` : ""}
        ${block("Call opener", m.call_opener)}${block(`Email · subject: ${m.email.subject}`, m.email.body)}${block("Follow-up email", m.followup)}${block("LinkedIn connection note", m.linkedin_note)}${block("LinkedIn message", m.linkedin_dm)}
        <p class="sub">Why this works: ${esc(m.why)}</p>
        <div class="rowx">${mailBtn(m)}${profileBtn(m)}</div>
        <h4>Comment to change these messages</h4>
        ${app.keys.model ? `<div class="comment"><input data-comment="${i}" placeholder="e.g. shorter, lead with the new office, less formal" aria-label="Comment on ${esc(m.contact)}'s messages"><button class="ghost" data-rewrite="${i}">Rewrite</button></div>`
          : `<div class="comment off"><input disabled placeholder="Rewriting needs the AI model key"><button class="ghost" data-keys="model">How to set it up</button></div>`}
        <div class="rowx"><button class="ghost" data-feedback="${i}">👎 Not good</button><span class="sub">saves the reason so future drafts for any account avoid it</span></div></div>`).join("") || '<div class="empty"><b>No drafts</b>The agent does not write outreach without a usable signal and a named contact.</div>',
    Sources: () => (!b.sources.length ? '<div class="empty"><b>No sources collected</b></div>' : b.sources.map((s) => `<div class="card" style="padding:14px 20px"><div class="rowx" style="margin:0 0 4px"><span class="pill mono">${esc(s.id)}</span><span class="pill">${esc(s.kind)}</span><span class="mono sub">${esc(s.date ?? "")}</span></div><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a><div class="sub">${esc(s.excerpt)}</div></div>`).join("")),
  };
  $("#brief").innerHTML = `
    <div class="bhead">
      <div class="row1"><div><h2>${esc(b.account.name)}</h2>
        <div class="sub mono">${esc([b.account.domain, b.account.segment, b.account.usdot && `USDOT ${b.account.usdot}`, `run ${b.ranAt.slice(0, 10)}`, b.model ?? "no model"].filter(Boolean).join(" · "))}</div></div>
        <div class="rowx headbtns" style="margin:0"><button class="ghost only-small" data-tochat>← Chat</button><button class="ghost not-small" data-full aria-pressed="${$("#main").classList.contains("full")}">${$("#main").classList.contains("full") ? "← Back to chat" : "⤢ Full screen"}</button><a class="ghost" href="/?run=${encodeURIComponent(b.account.slug)}" target="_blank" rel="noopener">New tab ↗</a></div></div>
      <div class="verdict ${tone(b.verdict.label)}"><strong>${esc(b.verdict.label)}</strong> · ${esc(b.verdict.reason)}</div>
      <div class="tabs">${tabs.map(([t, n]) => `<button class="${t === tab ? "on" : ""}" data-tab="${t}">${t}${n === undefined ? "" : unanalyzed && WAITING[t] ? '<span class="n" title="Not analyzed: needs the AI model key">–</span>' : `<span class="n">${n}</span>`}</button>`).join("")}</div>
    </div>
    <div class="bbody">${unanalyzed && WAITING[tab] ? needKey("model", ...WAITING[tab]) : views[tab]()}</div>`;
}

// Every paid lookup goes through here: say what it costs, wait for a yes, then spend.
async function spend(action, payload, { what, credits }) {
  if (credits > 0) {
    const ok = await dialog({ title: `Spend ${credits} Apollo credit${credits > 1 ? "s" : ""}?`, body: `${esc(what)}<br><br>Credits used from this app so far: <b>${apollo.creditsUsed}</b>.`, confirm: `Spend ${credits} credit${credits > 1 ? "s" : ""}` });
    if (!ok) return;
  }
  $("#brief .bbody").insertAdjacentHTML("afterbegin", loader("Asking Apollo", what, "inline"));
  const res = await post(`/api/apollo/${action}`, { slug: current.account.slug, confirm: credits > 0, ...payload });
  const error = res.ok ? null : (await res.json()).error;
  await openRun(current.account.slug, tab);
  if (error) add(esc(`Apollo: ${error}`), "msg bot error");
}

// ---------- Wiring ----------

$("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#input").value.trim();
  if (!text) return;
  $("#input").value = "";
  send(text);
});
$("#new").addEventListener("click", () => { document.querySelectorAll(".navlink.on").forEach((el) => el.classList.remove("on")); home(); });
document.addEventListener("keydown", (e) => e.key === "Enter" && e.target.dataset?.add && (e.preventDefault(), document.querySelector(`[data-addbtn="${e.target.dataset.add}"][data-g="${e.target.dataset.g}"]`).click()));
$("#menu").addEventListener("click", () => document.body.classList.toggle("menu"));

// ---------- Layout: collapsible sidebar, and drag handles for the sidebar and the report ----------
const layout = { get: (k) => { try { return localStorage.getItem(`ai.${k}`); } catch { return null; } }, set: (k, v) => { try { v === null ? localStorage.removeItem(`ai.${k}`) : localStorage.setItem(`ai.${k}`, v); } catch {} } };
const setVar = (name, px) => document.documentElement.style.setProperty(name, `${px}px`);
// The rail only exists on wide screens; on a small screen the sidebar is a drawer and is never collapsed.
const wide = matchMedia("(min-width: 861px)");
function collapse(on) {
  document.body.classList.toggle("collapsed", on && wide.matches);
  $("#collapse").textContent = on ? "»" : "«";
  $("#collapse").setAttribute("aria-expanded", String(!on));
  $("#collapse").title = on ? "Expand sidebar" : "Collapse sidebar";
  $("#collapse").setAttribute("aria-label", $("#collapse").title);
  layout.set("collapsed", on ? "1" : null);
}
$("#collapse").addEventListener("click", () => collapse(!document.body.classList.contains("collapsed")));
// A drag handle: pointer or arrow keys change one width; double-click puts it back.
function resizer(el, { cssVar, key, min, max, from }) {
  const apply = (px) => { const w = Math.round(Math.min(max(), Math.max(min, px))); setVar(cssVar, w); layout.set(key, String(w)); };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    document.body.classList.add("resizing");
    const move = (ev) => apply(ev.clientX - from());
    const stop = () => { el.classList.remove("dragging"); document.body.classList.remove("resizing"); el.removeEventListener("pointermove", move); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", stop, { once: true });
    el.addEventListener("pointercancel", stop, { once: true });
  });
  el.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    apply(el.previousElementSibling.getBoundingClientRect().width + (e.key === "ArrowRight" ? 24 : -24));
  });
  el.addEventListener("dblclick", () => { document.documentElement.style.removeProperty(cssVar); layout.set(key, null); });
  if (layout.get(key)) setVar(cssVar, Number(layout.get(key)));
}
resizer($("#rs-side"), { cssVar: "--side-w", key: "side", min: 208, max: () => 420, from: () => 0 });
resizer($("#rs-brief"), { cssVar: "--chat-w", key: "chat", min: 300, max: () => Math.max(320, $("#main").getBoundingClientRect().width - 380), from: () => $("#main").getBoundingClientRect().left });
if (layout.get("collapsed")) collapse(true);
wide.addEventListener("change", () => document.body.classList.toggle("collapsed", Boolean(layout.get("collapsed")) && wide.matches));
document.addEventListener("pointerdown", (e) => document.body.classList.contains("menu") && !e.target.closest("#side, #menu") && document.body.classList.remove("menu"));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#modal").hidden && $("#main").classList.contains("full")) { $("#main").classList.remove("full"); if (current) render(); } });
document.addEventListener("keydown", (e) => e.key === "Enter" && e.target.dataset?.comment !== undefined && document.querySelector(`[data-rewrite="${e.target.dataset.comment}"]`).click());

document.addEventListener("click", async (e) => {
  const t = e.target.closest("button, .acct, .item, tr[data-open]");
  if (!t || (t.closest("#modal") && t.dataset.copy === undefined) || t.id === "new" || t.id === "menu") return;
  if (t.dataset.signout !== undefined) { await post("/api/logout", {}); return location.replace("/login"); }
  if (t.dataset.keys) return keysDialog(t.dataset.keys);
  if (t.dataset.full !== undefined) { $("#main").classList.toggle("full"); return render(); }
  if (t.dataset.tochat !== undefined) return $("#main").classList.remove("view-brief");
  if (t.id === "toreport") return $("#main").classList.add("view-brief");
  if (t.dataset.view) return t.dataset.view === "signals" ? signalsPage() : ((pos = null), settingsPage());
  if (t.closest(".pagebody") && (t.dataset.rm || t.dataset.addbtn || t.dataset.addgroup !== undefined || t.dataset.rmgroup !== undefined || t.dataset.rmstory !== undefined || t.dataset.story !== undefined || t.dataset.section || t.dataset.save)) return settingsClick(t);
  if (t.dataset.del) {
    const run = runs.find((r) => r.slug === t.dataset.del);
    if (!(await dialog({ title: `Delete ${run.name}?`, body: "This removes the research, the drafts and the conversation for this account. It cannot be undone.", confirm: "Delete" }))) return;
    await fetch(`/api/runs/${encodeURIComponent(run.slug)}`, { method: "DELETE" });
    return current?.account.slug === run.slug ? home() : refresh();
  }
  if (t.dataset.clear !== undefined) {
    if (!(await dialog({ title: "Clear this conversation?", body: `The research and drafts for ${esc(current.account.name)} stay. Only the chat is removed.`, confirm: "Clear chat" }))) return;
    await fetch(`/api/runs/${encodeURIComponent(current.account.slug)}/chat`, { method: "DELETE" });
    return openRun(current.account.slug, tab);
  }
  if (t.dataset.send) return send(t.dataset.send);
  if (t.dataset.open) return openRun(t.dataset.open);
  if (t.dataset.tab) { tab = t.dataset.tab; return render(); }
  if (t.dataset.reveal !== undefined) return spend("reveal", { personIndex: Number(t.dataset.reveal) }, { what: `Look up the work email and company phone line for ${current.people[t.dataset.reveal].name}.`, credits: apollo.cost.email });
  if (t.dataset.phone !== undefined) return spend("phone", { personIndex: Number(t.dataset.phone) }, { what: `Ask Apollo for ${current.people[t.dataset.phone].name}'s direct and mobile numbers. Apollo charges mobile credits only if it finds a number; ${apollo.cost.phone} is the rate set for your plan, so check it matches. The number arrives a few minutes later.`, credits: apollo.cost.phone });
  if (t.dataset.contact) return spend("reveal", { contactId: t.dataset.contact }, { what: "Reveal this contact's full name, work email and company phone line.", credits: apollo.cost.email });
  if (t.dataset.contacts !== undefined) return spend("contacts", {}, { what: "Searching for senior contacts (free)", credits: apollo.cost.contacts });
  if (t.dataset.company !== undefined) return spend("company", {}, { what: `Add Apollo's headcount, revenue and funding estimates for ${current.account.name}.`, credits: apollo.cost.company });
  if (t.dataset.copy !== undefined) {
    if (t.classList.contains("is-copied")) return;
    try { await navigator.clipboard.writeText(t.dataset.copy); }
    catch { const ta = Object.assign(document.createElement("textarea"), { value: t.dataset.copy }); document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
    const icon = t.querySelector(".copy-btn__icon"), label = t.querySelector(".copy-btn__label");
    t.classList.add("is-copied"); icon.textContent = "✓"; label.textContent = "Copied";
    return setTimeout(() => { t.classList.remove("is-copied"); icon.textContent = "⧉"; label.textContent = t.dataset.label; }, 1600);
  }
  if (t.dataset.rewrite !== undefined) {
    const input = document.querySelector(`[data-comment="${t.dataset.rewrite}"]`);
    const comment = input.value.trim();
    if (!comment) return input.focus();
    const m = current.messages[Number(t.dataset.rewrite)];
    t.closest(".card").insertAdjacentHTML("afterbegin", loader("Rewriting", `Applying your comment to ${m.contact}'s messages`, "inline"));
    t.disabled = true;
    const res = await post("/api/revise", { slug: current.account.slug, contact: m.contact, comment });
    const error = res.ok ? null : (await res.json()).error;
    await openRun(current.account.slug, "Messages", !error);
    return error && add(esc(`Could not rewrite: ${error}`), "msg bot error");
  }
  if (t.dataset.feedback !== undefined) {
    const m = current.messages[Number(t.dataset.feedback)];
    const reason = await dialog({ title: "What is wrong with this draft?", body: "The agent reads this before it writes the next one.", confirm: "Save feedback", input: true });
    if (!reason) return;
    await post("/api/feedback", { account: current.account.name, contact: m.contact, message: m.email.body, reason });
    t.textContent = "✓ Saved. The next draft will take it into account.";
    return t.classList.add("ok");
  }
  if (t.classList.contains("acct") && !e.target.closest("a")) openRun(t.dataset.slug);
});

const params = new URLSearchParams(location.search);
refresh().then(() => (params.get("view") === "signals" ? signalsPage() : params.get("view") === "settings" ? settingsPage() : params.get("run") ? openRun(params.get("run"), params.get("tab") ?? undefined) : home())).then(() => { if (params.get("full") && current) { $("#main").classList.add("full"); render(); } if (params.get("side") === "collapsed") collapse(true); return params.get("keys") && keysDialog(params.get("keys")); }).catch(offline);
window.addEventListener("unhandledrejection", (e) => e.reason instanceof TypeError && offline());
