// Trucking insurance signal from FMCSA public filings (data.transportation.gov, no key).
// Usage: node src/tools/fmcsa.mjs <USDOT number | "legal name"> [--save <dir>]
//
// Every interstate for-hire carrier must keep liability insurance on file with FMCSA.
// When a policy is being terminated, the filing shows the date coverage ends. If no
// replacement is on file, the carrier has a public deadline to buy insurance.

import { pathToFileURL } from "node:url";

const BASE = "https://data.transportation.gov/resource";
const DS = {
  census: "az4n-8mr2", // Company Census File: fleet size, status, officers
  authority: "inys-ebih", // Motus Carrier: operating authority status
  active: "c5y8-a4uz", // Motus Insur: active/pending policies
  history: "3uet-3z4i", // Motus InsHist: ended or ending policies
  legacyHistory: "6sqe-dvqs", // pre-Motus history, frozen mid-2026
};
const LIABILITY_FORMS = new Set(["BMC-91", "BMC-91X"]);
// Fleet size Corgi's trucking AE post calls the "sweet spot".
const FLEET_MIN = 20;
const FLEET_MAX = 200;

async function soda(dataset, params) {
  const url = `${BASE}/${dataset}.json?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMCSA ${dataset} ${res.status}: ${await res.text()}`);
  return res.json();
}

const ymd = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
const pretty = (s) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s);
const daysBetween = (a, b) =>
  Math.round((Date.parse(pretty(b)) - Date.parse(pretty(a))) / 86_400_000);

export async function findCarrier(nameOrDot) {
  if (/^\d+$/.test(nameOrDot)) return soda(DS.census, { dot_number: nameOrDot });
  const name = nameOrDot.toUpperCase().replaceAll("'", "''");
  return soda(DS.census, {
    $where: `legal_name like '%${name}%' OR dba_name like '%${name}%'`,
    $limit: 10,
    $order: "power_units DESC",
  });
}

