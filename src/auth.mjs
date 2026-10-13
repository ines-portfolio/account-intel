// Sign-in for a shared or hosted copy. Off unless AUTH_ENABLED=true, so a local copy opens straight into the app.
// Accounts are listed in AUTH_USERS (see .env.example). The owner can do everything; guests cannot spend Apollo
// credits, edit the positioning or delete accounts, and have a daily limit on new research runs.
import "./env.mjs";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const WEEK = 7 * 86_400_000;
const secret = process.env.SESSION_SECRET || randomBytes(32).toString("hex"); // without a fixed secret, sessions end when the app restarts

export function users() {
  try { return JSON.parse(process.env.AUTH_USERS || "[]").filter((u) => u.email && u.password); } catch { return []; }
}
export const authEnabled = () => process.env.AUTH_ENABLED === "true" && users().length > 0;

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const sign = (payload) => createHmac("sha256", secret).update(payload).digest("base64url");

export function sessionCookie(user, secure) {
  const payload = Buffer.from(JSON.stringify({ email: user.email, exp: Date.now() + WEEK })).toString("base64url");
  return `ai_session=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${WEEK / 1000}${secure ? "; Secure" : ""}`;
}
export const clearCookie = "ai_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";

export function currentUser(cookieHeader) {
  const token = String(cookieHeader ?? "").split(/;\s*/).find((c) => c.startsWith("ai_session="))?.slice("ai_session=".length);
  const [payload, mac] = String(token ?? "").split(".");
  if (!payload || !mac || !same(mac, sign(payload))) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return exp > Date.now() ? users().find((u) => u.email.toLowerCase() === String(email).toLowerCase()) ?? null : null;
  } catch { return null; }
}

// Eight tries per address every ten minutes.
const attempts = new Map();
export function checkLogin(email, password, ip) {
  const now = Date.now(), log = (attempts.get(ip) ?? []).filter((t) => now - t < 600_000);
  if (log.length >= 8) return { error: "Too many attempts. Wait ten minutes and try again.", status: 429 };
  attempts.set(ip, [...log, now]);
  const user = users().find((u) => u.email.toLowerCase() === String(email ?? "").trim().toLowerCase());
  // Compare against something even when the email is unknown, so timing does not reveal which emails exist.
  if (!same(password ?? "", user?.password ?? randomBytes(12).toString("hex")) || !user) return { error: "That email and password do not match.", status: 401 };
  attempts.delete(ip);
  return { user };
}

const runsToday = new Map();
export function guestMayRun(user) {
  if (user.role === "owner") return true;
  const key = `${user.email}:${new Date().toISOString().slice(0, 10)}`, limit = Number(process.env.GUEST_DAILY_RUNS) || 15;
  if ((runsToday.get(key) ?? 0) >= limit) return false;
  runsToday.set(key, (runsToday.get(key) ?? 0) + 1);
  return true;
}

// Free notifications: an ntfy.sh topic (phone push, no account), a Slack incoming webhook, or WhatsApp through CallMeBot. Never blocks a request.
export function notify(text) {
  const send = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(8000) }).catch(() => {});
  if (process.env.NOTIFY_SLACK_WEBHOOK) send(process.env.NOTIFY_SLACK_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  if (process.env.NOTIFY_WHATSAPP_PHONE && process.env.NOTIFY_WHATSAPP_APIKEY) send(`https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(process.env.NOTIFY_WHATSAPP_PHONE)}&apikey=${encodeURIComponent(process.env.NOTIFY_WHATSAPP_APIKEY)}&text=${encodeURIComponent(text)}`, {});
  if (process.env.NOTIFY_NTFY_TOPIC) send(`https://ntfy.sh/${encodeURIComponent(process.env.NOTIFY_NTFY_TOPIC)}`, { method: "POST", headers: { Title: "Account Intel" }, body: text });
}
