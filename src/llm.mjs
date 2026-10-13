// One model client for every provider that speaks the OpenAI chat-completions format.
// The first configured option below wins. Set LLM_MODEL to override the model choice.
import "./env.mjs";

const PRESETS = [
  { env: "ANTHROPIC_API_KEY", provider: "Anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-opus-5-5", jsonMode: false },
  { env: "GEMINI_API_KEY", provider: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", prefer: /gemini-[\d.]+-flash$/, jsonMode: true },
  { env: "GROQ_API_KEY", provider: "Groq", baseUrl: "https://api.groq.com/openai/v1", prefer: /70b/, jsonMode: true },
  { env: "OPENROUTER_API_KEY", provider: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", prefer: /:free$/, jsonMode: false },
];
const OLLAMA = "http://localhost:11434/v1";

let cached;

async function listModels(baseUrl, apiKey) {
  try {
    const res = await fetch(`${baseUrl}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    return ((await res.json()).data ?? []).map((m) => m.id.replace(/^models\//, ""));
  } catch {
    return [];
  }
}

export async function llmConfig() {
  if (cached !== undefined) return cached;
  let cfg = null;
  if (process.env.LLM_BASE_URL) {
    cfg = { provider: "Custom", baseUrl: process.env.LLM_BASE_URL.replace(/\/$/, ""), apiKey: process.env.LLM_API_KEY ?? "", jsonMode: false };
  } else {
    const preset = PRESETS.find((p) => process.env[p.env]);
    if (preset) cfg = { ...preset, apiKey: process.env[preset.env] };
    else if ((await listModels(OLLAMA, "")).length) cfg = { provider: "Ollama (local)", baseUrl: OLLAMA, apiKey: "", jsonMode: true };
  }
  if (cfg) {
    cfg.model = process.env.LLM_MODEL || cfg.model;
    if (!cfg.model) {
      const models = await listModels(cfg.baseUrl, cfg.apiKey);
      const matches = cfg.prefer ? models.filter((m) => cfg.prefer.test(m)).sort().reverse() : [];
      cfg.model = matches[0] ?? models[0];
      const lite = models.filter((m) => /flash-lite$/.test(m)).sort().reverse();
      cfg.fallbacks = [...matches.slice(1, 5), ...lite.slice(0, 2)];
    }
    if (!cfg.model) cfg = null;
  }
  return (cached = cfg);
}

export async function chat({ system, user, json = false }) {
  const cfg = await llmConfig();
  if (!cfg) throw new Error("No model connected.");
  const body = { messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  if (json && cfg.jsonMode) body.response_format = { type: "json_object" };
  let lastError = "";
  // Free tiers are often busy or rate-limited. Try the current model, then the provider's other models, twice over.
  for (let pass = 1; pass <= 2; pass++) {
    for (const model of [cfg.model, ...(cfg.fallbacks ?? []).filter((m) => m !== cfg.model)]) {
      // A dropped connection or a model that hangs counts as "busy": move on to the next model.
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ ...body, model }),
        signal: AbortSignal.timeout(75000),
      }).catch((err) => ({ ok: false, status: 599, text: async () => `no response (${err.name})` }));
      if (res.ok) {
        cfg.model = model;
        return (await res.json()).choices?.[0]?.message?.content ?? "";
      }
      lastError = `${cfg.provider} (${model}) returned ${res.status}: ${(await res.text()).replace(/\s+/g, " ").slice(0, 200)}`;
      if (![404, 429].includes(res.status) && res.status < 500) throw new Error(lastError);
    }
    if (pass === 1) await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error(lastError);
}

// Asks for JSON and retries twice with the parse error if the reply is not valid JSON.
export async function chatJson({ system, user }) {
  let prompt = user;
  for (let attempt = 1; ; attempt++) {
    const text = await chat({ system, user: prompt, json: true });
    const body = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    try {
      return JSON.parse(body);
    } catch (err) {
      // Small models often leave a comma before a closing bracket or add a // comment line. Repair those before asking again.
      try { return JSON.parse(body.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")); } catch {}
      if (attempt === 3) throw new Error(`Model did not return valid JSON: ${err.message}`);
      prompt = `${user}\n\nYour previous reply was not valid JSON (${err.message}). Reply with the JSON object only.`;
    }
  }
}
