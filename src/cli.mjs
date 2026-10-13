// Run one account from the terminal: npm run run-account -- "ramp.com"
import { runAccount } from "./pipeline.mjs";

const input = process.argv.slice(2).join(" ");
if (!input) {
  console.error('Usage: npm run run-account -- "<domain | company name | USDOT number>"');
  process.exit(1);
}
const brief = await runAccount(input, (e) => e.type === "stage" && e.status !== "running" && console.log(`${e.status.padEnd(8)} ${e.id.padEnd(9)} ${e.detail}`));
console.log(`\n${brief.account.name}: ${brief.verdict.label}\n${brief.verdict.reason}\nSaved to runs/${brief.account.slug}/`);
