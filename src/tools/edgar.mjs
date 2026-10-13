// Form D filings (private fundraising notices) from SEC full-text search. No key; SEC asks for a contact string.
export async function formD(companyName) {
  const ua = process.env.SEC_USER_AGENT || "AccountIntel/0.1 (set SEC_USER_AGENT in .env)";
  const start = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${companyName}"`)}&forms=D&dateRange=custom&startdt=${start}&enddt=${end}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const needle = companyName.toLowerCase();
    return ((await res.json()).hits?.hits ?? [])
      .map((h) => h._source)
      // Keep the company's own filings; drop investor vehicles that merely carry its name ("Ramp 39, a Series of ... Ventures").
      .filter((s) => (s.display_names ?? []).some((n) => n.toLowerCase().startsWith(needle) && !/series of|fund|spv|ventures|partners|holdings|opportunit/i.test(n)))
      .map((s) => ({
        issuer: s.display_names[0],
        form: s.form,
        filed: s.file_date,
        state: s.biz_states?.[0] ?? null,
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${s.ciks?.[0]}&type=D`,
      }))
      .sort((a, b) => b.filed.localeCompare(a.filed));
  } catch {
    return [];
  }
}
