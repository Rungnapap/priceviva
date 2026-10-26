/**
 * npm run env:check — checks .env.local without printing any value.
 * Shows which PriceViva settings are set and flags dangerous mix-ups (e.g. a secret key in a NEXT_PUBLIC_ variable).
 */
import { supabaseEnvProblems } from "../src/lib/server/env-check";

const names = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "AWIN_DATAFEED_API_KEY", "AWIN_PUBLISHER_ID", "CRON_SECRET", "ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET", "CATALOG_SOURCE",
  "ALERT_EMAILS_ENABLED", "RESEND_API_KEY", "ALERT_EMAIL_FROM", "ALERT_EMAIL_SECRET",
];
console.log("PriceViva settings (values are never shown):");
for (const n of names) console.log(`  ${process.env[n]?.trim() ? "set    " : "not set"}  ${n}`);
const problems = supabaseEnvProblems(process.env);
if (problems.length === 0) {
  console.log("\nNo problems found.");
} else {
  console.log("");
  for (const p of problems) console.log(`${p.level === "error" ? "ERROR  " : "warning"}  ${p.variable} ${p.message}`);
}
process.exit(problems.some((p) => p.level === "error") ? 1 : 0);