export async function insuranceSignal(dot, today = new Date()) {
  const now = ymd(today);
  const [census, authority, active, history, legacy] = await Promise.all([
    soda(DS.census, { dot_number: dot }),
    soda(DS.authority, { usdot_number: dot }),
    soda(DS.active, { usdot_number: dot }),
    soda(DS.history, { usdot_number: dot, $order: "effective_date" }),
    soda(DS.legacyHistory, { $where: `dot_number like '%${dot}'`, $limit: 500 }),
  ]);
  const raw = { census, authority, active, history, legacy };
  const carrier = census[0];
  if (!carrier) return { dot, verdict: "not_found", raw };

  const powerUnits = Number(carrier.power_units ?? 0);
  const liability = active.filter(
    (p) => LIABILITY_FORMS.has(p.ins_form_code) && p.ins_class_code !== "E",
  );
  const ending = history
    .filter(
      (h) =>
        LIABILITY_FORMS.has(h.ins_form_code) &&
        h.cancl_effective_date > now &&
        liability.some((p) => p.policy_no === h.policy_no && p.effective_date === h.effective_date),
    )
    .sort((a, b) => a.cancl_effective_date.localeCompare(b.cancl_effective_date))[0];
  const replacement = ending
    ? liability.find((p) => p.effective_date > ending.effective_date)
    : undefined;

  // Earlier end-dates filed against the policy that is still active: notices that were reversed.
  const reversedNotices = ending
    ? legacy.filter(
        (l) => l.policy_no === ending.policy_no && (l.cancl_method ?? "").includes("CANCL"),
      ).length
    : 0;
  const insurersSince2021 = [
    ...new Set(
      [
        ...legacy
          .filter((l) => Number(l.effective_date.slice(6)) >= 2021)
          .map((l) => l.name_company.toUpperCase()),
        ...history
          .filter((h) => LIABILITY_FORMS.has(h.ins_form_code))
          .map((h) => h.insurance_company_name.toUpperCase()),
        ...liability.map((p) => p.insurance_company_name.toUpperCase()),
      ].map((n) => n.replace(/[.,]/g, "").trim()),
    ),
  ];

  const facts = {
    dot,
    legalName: carrier.legal_name,
    dba: carrier.dba_name ?? null,
    location: `${carrier.phy_city}, ${carrier.phy_state}`,
    powerUnits,
    drivers: Number(carrier.total_drivers ?? 0),
    usdotStatus: carrier.status_code === "A" ? "active" : "inactive",
    authorityActive: authority.some(
      (a) => a.op_auth_status === "Active" && /Motor Carrier/.test(a.op_auth_type ?? ""),
    ),
    officers: [carrier.company_officer_1, carrier.company_officer_2].filter(Boolean),
    phone: carrier.phone ?? null, // business line on the federal registration
    safetyRating: carrier.safety_rating ?? null,
    currentInsurer: liability[0]?.insurance_company_name ?? null,
    currentPolicyStart: pretty(liability[0]?.effective_date) ?? null,
    insurersSince2021,
  };

  const disqualifiers = [];
  if (facts.usdotStatus !== "active") disqualifiers.push("USDOT status is inactive");
  if (!facts.authorityActive) disqualifiers.push("no active motor-carrier authority");
  if (powerUnits < FLEET_MIN || powerUnits > FLEET_MAX)
    disqualifiers.push(`fleet of ${powerUnits} power units is outside ${FLEET_MIN}-${FLEET_MAX}`);

  let signal = null;
  if (ending && !replacement) {
    signal = {
      type: "coverage_end_date_no_replacement",
      strength: reversedNotices > 0 ? "moderate" : "strong",
      insurer: ending.insurance_company_name,
      policyNo: ending.policy_no,
      policyStart: pretty(ending.effective_date),
      coverageEnds: pretty(ending.cancl_effective_date),
      daysLeft: daysBetween(now, ending.cancl_effective_date),
      filingReason: ending.filing_status_reason ?? null,
      reversedNoticesOnThisPolicy: reversedNotices,
    };
  } else if (ending && replacement) {
    signal = {
      type: "already_replaced",
      strength: "none",
      newInsurer: replacement.insurance_company_name,
      newPolicyStart: pretty(replacement.effective_date),
    };
  } else if (liability[0]) {
    // No end date on file. Policies usually run a year, so the anniversary is the best guess.
    const start = liability[0].effective_date;
    let next = `${now.slice(0, 4)}${start.slice(4)}`;
    if (next <= now) next = `${Number(now.slice(0, 4)) + 1}${start.slice(4)}`;
    const daysLeft = daysBetween(now, next);
    signal = {
      type: "renewal_anniversary_estimate",
      strength: daysLeft <= 90 ? "weak" : "none",
      estimatedRenewal: pretty(next),
      daysLeft,
      note: "Inference: assumes a 12-month policy term from the filed start date.",
    };
  }

  return {
    ...facts,
    verdict: disqualifiers.length ? "disqualified" : signal?.strength ?? "none",
    disqualifiers,
    signal,
    sources: [
      `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dot}`,
      `https://data.transportation.gov/resource/${DS.active}.json?usdot_number=${dot}`,
      `https://data.transportation.gov/resource/${DS.history}.json?usdot_number=${dot}`,
    ],
    checkedAt: today.toISOString(),
    raw,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [query, flag, dir] = process.argv.slice(2);
  if (!query) {
    console.error('Usage: node src/tools/fmcsa.mjs <USDOT number | "legal name"> [--save <dir>]');
    process.exit(1);
  }
  const matches = await findCarrier(query);
  if (matches.length !== 1) {
    console.log(
      matches.length
        ? matches.map((m) => `${m.dot_number}  ${m.legal_name}  ${m.phy_city}, ${m.phy_state}  ${m.power_units} units`).join("\n")
        : "No carrier found.",
    );
    process.exit(matches.length ? 0 : 1);
  }
  const { raw, ...result } = await insuranceSignal(matches[0].dot_number);
  if (flag === "--save" && dir) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(`${dir}/raw`, { recursive: true });
    for (const [name, rows] of Object.entries(raw))
      await writeFile(`${dir}/raw/fmcsa_${name}.json`, JSON.stringify(rows, null, 1));
    await writeFile(`${dir}/fmcsa_signal.json`, JSON.stringify(result, null, 1));
  }
  console.log(JSON.stringify(result, null, 1));
}
